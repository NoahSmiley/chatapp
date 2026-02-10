import type { FastifyInstance } from "fastify";
import type { WebSocket, RawData } from "ws";
import { eq, and, or } from "drizzle-orm";
import { db, sqlite } from "../db/index.js";
import { messages, reactions, dmChannels, dmMessages } from "../db/schema.js";
import { validateMessageContent } from "@flux/shared";
import type { WSClientEvent, WSServerEvent } from "@flux/shared";
import { auth } from "../auth.js";
import { toWebHeaders } from "../util/headers.js";

interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  username: string;
  subscribedChannels: Set<string>;
  subscribedDMs: Set<string>;
  voiceChannelId: string | null;
}

const clients = new Map<WebSocket, ConnectedClient>();
const channelSubscriptions = new Map<string, Set<WebSocket>>();
const dmSubscriptions = new Map<string, Set<WebSocket>>();
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

function broadcastDM(dmChannelId: string, event: WSServerEvent) {
  const subs = dmSubscriptions.get(dmChannelId);
  if (!subs) return;
  const data = JSON.stringify(event);
  for (const ws of subs) {
    if (ws.readyState === ws.OPEN) {
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
  broadcastAll({ type: "voice_state", channelId, participants: users });
}

function sendCurrentVoiceStates(ws: WebSocket) {
  for (const [channelId, participants] of voiceParticipants) {
    const users = Array.from(participants.entries()).map(([userId, username]) => ({ userId, username }));
    ws.send(JSON.stringify({ type: "voice_state", channelId, participants: users }));
  }
}

function sendOnlineUsers(ws: WebSocket) {
  const onlineUserIds = new Set<string>();
  for (const [, client] of clients) {
    onlineUserIds.add(client.userId);
  }
  for (const userId of onlineUserIds) {
    ws.send(JSON.stringify({ type: "presence", userId, status: "online" } satisfies WSServerEvent));
  }
}

// Prepared statement for FTS indexing
const ftsInsert = sqlite.prepare(`INSERT INTO messages_fts(message_id, plaintext) VALUES (?, ?)`);

export async function registerGateway(app: FastifyInstance) {
  app.get("/gateway", { websocket: true }, async (socket, request) => {
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
      subscribedDMs: new Set(),
      voiceChannelId: null,
    };
    clients.set(socket, client);

    broadcastPresence(user.id, "online");
    sendCurrentVoiceStates(socket);
    sendOnlineUsers(socket);

    socket.on("message", async (raw: RawData) => {
      try {
        const event: WSClientEvent = JSON.parse(raw.toString());
        await handleClientEvent(client, event);
      } catch {
        sendError(socket, "Invalid message format");
      }
    });

    socket.on("close", () => {
      for (const channelId of client.subscribedChannels) {
        const subs = channelSubscriptions.get(channelId);
        if (subs) {
          subs.delete(socket);
          if (subs.size === 0) channelSubscriptions.delete(channelId);
        }
      }
      for (const dmId of client.subscribedDMs) {
        const subs = dmSubscriptions.get(dmId);
        if (subs) {
          subs.delete(socket);
          if (subs.size === 0) dmSubscriptions.delete(dmId);
        }
      }
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
      if (!subs) { subs = new Set(); channelSubscriptions.set(event.channelId, subs); }
      subs.add(client.ws);
      break;
    }

    case "leave_channel": {
      client.subscribedChannels.delete(event.channelId);
      const subs = channelSubscriptions.get(event.channelId);
      if (subs) { subs.delete(client.ws); if (subs.size === 0) channelSubscriptions.delete(event.channelId); }
      break;
    }

    case "send_message": {
      const error = validateMessageContent(event.ciphertext);
      if (error) { sendError(client.ws, error); return; }

      const [message] = await db.insert(messages).values({
        channelId: event.channelId,
        senderId: client.userId,
        ciphertext: event.ciphertext,
        mlsEpoch: event.mlsEpoch,
      }).returning();

      // Index in FTS
      try {
        const plaintext = Buffer.from(event.ciphertext, "base64").toString("utf-8");
        ftsInsert.run(message.id, plaintext);
      } catch { /* non-critical */ }

      broadcast(event.channelId, {
        type: "message",
        message: {
          id: message.id, channelId: message.channelId, senderId: message.senderId,
          ciphertext: message.ciphertext, mlsEpoch: message.mlsEpoch, createdAt: message.createdAt,
          editedAt: message.editedAt ?? undefined,
        },
      });
      break;
    }

    case "typing_start": {
      broadcast(event.channelId, { type: "typing", channelId: event.channelId, userId: client.userId, active: true }, client.ws);
      break;
    }

    case "typing_stop": {
      broadcast(event.channelId, { type: "typing", channelId: event.channelId, userId: client.userId, active: false }, client.ws);
      break;
    }

    case "voice_state_update": {
      if (event.action === "join") {
        if (client.voiceChannelId) {
          const prev = client.voiceChannelId;
          removeFromVoiceChannel(prev, client.userId);
          broadcastVoiceState(prev);
        }
        client.voiceChannelId = event.channelId;
        addToVoiceChannel(event.channelId, client.userId, client.username);
        broadcastVoiceState(event.channelId);
      } else if (event.action === "leave") {
        if (client.voiceChannelId) {
          const prev = client.voiceChannelId;
          removeFromVoiceChannel(prev, client.userId);
          broadcastVoiceState(prev);
          client.voiceChannelId = null;
        }
      }
      break;
    }

    case "edit_message": {
      const [msg] = await db.select().from(messages).where(eq(messages.id, event.messageId));
      if (!msg) { sendError(client.ws, "Message not found"); return; }
      if (msg.senderId !== client.userId) { sendError(client.ws, "Cannot edit another user's message"); return; }

      const error = validateMessageContent(event.ciphertext);
      if (error) { sendError(client.ws, error); return; }

      const editedAt = new Date().toISOString();
      await db.update(messages).set({ ciphertext: event.ciphertext, editedAt }).where(eq(messages.id, event.messageId));

      // Update FTS index
      try {
        const plaintext = Buffer.from(event.ciphertext, "base64").toString("utf-8");
        sqlite.prepare(`DELETE FROM messages_fts WHERE message_id = ?`).run(event.messageId);
        ftsInsert.run(event.messageId, plaintext);
      } catch { /* non-critical */ }

      broadcast(msg.channelId, { type: "message_edit", messageId: event.messageId, ciphertext: event.ciphertext, editedAt });
      break;
    }

    case "add_reaction": {
      const [existing] = await db.select().from(reactions).where(
        and(eq(reactions.messageId, event.messageId), eq(reactions.userId, client.userId), eq(reactions.emoji, event.emoji))
      );
      if (existing) return;

      await db.insert(reactions).values({ messageId: event.messageId, userId: client.userId, emoji: event.emoji });

      const [msg] = await db.select().from(messages).where(eq(messages.id, event.messageId));
      if (msg) {
        broadcast(msg.channelId, { type: "reaction_add", messageId: event.messageId, userId: client.userId, emoji: event.emoji });
      }
      break;
    }

    case "remove_reaction": {
      await db.delete(reactions).where(
        and(eq(reactions.messageId, event.messageId), eq(reactions.userId, client.userId), eq(reactions.emoji, event.emoji))
      );
      const [msg] = await db.select().from(messages).where(eq(messages.id, event.messageId));
      if (msg) {
        broadcast(msg.channelId, { type: "reaction_remove", messageId: event.messageId, userId: client.userId, emoji: event.emoji });
      }
      break;
    }

    case "join_dm": {
      client.subscribedDMs.add(event.dmChannelId);
      let subs = dmSubscriptions.get(event.dmChannelId);
      if (!subs) { subs = new Set(); dmSubscriptions.set(event.dmChannelId, subs); }
      subs.add(client.ws);
      break;
    }

    case "leave_dm": {
      client.subscribedDMs.delete(event.dmChannelId);
      const subs = dmSubscriptions.get(event.dmChannelId);
      if (subs) { subs.delete(client.ws); if (subs.size === 0) dmSubscriptions.delete(event.dmChannelId); }
      break;
    }

    case "send_dm": {
      const error = validateMessageContent(event.ciphertext);
      if (error) { sendError(client.ws, error); return; }

      const [dmChannel] = await db.select().from(dmChannels).where(
        and(eq(dmChannels.id, event.dmChannelId), or(eq(dmChannels.user1Id, client.userId), eq(dmChannels.user2Id, client.userId)))
      );
      if (!dmChannel) { sendError(client.ws, "Not a participant of this DM"); return; }

      const [message] = await db.insert(dmMessages).values({
        dmChannelId: event.dmChannelId, senderId: client.userId, ciphertext: event.ciphertext, mlsEpoch: event.mlsEpoch,
      }).returning();

      const dmEvent: WSServerEvent = {
        type: "dm_message",
        message: {
          id: message.id, dmChannelId: message.dmChannelId, senderId: message.senderId,
          ciphertext: message.ciphertext, mlsEpoch: message.mlsEpoch, createdAt: message.createdAt,
        },
      };

      broadcastDM(event.dmChannelId, dmEvent);

      // Also send to the other user if they're connected but not subscribed to this DM
      const otherUserId = dmChannel.user1Id === client.userId ? dmChannel.user2Id : dmChannel.user1Id;
      const dmSubSet = dmSubscriptions.get(event.dmChannelId);
      for (const [ws, c] of clients) {
        if (c.userId === otherUserId && (!dmSubSet || !dmSubSet.has(ws)) && ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(dmEvent));
        }
      }
      break;
    }
  }
}

function broadcastPresence(userId: string, status: "online" | "offline") {
  const data = JSON.stringify({ type: "presence", userId, status } satisfies WSServerEvent);
  for (const [ws] of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}
