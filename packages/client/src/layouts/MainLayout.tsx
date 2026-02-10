import { useEffect } from "react";
import { useChatStore } from "../stores/chat.js";
import { useAuthStore } from "../stores/auth.js";
import { gateway } from "../lib/ws.js";
import { ServerSidebar } from "../components/ServerSidebar.js";
import { ChannelSidebar } from "../components/ChannelSidebar.js";
import { ChatView } from "../components/ChatView.js";
import { VoiceChannelView } from "../components/VoiceChannelView.js";
import { ScreenSharePicker } from "../components/ScreenSharePicker.js";
import { DMSidebar } from "../components/DMSidebar.js";
import { DMChatView } from "../components/DMChatView.js";
import { MemberList } from "../components/MemberList.js";
import { requestNotificationPermission } from "../lib/notifications.js";

export function MainLayout() {
  const { loadServers, activeServerId, activeChannelId, channels, showingDMs, activeDMChannelId, members } = useChatStore();
  const { user } = useAuthStore();

  useEffect(() => {
    gateway.connect();
    loadServers();
    requestNotificationPermission();
    return () => gateway.disconnect();
  }, [loadServers]);

  // Update titlebar overlay color based on DM vs server view
  useEffect(() => {
    // DM page: main content bg is --bg-primary (#0a0a0a)
    // Server page: channel sidebar bg is --bg-secondary (#0e0e0e)
    const color = showingDMs ? "#0a0a0a" : "#0e0e0e";
    window.flux?.setTitleBarOverlayColor?.(color);
  }, [showingDMs]);

  const activeChannel = channels.find((c) => c.id === activeChannelId);

  return (
    <div className="app-layout">
      <ServerSidebar />

      {showingDMs ? (
        <DMSidebar />
      ) : (
        activeServerId && <ChannelSidebar />
      )}

      <main className="main-content">
        {showingDMs ? (
          activeDMChannelId ? (
            <DMChatView />
          ) : (
            <div className="empty-state">
              <h2>Direct Messages</h2>
              <p>Select a conversation or start a new one</p>
            </div>
          )
        ) : activeChannelId ? (
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

      {activeServerId && members.length > 0 && !showingDMs && <MemberList />}

      <ScreenSharePicker />
    </div>
  );
}
