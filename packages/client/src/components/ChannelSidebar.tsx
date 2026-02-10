import { useState } from "react";
import type { Channel, ChannelType } from "@flux/shared";
import { useChatStore } from "../stores/chat.js";
import { useVoiceStore } from "../stores/voice.js";
import { VoiceStatusBar } from "./VoiceStatusBar.js";
import { CreateChannelModal } from "./CreateChannelModal.js";
import { ChannelSettingsModal } from "./ChannelSettingsModal.js";

export function ChannelSidebar() {
  const { channels, activeChannelId, selectChannel, servers, activeServerId } = useChatStore();
  const { channelParticipants, connectedChannelId } = useVoiceStore();
  const server = servers.find((s) => s.id === activeServerId);
  const isOwnerOrAdmin = server && (server.role === "owner" || server.role === "admin");

  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");

  const [createModalType, setCreateModalType] = useState<ChannelType | null>(null);
  const [settingsChannel, setSettingsChannel] = useState<Channel | null>(null);

  return (
    <div className="channel-sidebar">
      <div className="channel-sidebar-header">
        <h3>{server?.name ?? "Server"}</h3>
      </div>

      <div className="channel-list">
        {textChannels.length > 0 && (
          <>
            <div className="channel-category-header">
              <span>Text Channels</span>
              {isOwnerOrAdmin && (
                <button className="channel-add-btn" onClick={() => setCreateModalType("text")} title="Create Text Channel">
                  +
                </button>
              )}
            </div>
            {textChannels.map((channel) => (
              <div key={channel.id} className="channel-item-wrapper">
                <button
                  className={`channel-item ${channel.id === activeChannelId ? "active" : ""}`}
                  onClick={() => selectChannel(channel.id)}
                >
                  <span className="channel-hash">#</span>
                  {channel.name}
                </button>
                {isOwnerOrAdmin && (
                  <button
                    className="channel-settings-btn"
                    onClick={() => setSettingsChannel(channel)}
                    title="Channel Settings"
                  >
                    &#x2699;
                  </button>
                )}
              </div>
            ))}
          </>
        )}

        {voiceChannels.length > 0 && (
          <>
            <div className="channel-category-header">
              <span>Voice Channels</span>
              {isOwnerOrAdmin && (
                <button className="channel-add-btn" onClick={() => setCreateModalType("voice")} title="Create Voice Channel">
                  +
                </button>
              )}
            </div>
            {voiceChannels.map((channel) => {
              const participants = channelParticipants[channel.id] ?? [];
              const isConnected = connectedChannelId === channel.id;
              return (
                <div key={channel.id}>
                  <div className="channel-item-wrapper">
                    <button
                      className={`channel-item ${channel.id === activeChannelId ? "active" : ""} ${isConnected ? "voice-connected" : ""}`}
                      onClick={() => selectChannel(channel.id)}
                    >
                      <span className="channel-hash">&#x1f50a;</span>
                      {channel.name}
                    </button>
                    {isOwnerOrAdmin && (
                      <button
                        className="channel-settings-btn"
                        onClick={() => setSettingsChannel(channel)}
                        title="Channel Settings"
                      >
                        &#x2699;
                      </button>
                    )}
                  </div>
                  {participants.length > 0 && (
                    <div className="voice-channel-users">
                      {participants.map((p) => (
                        <div key={p.userId} className="voice-channel-user">
                          <span className="voice-user-dot" />
                          {p.username}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {textChannels.length === 0 && voiceChannels.length === 0 && isOwnerOrAdmin && (
          <div style={{ padding: "16px", textAlign: "center" }}>
            <button className="btn-small" onClick={() => setCreateModalType("text")}>
              Create a Channel
            </button>
          </div>
        )}
      </div>

      <VoiceStatusBar />

      {createModalType && activeServerId && (
        <CreateChannelModal
          serverId={activeServerId}
          defaultType={createModalType}
          onClose={() => setCreateModalType(null)}
        />
      )}

      {settingsChannel && activeServerId && (
        <ChannelSettingsModal
          channel={settingsChannel}
          serverId={activeServerId}
          onClose={() => setSettingsChannel(null)}
        />
      )}
    </div>
  );
}
