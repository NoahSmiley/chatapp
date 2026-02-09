import { useChatStore } from "../stores/chat.js";
import { useVoiceStore } from "../stores/voice.js";
import { VoiceStatusBar } from "./VoiceStatusBar.js";

export function ChannelSidebar() {
  const { channels, activeChannelId, selectChannel, servers, activeServerId } = useChatStore();
  const { channelParticipants, connectedChannelId } = useVoiceStore();
  const server = servers.find((s) => s.id === activeServerId);

  const textChannels = channels.filter((c) => c.type === "text");
  const voiceChannels = channels.filter((c) => c.type === "voice");

  return (
    <div className="channel-sidebar">
      <div className="channel-sidebar-header">
        <h3>{server?.name ?? "Server"}</h3>
      </div>

      <div className="channel-list">
        {textChannels.length > 0 && (
          <>
            <div className="channel-category">Text Channels</div>
            {textChannels.map((channel) => (
              <button
                key={channel.id}
                className={`channel-item ${channel.id === activeChannelId ? "active" : ""}`}
                onClick={() => selectChannel(channel.id)}
              >
                <span className="channel-hash">#</span>
                {channel.name}
              </button>
            ))}
          </>
        )}

        {voiceChannels.length > 0 && (
          <>
            <div className="channel-category">Voice Channels</div>
            {voiceChannels.map((channel) => {
              const participants = channelParticipants[channel.id] ?? [];
              const isConnected = connectedChannelId === channel.id;
              return (
                <div key={channel.id}>
                  <button
                    className={`channel-item ${channel.id === activeChannelId ? "active" : ""} ${isConnected ? "voice-connected" : ""}`}
                    onClick={() => selectChannel(channel.id)}
                  >
                    <span className="channel-hash">&#x1f50a;</span>
                    {channel.name}
                  </button>
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
      </div>

      <VoiceStatusBar />
    </div>
  );
}
