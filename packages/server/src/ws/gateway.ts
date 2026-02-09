import type { FastifyInstance } from "fastify";
import type { WebSocket, RawData } from "ws";
import { db } from "../db/index.js";
import { messages } from "../db/schema.js";
import { validateMessageContent } from "@flux/shared";
import type { WSClientEvent, WSServerEvent } from "@flux/shared";
import { auth } from "../auth.js";
import { toWebHeaders } from "../util/headers.js";

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  username: string;
  subscribedChannels: Set<string>;
  voiceChannelId: string | null;
}

const clients = new Map<WebSocket, ConnectedClient>();

// Channel -> Set of WebSocket connections
const channelSubscriptions = new Map<string, Set<WebSocket>>();

// Voice channel occupancy: channelId -> Map<userId, username>
const voiceParticipants = new Map<string, Map<string, string>>();

function broadcast(channelId: string, event: WSServerEvent, exclude?: WebSocket) {
  const subs = channelSubscriptions.get(channelId);
  if (!subs) return;

  const data = JSON.stringify(event);
  for (const ws of subs) {
    if (ws !== exclude && ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

function broadcastAll(event: WSServerEvent, exclude?: WebSocket) {
  const data = JSON.stringify(event);
  for (const [ws] of clients) {
    if (ws !== exclude && ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

function sendError(ws: WebSocket, message: string) {
  const event: WSServerEvent = { type: "error", message };
  ws.send(JSON.stringify(event));
}

function addToVoiceChannel(channelId: string, userId: string, username: string) {
  let participants = voiceParticipants.get(channelId);
  if (!participants) {
    participants = new Map();
    voiceParticipants.set(channelId, participants);
  }
  participants.set(userId, username);
}

function removeFromVoiceChannel(channelId: string, userId: string) {
  const participants = voiceParticipants.get(channelId);
  if (participants) {
    participants.delete(userId);
    if (participants.size === 0) voiceParticipants.delete(channelId);
  }
}

function broadcastVoiceState(channelId: string) {
  const participants = voiceParticipants.get(channelId);
  const users = participants
    ? Array.from(participants.entries()).map(([userId, username]) => ({ userId, username }))
    : [];

  const event: WSServerEvent = {
    type: "voice_state",
    channelId,
    participants: users,
  };

  // Broadcast to ALL connected clients (sidebar needs this regardless of channel subscription)
  broadcastAll(event);
}

function sendCurrentVoiceStates(ws: WebSocket) {
  for (const [channelId, participants] of voiceParticipants) {
    const users = Array.from(participants.entries()).map(([userId, username]) => ({ userId, username }));
    const event: WSServerEvent = {
      type: "voice_state",
      channelId,
      participants: users,
    };
    ws.send(JSON.stringify(event));
  }
}

export async function registerGateway(app: FastifyInstance) {
  app.get("/gateway", { websocket: true }, async (socket, request) => {
    // Authenticate the WebSocket connection
    const session = await auth.api.getSession({
      headers: toWebHeaders(request.headers),
    });

    if (!session) {
      socket.close(4001, "Unauthorized");
      return;
    }

    const user = session.user as { id: string; username: string };

    const client: ConnectedClient = {
      ws: socket,
      userId: user.id,
      username: user.username,
      subscribedChannels: new Set(),
      voiceChannelId: null,
    };
    clients.set(socket, client);

    // Announce presence
    broadcastPresence(user.id, "online");

    // Send current voice states so sidebar populates immediately
    sendCurrentVoiceStates(socket);

    socket.on("message", async (raw: RawData) => {
      try {
        const event: WSClientEvent = JSON.parse(raw.toString());
        await handleClientEvent(client, event);
      } catch {
        sendError(socket, "Invalid message format");
      }
    });

    socket.on("close", () => {
      // Unsubscribe from all channels
      for (const channelId of client.subscribedChannels) {
        const subs = channelSubscriptions.get(channelId);
        if (subs) {
          subs.delete(socket);
          if (subs.size === 0) channelSubscriptions.delete(channelId);
        }
      }

      // Clean up voice state
      if (client.voiceChannelId) {
        removeFromVoiceChannel(client.voiceChannelId, client.userId);
        broadcastVoiceState(client.voiceChannelId);
      }

      clients.delete(socket);
      broadcastPresence(user.id, "offline");
    });
  });
}

async function handleClientEvent(client: ConnectedClient, event: WSClientEvent) {
  switch (event.type) {
    case "join_channel": {
      client.subscribedChannels.add(event.channelId);
      let subs = channelSubscriptions.get(event.channelId);
      if (!subs) {
        subs = new Set();
        channelSubscriptions.set(event.channelId, subs);
      }
      subs.add(client.ws);
      break;
    }

    case "leave_channel": {
      client.subscribedChannels.delete(event.channelId);
      const subs = channelSubscriptions.get(event.channelId);
      if (subs) {
        subs.delete(client.ws);
        if (subs.size === 0) channelSubscriptions.delete(event.channelId);
      }
      break;
    }

    case "send_message": {
      const error = validateMessageContent(event.ciphertext);
      if (error) {
        sendError(client.ws, error);
        return;
      }

      const [message] = await db
        .insert(messages)
        .values({
          channelId: event.channelId,
          senderId: client.userId,
          ciphertext: event.ciphertext,
          mlsEpoch: event.mlsEpoch,
        })
        .returning();

      broadcast(event.channelId, {
        type: "message",
        message: {
          id: message.id,
          channelId: message.channelId,
          senderId: message.senderId,
          ciphertext: message.ciphertext,
          mlsEpoch: message.mlsEpoch,
          createdAt: message.createdAt,
        },
      });
      break;
    }

    case "typing_start": {
      broadcast(
        event.channelId,
        { type: "typing", channelId: event.channelId, userId: client.userId, active: true },
        client.ws
      );
      break;
    }

    case "typing_stop": {
      broadcast(
        event.channelId,
        { type: "typing", channelId: event.channelId, userId: client.userId, active: false },
        client.ws
      );
      break;
    }

    case "voice_state_update": {
      if (event.action === "join") {
        // Leave any previous voice channel first
        if (client.voiceChannelId) {
          const prevChannel = client.voiceChannelId;
          removeFromVoiceChannel(prevChannel, client.userId);
          broadcastVoiceState(prevChannel);
        }
        // Join the new voice channel
        client.voiceChannelId = event.channelId;
        addToVoiceChannel(event.channelId, client.userId, client.username);
        broadcastVoiceState(event.channelId);
      } else if (event.action === "leave") {
        if (client.voiceChannelId) {
          const prevChannel = client.voiceChannelId;
          removeFromVoiceChannel(prevChannel, client.userId);
          broadcastVoiceState(prevChannel);
          client.voiceChannelId = null;
        }
      }
      break;
    }
  }
}

function broadcastPresence(userId: string, status: "online" | "offline") {
  const event: WSServerEvent = { type: "presence", userId, status };
  const data = JSON.stringify(event);
  for (const [ws] of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}
