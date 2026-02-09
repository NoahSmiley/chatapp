import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { servers, channels, memberships } from "../db/schema.js";
import { nanoid } from "nanoid";
import { validateServerName, validateChannelName } from "@flux/shared";
import type { CreateServerRequest, CreateChannelRequest } from "@flux/shared";
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
        })
        .returning();

      return reply.status(201).send(channel);
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
