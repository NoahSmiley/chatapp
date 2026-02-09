import type { FastifyInstance } from "fastify";
import { eq, and, lt, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { messages, channels, memberships } from "../db/schema.js";
import { MESSAGE_PAGE_SIZE, validateMessageContent } from "@flux/shared";
import { requireAuth } from "../middleware/auth.js";

export async function messageRoutes(app: FastifyInstance) {
  // Get message history for a channel (paginated)
  app.get<{
    Params: { channelId: string };
    Querystring: { cursor?: string; limit?: string };
  }>("/channels/:channelId/messages", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { channelId } = request.params;
    const limit = Math.min(parseInt(request.query.limit ?? String(MESSAGE_PAGE_SIZE), 10), 100);
    const cursor = request.query.cursor;

    // Verify user has access to this channel's server
    const [channel] = await db.select().from(channels).where(eq(channels.id, channelId));
    if (!channel) return reply.status(404).send({ error: "Channel not found" });

    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.serverId, channel.serverId)));

    if (!membership) return reply.status(403).send({ error: "Not a member of this server" });

    const conditions = [eq(messages.channelId, channelId)];
    if (cursor) {
      conditions.push(lt(messages.createdAt, cursor));
    }

    const items = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit + 1);

    const hasMore = items.length > limit;
    if (hasMore) items.pop();

    return {
      items: items.reverse(), // return in chronological order
      cursor: items.length > 0 ? items[0].createdAt : null,
      hasMore,
    };
  });
}
