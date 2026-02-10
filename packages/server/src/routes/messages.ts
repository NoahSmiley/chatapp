import type { FastifyInstance } from "fastify";
import { eq, and, lt, desc, inArray } from "drizzle-orm";
import { db, sqlite } from "../db/index.js";
import { messages, channels, memberships, reactions } from "../db/schema.js";
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

  // Search messages in a channel via FTS5
  app.get<{
    Params: { channelId: string };
    Querystring: { q: string };
  }>("/channels/:channelId/messages/search", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { channelId } = request.params;
    const query = request.query.q?.trim();
    if (!query) return reply.status(400).send({ error: "Missing query" });

    // Verify membership
    const [channel] = await db.select().from(channels).where(eq(channels.id, channelId));
    if (!channel) return reply.status(404).send({ error: "Channel not found" });

    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.serverId, channel.serverId)));
    if (!membership) return reply.status(403).send({ error: "Not a member" });

    // Try FTS5 first, fall back to in-memory search on base64-decoded ciphertext
    const safeQuery = query.replace(/['"]/g, "").replace(/\s+/g, " ");
    let ftsIds: string[] = [];
    try {
      const ftsResults = sqlite.prepare(`
        SELECT message_id FROM messages_fts WHERE plaintext MATCH ? LIMIT 50
      `).all(safeQuery) as { message_id: string }[];
      ftsIds = ftsResults.map((r) => r.message_id);
    } catch { /* FTS query failed */ }

    if (ftsIds.length > 0) {
      const items = await db
        .select()
        .from(messages)
        .where(and(eq(messages.channelId, channelId), inArray(messages.id, ftsIds)))
        .orderBy(desc(messages.createdAt))
        .limit(50);
      return { items };
    }

    // Fallback: load recent messages and filter in-memory by decoding base64
    const allMsgs = await db
      .select()
      .from(messages)
      .where(eq(messages.channelId, channelId))
      .orderBy(desc(messages.createdAt))
      .limit(500);

    const lowerQuery = query.toLowerCase();
    const items = allMsgs.filter((msg) => {
      try {
        const plaintext = Buffer.from(msg.ciphertext, "base64").toString("utf-8");
        return plaintext.toLowerCase().includes(lowerQuery);
      } catch { return false; }
    }).slice(0, 50);

    return { items: items.reverse() };
  });

  // Get reactions for a set of messages
  app.get<{
    Querystring: { ids: string };
  }>("/messages/reactions", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const ids = request.query.ids?.split(",").filter(Boolean) ?? [];
    if (ids.length === 0) return [];

    const items = await db
      .select()
      .from(reactions)
      .where(inArray(reactions.messageId, ids));

    return items;
  });
}
