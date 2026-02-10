import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { env } from "./env.js";
import { auth } from "./auth.js";
import { serverRoutes } from "./routes/servers.js";
import { messageRoutes } from "./routes/messages.js";
import { voiceRoutes } from "./routes/voice.js";
import { dmRoutes } from "./routes/dms.js";
import { registerGateway } from "./ws/gateway.js";
import { toWebHeaders } from "./util/headers.js";

const app = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
    },
  },
});

// Plugins
await app.register(cors, {
  origin: true, // Allow all origins in dev; restrict in production
  credentials: true,
});
await app.register(websocket);

// Better Auth handler — encapsulated plugin to bypass Fastify's JSON body parser
await app.register(async (authApp) => {
  // Use raw string body parsing so empty bodies (e.g. sign-out) don't throw
  authApp.removeAllContentTypeParsers();
  authApp.addContentTypeParser("*", { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });

  authApp.all("/api/auth/*", async (request, reply) => {
    const headers = toWebHeaders(request.headers);
    const url = new URL(request.url, `http://${request.headers.host ?? request.hostname}`);
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const rawBody = request.body as string | undefined;

    const webRequest = new Request(url.toString(), {
      method: request.method,
      headers,
      body: hasBody && rawBody ? rawBody : undefined,
    });
    const response = await auth.handler(webRequest);
    reply.status(response.status);
    // Forward Set-Cookie headers individually (they can't be joined with `, `)
    const setCookies = response.headers.getSetCookie();
    for (const cookie of setCookies) {
      reply.header("set-cookie", cookie);
    }
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "set-cookie") {
        reply.header(key, value);
      }
    });
    const body = await response.text();
    reply.send(body);
  });
});

// API routes
await app.register(serverRoutes, { prefix: "/api" });
await app.register(messageRoutes, { prefix: "/api" });
await app.register(voiceRoutes, { prefix: "/api" });
await app.register(dmRoutes, { prefix: "/api" });

// WebSocket gateway
await app.register(registerGateway);

// Start
try {
  await app.listen({ host: env.HOST, port: env.PORT });
  console.log(`Flux server running on ${env.HOST}:${env.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
