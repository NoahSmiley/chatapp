import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

export async function userRoutes(app: FastifyInstance) {
  // Get current user profile
  app.get("/users/me", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const [profile] = await db.select().from(users).where(eq(users.id, user.id));
    if (!profile) return reply.status(404).send({ error: "User not found" });

    return {
      id: profile.id,
      username: profile.username,
      email: profile.email,
      image: profile.image,
    };
  });

  // Update current user profile
  app.patch<{
    Body: { username?: string; image?: string | null };
  }>("/users/me", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const body = request.body as { username?: string; image?: string | null };
    const updates: Partial<{ username: string; image: string | null; name: string; updatedAt: string }> = {};

    if (body.username !== undefined) {
      const trimmed = body.username.trim();
      if (trimmed.length < 2 || trimmed.length > 32) {
        return reply.status(400).send({ error: "Username must be 2-32 characters" });
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
        return reply.status(400).send({ error: "Username can only contain letters, numbers, hyphens, and underscores" });
      }
      // Check uniqueness
      const [existing] = await db.select().from(users).where(eq(users.username, trimmed));
      if (existing && existing.id !== user.id) {
        return reply.status(409).send({ error: "Username already taken" });
      }
      updates.username = trimmed;
      updates.name = trimmed;
    }

    if (body.image !== undefined) {
      if (body.image !== null && body.image.length > 500_000) {
        return reply.status(400).send({ error: "Image too large (max ~375KB)" });
      }
      updates.image = body.image;
    }

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ error: "No fields to update" });
    }

    updates.updatedAt = new Date().toISOString();

    await db.update(users).set(updates).where(eq(users.id, user.id));

    const [updated] = await db.select().from(users).where(eq(users.id, user.id));
    return {
      id: updated.id,
      username: updated.username,
      email: updated.email,
      image: updated.image,
    };
  });
}
