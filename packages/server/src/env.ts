function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const env = {
  HOST: process.env.HOST ?? "0.0.0.0",
  PORT: parseInt(process.env.PORT ?? "3001", 10),
  BETTER_AUTH_SECRET: required("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
  // LiveKit
  LIVEKIT_API_KEY: required("LIVEKIT_API_KEY"),
  LIVEKIT_API_SECRET: required("LIVEKIT_API_SECRET"),
  LIVEKIT_URL: process.env.LIVEKIT_URL ?? "ws://localhost:7880",
} as const;
