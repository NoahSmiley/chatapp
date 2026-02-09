import { betterAuth } from "better-auth";
import { sqlite } from "./db/index.js";
import { env } from "./env.js";

export const auth = betterAuth({
  database: sqlite,
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: ["http://localhost:5173"],
  emailAndPassword: {
    enabled: true,
  },
  user: {
    additionalFields: {
      username: {
        type: "string",
        required: true,
        unique: true,
      },
    },
  },
});

export type Auth = typeof auth;
