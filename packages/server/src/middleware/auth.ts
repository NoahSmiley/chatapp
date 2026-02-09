import type { FastifyRequest, FastifyReply } from "fastify";
import { auth } from "../auth.js";
import { toWebHeaders } from "../util/headers.js";

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<{ id: string; email: string; username: string } | null> {
  const session = await auth.api.getSession({
    headers: toWebHeaders(request.headers),
  });

  if (!session) {
    reply.status(401).send({ error: "Unauthorized" });
    return null;
  }

  return session.user as { id: string; email: string; username: string };
}
