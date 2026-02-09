import { useVoiceStore } from "../stores/voice.js";
import { useChatStore } from "../stores/chat.js";

export function VoiceStatusBar() {
  const { connectedChannelId, isMuted, isDeafened, leaveVoiceChannel, toggleMute, toggleDeafen } =
    useVoiceStore();
  const { channels } = useChatStore();

  if (!connectedChannelId) return null;

  const channel = channels.find((c) => c.id === connectedChannelId);

  return (
    <div className="voice-status-bar">
      <div className="voice-status-info">
        <span className="voice-status-label">Voice Connected</span>
        <span className="voice-status-channel">{channel?.name ?? "Unknown"}</span>
      </div>
      <div className="voice-status-controls">
        <button
          className={`voice-status-btn ${isMuted ? "active" : ""}`}
          onClick={toggleMute}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? "\u{1F507}" : "\u{1F50A}"}
        </button>
        <button
          className={`voice-status-btn ${isDeafened ? "active" : ""}`}
          onClick={toggleDeafen}
          title={isDeafened ? "Undeafen" : "Deafen"}
        >
          {isDeafened ? "\u{1F515}" : "\u{1F514}"}
        </button>
        <button
          className="voice-status-btn disconnect"
          onClick={leaveVoiceChannel}
          title="Disconnect"
        >
          &#x2716;
        </button>
      </div>
    </div>
  );
}
