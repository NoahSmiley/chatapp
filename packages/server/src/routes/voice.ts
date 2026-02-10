import type { FastifyInstance } from "fastify";
import { AccessToken } from "livekit-server-sdk";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { channels, memberships } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { env } from "../env.js";

export async function voiceRoutes(app: FastifyInstance) {
  // Generate a LiveKit token for joining a voice channel
  app.post<{ Body: { channelId: string; viewer?: boolean } }>("/voice/token", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { channelId } = request.body;
    if (!channelId) return reply.status(400).send({ error: "channelId is required" });

    // Verify channel exists and is a voice channel
    const [channel] = await db.select().from(channels).where(eq(channels.id, channelId));
    if (!channel) return reply.status(404).send({ error: "Channel not found" });
    if (channel.type !== "voice") return reply.status(400).send({ error: "Not a voice channel" });

    // Verify user is a member of the server
    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.serverId, channel.serverId)));
    if (!membership) return reply.status(403).send({ error: "Not a member of this server" });

    // Generate LiveKit access token
    // Room name = channelId (1:1 mapping; LiveKit auto-creates/destroys rooms)
    const isViewer = request.body.viewer === true;
    const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
      identity: isViewer ? `${user.id}-viewer` : user.id,
      name: isViewer ? `${user.username} (viewer)` : user.username,
    });
    at.addGrant({
      roomJoin: true,
      room: channelId,
      canPublish: !isViewer,
      canSubscribe: true,
    });

    const token = await at.toJwt();

    return { token, url: env.LIVEKIT_URL };
  });
}
