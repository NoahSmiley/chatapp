import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema.js";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH ?? path.resolve(__dirname, "../../flux.db");

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Create all tables on startup
// Better Auth's Kysely adapter uses camelCase column names by default
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS "user" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    emailVerified INTEGER NOT NULL DEFAULT 0,
    image TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "session" (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expiresAt TEXT NOT NULL,
    ipAddress TEXT,
    userAgent TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "account" (
    id TEXT PRIMARY KEY,
    userId TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    accountId TEXT NOT NULL,
    providerId TEXT NOT NULL,
    accessToken TEXT,
    refreshToken TEXT,
    accessTokenExpiresAt TEXT,
    refreshTokenExpiresAt TEXT,
    scope TEXT,
    password TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "verification" (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,
    value TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "devices" (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    display_name TEXT,
    signing_key TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT
  );

  CREATE TABLE IF NOT EXISTS "key_packages" (
    id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL REFERENCES "devices"(id) ON DELETE CASCADE,
    key_package TEXT NOT NULL,
    consumed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "servers" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    owner_id TEXT NOT NULL REFERENCES "user"(id),
    invite_code TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "channels" (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES "servers"(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    bitrate INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "messages" (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES "channels"(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES "user"(id),
    ciphertext TEXT NOT NULL,
    mls_epoch INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_channel_time ON messages(channel_id, created_at);

  CREATE TABLE IF NOT EXISTS "memberships" (
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    server_id TEXT NOT NULL REFERENCES "servers"(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TEXT NOT NULL,
    PRIMARY KEY (user_id, server_id)
  );
`);

// Add bitrate column if missing (migration for existing databases)
try {
  sqlite.exec(`ALTER TABLE "channels" ADD COLUMN bitrate INTEGER`);
} catch {
  // Column already exists
}

export { sqlite };
export const db = drizzle(sqlite, { schema });
export type Database = typeof db;
