import { create } from "zustand";
import type { Server, Channel, Message } from "@flux/shared";
import * as api from "../lib/api.js";
import { gateway } from "../lib/ws.js";
import { broadcastState, onCommand, isPopout } from "../lib/broadcast.js";

interface ChatState {
  servers: (Server & { role: string })[];
  channels: Channel[];
  messages: Message[];
  activeServerId: string | null;
  activeChannelId: string | null;
  hasMoreMessages: boolean;
  messageCursor: string | null;
  loadingServers: boolean;
  loadingMessages: boolean;

  loadServers: () => Promise<void>;
  selectServer: (serverId: string) => Promise<void>;
  selectChannel: (channelId: string) => Promise<void>;
  loadMoreMessages: () => Promise<void>;
  sendMessage: (content: string) => void;
  createServer: (name: string) => Promise<void>;
  joinServer: (inviteCode: string) => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  servers: [],
  channels: [],
  messages: [],
  activeServerId: null,
  activeChannelId: null,
  hasMoreMessages: false,
  messageCursor: null,
  loadingServers: false,
  loadingMessages: false,

  loadServers: async () => {
    set({ loadingServers: true });
    try {
      const servers = await api.getServers();
      set({ servers, loadingServers: false });
    } catch {
      set({ loadingServers: false });
    }
  },

  selectServer: async (serverId) => {
    set({ activeServerId: serverId, activeChannelId: null, channels: [], messages: [] });
    const channels = await api.getChannels(serverId);
    set({ channels });

    // Auto-select first text channel
    const textChannel = channels.find((c) => c.type === "text");
    if (textChannel) {
      get().selectChannel(textChannel.id);
    }
  },

  selectChannel: async (channelId) => {
    const prevChannel = get().activeChannelId;
    if (prevChannel) {
      gateway.send({ type: "leave_channel", channelId: prevChannel });
    }

    const channel = get().channels.find((c) => c.id === channelId);

    set({ activeChannelId: channelId, messages: [], hasMoreMessages: false, messageCursor: null, loadingMessages: false });

    gateway.send({ type: "join_channel", channelId });

    // Only fetch messages for text channels
    if (channel?.type === "text") {
      set({ loadingMessages: true });
      try {
        const result = await api.getMessages(channelId);
        set({
          messages: result.items,
          hasMoreMessages: result.hasMore,
          messageCursor: result.cursor,
          loadingMessages: false,
        });
      } catch {
        set({ loadingMessages: false });
      }
    }
  },

  loadMoreMessages: async () => {
    const { activeChannelId, messageCursor, hasMoreMessages, loadingMessages } = get();
    if (!activeChannelId || !hasMoreMessages || loadingMessages) return;

    set({ loadingMessages: true });
    try {
      const result = await api.getMessages(activeChannelId, messageCursor ?? undefined);
      set((state) => ({
        messages: [...result.items, ...state.messages],
        hasMoreMessages: result.hasMore,
        messageCursor: result.cursor,
        loadingMessages: false,
      }));
    } catch {
      set({ loadingMessages: false });
    }
  },

  sendMessage: (content) => {
    const { activeChannelId } = get();
    if (!activeChannelId || !content.trim()) return;

    // For now, send plaintext as the "ciphertext" (Phase 5 will add real encryption)
    gateway.send({
      type: "send_message",
      channelId: activeChannelId,
      ciphertext: btoa(content), // base64 encode for now
      mlsEpoch: 0,
    });
  },

  createServer: async (name) => {
    const server = await api.createServer({ name });
    set((state) => ({ servers: [...state.servers, { ...server, role: "owner" }] }));
  },

  joinServer: async (inviteCode) => {
    const server = await api.joinServer(inviteCode);
    set((state) => ({ servers: [...state.servers, { ...server, role: "member" }] }));
  },
}));

// Listen for WebSocket events
gateway.on((event) => {
  const state = useChatStore.getState();

  switch (event.type) {
    case "message":
      if (event.message.channelId === state.activeChannelId) {
        useChatStore.setState((s) => ({
          messages: [...s.messages, event.message],
        }));
      }
      break;
  }
});

// ── BroadcastChannel: publish state to popout windows ──

if (!isPopout()) {
  // Broadcast chat state on every change
  useChatStore.subscribe((state) => {
    const channel = state.channels.find((c) => c.id === state.activeChannelId);
    broadcastState({
      type: "chat-state",
      messages: state.messages,
      activeChannelId: state.activeChannelId,
      channelName: channel?.name ?? null,
    });
  });

  // Listen for commands from popout windows
  onCommand((cmd) => {
    if (cmd.type === "send-message") {
      useChatStore.getState().sendMessage(cmd.content);
    }
  });
}
