import { useEffect } from "react";
import { useChatStore } from "../stores/chat.js";
import { useAuthStore } from "../stores/auth.js";
import { gateway } from "../lib/ws.js";
import { ServerSidebar } from "../components/ServerSidebar.js";
import { ChannelSidebar } from "../components/ChannelSidebar.js";
import { ChatView } from "../components/ChatView.js";
import { VoiceChannelView } from "../components/VoiceChannelView.js";

export function MainLayout() {
  const { loadServers, activeServerId, activeChannelId, channels } = useChatStore();
  const { logout, user } = useAuthStore();

  useEffect(() => {
    gateway.connect();
    loadServers();
    return () => gateway.disconnect();
  }, [loadServers]);

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  return (
    <div className="app-layout">
      <ServerSidebar />

      {activeServerId && <ChannelSidebar />}

      <main className="main-content">
        {activeChannelId ? (
          activeChannel?.type === "voice" ? (
            <VoiceChannelView />
          ) : (
            <ChatView />
          )
        ) : (
          <div className="empty-state">
            <h2>Welcome, {user?.username}</h2>
            <p>Select a server and channel to get started</p>
          </div>
        )}
      </main>

      <div className="user-bar">
        <span className="user-bar-name">{user?.username}</span>
        <button onClick={logout} className="btn-small">Sign Out</button>
      </div>
    </div>
  );
}
