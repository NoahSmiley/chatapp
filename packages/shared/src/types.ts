// ── User & Auth ──

export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

export interface Device {
  id: string;
  userId: string;
  displayName: string;
  signingKey: string; // base64-encoded public Ed25519 key
  createdAt: string;
  lastSeenAt: string | null;
}

// ── Servers & Channels ──

export interface Server {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: ChannelType;
  bitrate: number | null;
  createdAt: string;
}

export type ChannelType = "text" | "voice";

export interface Membership {
  userId: string;
  serverId: string;
  role: MemberRole;
  joinedAt: string;
}

export interface MemberWithUser extends Membership {
  username: string;
  image: string | null;
}

export type MemberRole = "owner" | "admin" | "member";

// ── Messages ──

export interface Message {
  id: string;
  channelId: string;
  senderId: string;
  ciphertext: string; // base64-encoded encrypted content
  mlsEpoch: number;
  createdAt: string;
  editedAt?: string;
}

/** Decrypted message content (client-side only, never sent to server) */
export interface MessageContent {
  type: "text" | "file" | "system";
  text?: string;
  file?: FileAttachment;
}

export interface FileAttachment {
  name: string;
  mimeType: string;
  size: number;
  fileId: string; // server-side encrypted blob ID
  encryptionKey: string; // base64 AES-256-GCM key
  iv: string; // base64 initialization vector
}

// ── Reactions ──

export interface Reaction {
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}

// ── Direct Messages ──

export interface DMChannel {
  id: string;
  user1Id: string;
  user2Id: string;
  createdAt: string;
}

export interface DMMessage {
  id: string;
  dmChannelId: string;
  senderId: string;
  ciphertext: string;
  mlsEpoch: number;
  createdAt: string;
}

// ── Voice ──

export interface VoiceParticipant {
  userId: string;
  username: string;
}

// ── WebSocket Events ──

export type WSClientEvent =
  | { type: "send_message"; channelId: string; ciphertext: string; mlsEpoch: number }
  | { type: "typing_start"; channelId: string }
  | { type: "typing_stop"; channelId: string }
  | { type: "join_channel"; channelId: string }
  | { type: "leave_channel"; channelId: string }
  | { type: "voice_state_update"; channelId: string; action: "join" | "leave" }
  | { type: "add_reaction"; messageId: string; emoji: string }
  | { type: "remove_reaction"; messageId: string; emoji: string }
  | { type: "edit_message"; messageId: string; ciphertext: string }
  | { type: "send_dm"; dmChannelId: string; ciphertext: string; mlsEpoch: number }
  | { type: "join_dm"; dmChannelId: string }
  | { type: "leave_dm"; dmChannelId: string };

export type WSServerEvent =
  | { type: "message"; message: Message }
  | { type: "typing"; channelId: string; userId: string; active: boolean }
  | { type: "presence"; userId: string; status: PresenceStatus }
  | { type: "member_joined"; serverId: string; userId: string }
  | { type: "member_left"; serverId: string; userId: string }
  | { type: "voice_state"; channelId: string; participants: VoiceParticipant[] }
  | { type: "reaction_add"; messageId: string; userId: string; emoji: string }
  | { type: "reaction_remove"; messageId: string; userId: string; emoji: string }
  | { type: "message_edit"; messageId: string; ciphertext: string; editedAt: string }
  | { type: "dm_message"; message: DMMessage }
  | { type: "error"; message: string };

export type PresenceStatus = "online" | "idle" | "offline";

// ── API Request/Response Types ──

export interface CreateServerRequest {
  name: string;
}

export interface CreateChannelRequest {
  name: string;
  type: ChannelType;
  bitrate?: number;
}

export interface UpdateChannelRequest {
  name?: string;
  bitrate?: number | null;
}

export interface JoinServerRequest {
  inviteCode: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  cursor: string | null;
  hasMore: boolean;
}
