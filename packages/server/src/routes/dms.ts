import type { FastifyInstance } from "fastify";
import { eq, and, or, lt, desc, like } from "drizzle-orm";
import { db } from "../db/index.js";
import { dmChannels, dmMessages, users } from "../db/schema.js";
import { MESSAGE_PAGE_SIZE } from "@flux/shared";
import { requireAuth } from "../middleware/auth.js";

export async function dmRoutes(app: FastifyInstance) {
  // List user's DM channels
  app.get("/dms", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const channels = await db
      .select()
      .from(dmChannels)
      .where(or(eq(dmChannels.user1Id, user.id), eq(dmChannels.user2Id, user.id)));

    // Enrich with the other user's info
    const result = [];
    for (const ch of channels) {
      const otherUserId = ch.user1Id === user.id ? ch.user2Id : ch.user1Id;
      const [otherUser] = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, otherUserId));
      if (otherUser) {
        result.push({ id: ch.id, otherUser, createdAt: ch.createdAt });
      }
    }

    return result;
  });

  // Create or get a DM channel with another user
  app.post<{ Body: { userId: string } }>("/dms", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const body = request.body as { userId?: string };
    const targetUserId = body?.userId;
    if (!targetUserId) return reply.status(400).send({ error: "Missing userId" });
    if (targetUserId === user.id) return reply.status(400).send({ error: "Cannot DM yourself" });

    // Check target exists
    const [target] = await db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, targetUserId));
    if (!target) return reply.status(404).send({ error: "User not found" });

    // Sort IDs for consistent storage
    const [id1, id2] = [user.id, targetUserId].sort();

    // Check for existing channel
    const [existing] = await db.select().from(dmChannels).where(
      and(eq(dmChannels.user1Id, id1), eq(dmChannels.user2Id, id2))
    );

    if (existing) {
      return { id: existing.id, otherUser: target, createdAt: existing.createdAt };
    }

    // Create new channel
    const [channel] = await db.insert(dmChannels).values({
      user1Id: id1,
      user2Id: id2,
    }).returning();

    return { id: channel.id, otherUser: target, createdAt: channel.createdAt };
  });

  // Get DM messages (paginated)
  app.get<{
    Params: { dmChannelId: string };
    Querystring: { cursor?: string };
  }>("/dms/:dmChannelId/messages", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { dmChannelId } = request.params;
    const cursor = request.query.cursor;

    // Verify user is participant
    const [channel] = await db.select().from(dmChannels).where(
      and(eq(dmChannels.id, dmChannelId), or(eq(dmChannels.user1Id, user.id), eq(dmChannels.user2Id, user.id)))
    );
    if (!channel) return reply.status(403).send({ error: "Not a participant" });

    const conditions = [eq(dmMessages.dmChannelId, dmChannelId)];
    if (cursor) {
      conditions.push(lt(dmMessages.createdAt, cursor));
    }

    const limit = MESSAGE_PAGE_SIZE;
    const items = await db
      .select()
      .from(dmMessages)
      .where(and(...conditions))
      .orderBy(desc(dmMessages.createdAt))
      .limit(limit + 1);

    const hasMore = items.length > limit;
    if (hasMore) items.pop();

    return {
      items: items.reverse(),
      cursor: items.length > 0 ? items[0].createdAt : null,
      hasMore,
    };
  });

  // Search users by username
  app.get<{
    Querystring: { q: string };
  }>("/users/search", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const query = request.query.q?.trim();
    if (!query) return [];

    const results = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(like(users.username, `%${query}%`))
      .limit(10);

    return results.filter((u) => u.id !== user.id);
  });
}
