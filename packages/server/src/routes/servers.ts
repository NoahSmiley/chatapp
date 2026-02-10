import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { servers, channels, memberships } from "../db/schema.js";
import { nanoid } from "nanoid";
import { validateServerName, validateChannelName } from "@flux/shared";
import type { CreateServerRequest, CreateChannelRequest, UpdateChannelRequest } from "@flux/shared";
import { requireAuth } from "../middleware/auth.js";

export async function serverRoutes(app: FastifyInstance) {
  // Create a server
  app.post<{ Body: CreateServerRequest }>("/servers", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const error = validateServerName(request.body.name);
    if (error) return reply.status(400).send({ error });

    const inviteCode = nanoid(10);

    const [server] = await db
      .insert(servers)
      .values({
        name: request.body.name.trim(),
        ownerId: user.id,
        inviteCode,
      })
      .returning();

    // Auto-create a general text channel
    await db.insert(channels).values({
      serverId: server.id,
      name: "general",
      type: "text",
    });

    // Auto-create a general voice channel
    await db.insert(channels).values({
      serverId: server.id,
      name: "general",
      type: "voice",
    });

    // Add owner as a member
    await db.insert(memberships).values({
      userId: user.id,
      serverId: server.id,
      role: "owner",
    });

    return reply.status(201).send(server);
  });

  // List servers the user is a member of
  app.get("/servers", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const result = await db
      .select({ server: servers, membership: memberships })
      .from(memberships)
      .innerJoin(servers, eq(servers.id, memberships.serverId))
      .where(eq(memberships.userId, user.id));

    return result.map((r) => ({
      ...r.server,
      role: r.membership.role,
    }));
  });

  // Get a specific server
  app.get<{ Params: { serverId: string } }>("/servers/:serverId", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params;

    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.serverId, serverId)));

    if (!membership) return reply.status(403).send({ error: "Not a member of this server" });

    const [server] = await db.select().from(servers).where(eq(servers.id, serverId));
    if (!server) return reply.status(404).send({ error: "Server not found" });

    return { ...server, role: membership.role };
  });

  // List channels in a server
  app.get<{ Params: { serverId: string } }>("/servers/:serverId/channels", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params;

    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.serverId, serverId)));

    if (!membership) return reply.status(403).send({ error: "Not a member of this server" });

    return db.select().from(channels).where(eq(channels.serverId, serverId));
  });

  // Create a channel in a server
  app.post<{ Params: { serverId: string }; Body: CreateChannelRequest }>(
    "/servers/:serverId/channels",
    async (request, reply) => {
      const user = await requireAuth(request, reply);
      if (!user) return;

      const { serverId } = request.params;

      const [membership] = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.userId, user.id), eq(memberships.serverId, serverId)));

      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      const error = validateChannelName(request.body.name);
      if (error) return reply.status(400).send({ error });

      const [channel] = await db
        .insert(channels)
        .values({
          serverId,
          name: request.body.name.trim(),
          type: request.body.type,
          bitrate: request.body.type === "voice" ? (request.body.bitrate ?? null) : null,
        })
        .returning();

      return reply.status(201).send(channel);
    }
  );

  // Update a channel
  app.patch<{ Params: { serverId: string; channelId: string }; Body: UpdateChannelRequest }>(
    "/servers/:serverId/channels/:channelId",
    async (request, reply) => {
      const user = await requireAuth(request, reply);
      if (!user) return;

      const { serverId, channelId } = request.params;

      const [membership] = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.userId, user.id), eq(memberships.serverId, serverId)));

      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      const [channel] = await db.select().from(channels).where(and(eq(channels.id, channelId), eq(channels.serverId, serverId)));
      if (!channel) return reply.status(404).send({ error: "Channel not found" });

      const updates: Partial<{ name: string; bitrate: number | null }> = {};

      if (request.body.name !== undefined) {
        const error = validateChannelName(request.body.name);
        if (error) return reply.status(400).send({ error });
        updates.name = request.body.name.trim();
      }

      if (request.body.bitrate !== undefined) {
        if (channel.type !== "voice") {
          return reply.status(400).send({ error: "Bitrate can only be set on voice channels" });
        }
        updates.bitrate = request.body.bitrate;
      }

      const [updated] = await db
        .update(channels)
        .set(updates)
        .where(eq(channels.id, channelId))
        .returning();

      return updated;
    }
  );

  // Delete a channel
  app.delete<{ Params: { serverId: string; channelId: string } }>(
    "/servers/:serverId/channels/:channelId",
    async (request, reply) => {
      const user = await requireAuth(request, reply);
      if (!user) return;

      const { serverId, channelId } = request.params;

      const [membership] = await db
        .select()
        .from(memberships)
        .where(and(eq(memberships.userId, user.id), eq(memberships.serverId, serverId)));

      if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      await db.delete(channels).where(and(eq(channels.id, channelId), eq(channels.serverId, serverId)));

      return reply.status(204).send();
    }
  );

  // Join a server via invite code
  app.post<{ Body: { inviteCode: string } }>("/servers/join", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { inviteCode } = request.body;
    if (!inviteCode) return reply.status(400).send({ error: "Invite code is required" });

    const [server] = await db.select().from(servers).where(eq(servers.inviteCode, inviteCode));
    if (!server) return reply.status(404).send({ error: "Invalid invite code" });

    // Check if already a member
    const [existing] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.serverId, server.id)));

    if (existing) return reply.status(400).send({ error: "Already a member of this server" });

    await db.insert(memberships).values({
      userId: user.id,
      serverId: server.id,
      role: "member",
    });

    return reply.status(200).send(server);
  });

  // List members of a server
  app.get<{ Params: { serverId: string } }>("/servers/:serverId/members", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const { serverId } = request.params;

    const [membership] = await db
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.serverId, serverId)));

    if (!membership) return reply.status(403).send({ error: "Not a member of this server" });

    return db
      .select()
      .from(memberships)
      .where(eq(memberships.serverId, serverId));
  });
}
