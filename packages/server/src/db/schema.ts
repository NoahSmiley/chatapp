import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  index,
} from "drizzle-orm/sqlite-core";
function id() {
  return text("id").primaryKey().$defaultFn(() => crypto.randomUUID());
}

function ts(name: string) {
  return text(name).notNull().$defaultFn(() => new Date().toISOString());
}

function tsNullable(name: string) {
  return text(name);
}

// ── Users (singular "user" + camelCase columns to match Better Auth's Kysely adapter) ──

export const users = sqliteTable("user", {
  id: id(),
  name: text("name").notNull(),
  username: text("username").unique().notNull(),
  email: text("email").unique().notNull(),
  emailVerified: integer("emailVerified").notNull().default(0),
  image: text("image"),
  createdAt: ts("createdAt"),
  updatedAt: ts("updatedAt"),
});

// ── Better Auth session/account tables (singular names, camelCase columns) ──

export const sessions = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").unique().notNull(),
  expiresAt: text("expiresAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  createdAt: ts("createdAt"),
  updatedAt: ts("updatedAt"),
});

export const accounts = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  accessTokenExpiresAt: text("accessTokenExpiresAt"),
  refreshTokenExpiresAt: text("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: ts("createdAt"),
  updatedAt: ts("updatedAt"),
});

export const verifications = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: text("expiresAt").notNull(),
  createdAt: ts("createdAt"),
  updatedAt: ts("updatedAt"),
});

// ── Device Identity (E2EE) ──

export const devices = sqliteTable("devices", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name"),
  signingKey: text("signing_key").notNull(), // base64 public Ed25519 key
  createdAt: ts("created_at"),
  lastSeenAt: tsNullable("last_seen_at"),
});

export const keyPackages = sqliteTable("key_packages", {
  id: id(),
  deviceId: text("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),
  keyPackage: text("key_package").notNull(), // base64 serialized MLS KeyPackage
  consumed: integer("consumed", { mode: "boolean" }).notNull().default(false),
  createdAt: ts("created_at"),
});

// ── Servers ──

export const servers = sqliteTable("servers", {
  id: id(),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id),
  inviteCode: text("invite_code").unique().notNull(),
  createdAt: ts("created_at"),
});

// ── Channels ──

export const channels = sqliteTable("channels", {
  id: id(),
  serverId: text("server_id")
    .notNull()
    .references(() => servers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'text' | 'voice'
  bitrate: integer("bitrate"), // voice channels only, in bps (null = 128000)
  createdAt: ts("created_at"),
});

// ── Messages ──

export const messages = sqliteTable(
  "messages",
  {
    id: id(),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id),
    ciphertext: text("ciphertext").notNull(),
    mlsEpoch: integer("mls_epoch").notNull().default(0),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("idx_messages_channel_time").on(table.channelId, table.createdAt),
  ]
);

// ── Reactions ──

export const reactions = sqliteTable(
  "reactions",
  {
    id: id(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("idx_reactions_message").on(table.messageId),
  ]
);

// ── Direct Messages ──

export const dmChannels = sqliteTable(
  "dm_channels",
  {
    id: id(),
    user1Id: text("user1_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    user2Id: text("user2_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("idx_dm_channels_users").on(table.user1Id, table.user2Id),
  ]
);

export const dmMessages = sqliteTable(
  "dm_messages",
  {
    id: id(),
    dmChannelId: text("dm_channel_id")
      .notNull()
      .references(() => dmChannels.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => users.id),
    ciphertext: text("ciphertext").notNull(),
    mlsEpoch: integer("mls_epoch").notNull().default(0),
    createdAt: ts("created_at"),
  },
  (table) => [
    index("idx_dm_messages_channel_time").on(table.dmChannelId, table.createdAt),
  ]
);

// ── Memberships ──

export const memberships = sqliteTable(
  "memberships",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: ts("joined_at"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.serverId] }),
  ]
);
