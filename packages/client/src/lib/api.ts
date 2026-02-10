import type {
  Server,
  Channel,
  Message,
  PaginatedResponse,
  CreateServerRequest,
  CreateChannelRequest,
  UpdateChannelRequest,
  Membership,
} from "@flux/shared";

const BASE_URL = "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...options?.headers as Record<string, string> };
  // Only set Content-Type for requests that have a body
  if (options?.body) {
    headers["Content-Type"] ??= "application/json";
  }
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }

  return res.json();
}

// ── Auth ──

export async function signUp(email: string, password: string, username: string) {
  return request("/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ email, password, name: username, username }),
  });
}

export async function signIn(email: string, password: string) {
  return request("/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function signOut() {
  return request("/auth/sign-out", { method: "POST" });
}

export async function getSession(): Promise<{ user: { id: string; email: string; username: string } } | null> {
  const res = await fetch(`${BASE_URL}/auth/get-session`, { credentials: "include" });
  if (!res.ok) return null;
  const data = await res.json();
  return data ?? null;
}

// ── Servers ──

export async function getServers() {
  return request<(Server & { role: string })[]>("/servers");
}

export async function createServer(data: CreateServerRequest) {
  return request<Server>("/servers", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function joinServer(inviteCode: string) {
  return request<Server>("/servers/join", {
    method: "POST",
    body: JSON.stringify({ inviteCode }),
  });
}

export async function getServerMembers(serverId: string) {
  return request<Membership[]>(`/servers/${serverId}/members`);
}

// ── Channels ──

export async function getChannels(serverId: string) {
  return request<Channel[]>(`/servers/${serverId}/channels`);
}

export async function createChannel(serverId: string, data: CreateChannelRequest) {
  return request<Channel>(`/servers/${serverId}/channels`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateChannel(serverId: string, channelId: string, data: UpdateChannelRequest) {
  return request<Channel>(`/servers/${serverId}/channels/${channelId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteChannel(serverId: string, channelId: string) {
  return request<void>(`/servers/${serverId}/channels/${channelId}`, {
    method: "DELETE",
  });
}

// ── Messages ──

export async function getMessages(channelId: string, cursor?: string) {
  const params = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return request<PaginatedResponse<Message>>(`/channels/${channelId}/messages${params}`);
}

// ── Voice ──

export async function getVoiceToken(channelId: string, viewer?: boolean) {
  return request<{ token: string; url: string }>("/voice/token", {
    method: "POST",
    body: JSON.stringify({ channelId, ...(viewer ? { viewer: true } : {}) }),
  });
}
