import { useVoiceStore } from "../stores/voice.js";
import { useChatStore } from "../stores/chat.js";

export function VoiceChannelView() {
  const { channels, activeChannelId } = useChatStore();
  const {
    connectedChannelId,
    connecting,
    connectionError,
    participants,
    isMuted,
    isDeafened,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
    toggleDeafen,
  } = useVoiceStore();

  const channel = channels.find((c) => c.id === activeChannelId);
  const isConnected = connectedChannelId === activeChannelId;

  return (
    <div className="voice-channel-view">
      <div className="voice-channel-header">
        <span className="voice-channel-icon">&#x1f50a;</span>
        <h2>{channel?.name ?? "Voice Channel"}</h2>
      </div>

      {connectionError && (
        <div className="voice-error">{connectionError}</div>
      )}

      {!isConnected && !connecting && (
        <div className="voice-join-prompt">
          <p>Click below to join voice</p>
          <button
            className="btn-primary voice-join-btn"
            onClick={() => activeChannelId && joinVoiceChannel(activeChannelId)}
          >
            Join Voice Channel
          </button>
        </div>
      )}

      {connecting && (
        <div className="voice-connecting">
          <div className="loading-spinner" />
          <p>Connecting...</p>
        </div>
      )}

      {isConnected && (
        <>
          <div className="voice-participants">
            {participants.map((user) => (
              <div
                key={user.userId}
                className={`voice-participant ${user.speaking ? "speaking" : ""}`}
              >
                <div className="voice-participant-avatar">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="voice-participant-name">{user.username}</span>
                {user.speaking && <span className="voice-speaking-indicator" />}
              </div>
            ))}
          </div>

          <div className="voice-controls">
            <button
              className={`voice-control-btn ${isMuted ? "active" : ""}`}
              onClick={toggleMute}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>
            <button
              className={`voice-control-btn ${isDeafened ? "active" : ""}`}
              onClick={toggleDeafen}
              title={isDeafened ? "Undeafen" : "Deafen"}
            >
              {isDeafened ? "Undeafen" : "Deafen"}
            </button>
            <button
              className="voice-control-btn disconnect"
              onClick={leaveVoiceChannel}
              title="Disconnect"
            >
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
