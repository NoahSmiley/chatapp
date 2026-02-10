import { useEffect, useRef, useState } from "react";
import { Track } from "livekit-client";
import { useVoiceStore } from "../stores/voice.js";
import { useChatStore } from "../stores/chat.js";

function ScreenShareViewer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { room, screenSharers } = useVoiceStore();

  useEffect(() => {
    if (!room || !videoRef.current || screenSharers.length === 0) return;

    const sharer = screenSharers[0];
    let track: Track | undefined;

    // Check if it's our own screen share
    if (sharer.participantId === room.localParticipant.identity) {
      for (const pub of room.localParticipant.videoTrackPublications.values()) {
        if (pub.source === Track.Source.ScreenShare && pub.track) {
          track = pub.track;
          break;
        }
      }
    } else {
      // Remote participant
      const participant = room.remoteParticipants.get(sharer.participantId);
      if (participant) {
        for (const pub of participant.videoTrackPublications.values()) {
          if (pub.source === Track.Source.ScreenShare && pub.track) {
            track = pub.track;
            break;
          }
        }
      }
    }

    if (track && videoRef.current) {
      track.attach(videoRef.current);
    }

    return () => {
      if (track && videoRef.current) {
        track.detach(videoRef.current);
      }
    };
  }, [room, screenSharers]);

  if (screenSharers.length === 0) return null;

  return (
    <div className="screen-share-viewer">
      <div className="screen-share-label">
        {screenSharers[0].username}'s screen
      </div>
      <video ref={videoRef} autoPlay playsInline className="screen-share-video" />
    </div>
  );
}

function AudioSettingsPanel() {
  const { audioSettings, updateAudioSetting } = useVoiceStore();

  const settings = [
    { key: "noiseSuppression" as const, label: "Noise Suppression" },
    { key: "echoCancellation" as const, label: "Echo Cancellation" },
    { key: "autoGainControl" as const, label: "Auto Gain Control" },
    { key: "dtx" as const, label: "Silence Detection (DTX)" },
  ];

  return (
    <div className="audio-settings">
      {settings.map(({ key, label }) => (
        <label key={key} className="audio-setting-row">
          <span>{label}</span>
          <input
            type="checkbox"
            checked={audioSettings[key]}
            onChange={(e) => updateAudioSetting(key, e.target.checked)}
          />
        </label>
      ))}
    </div>
  );
}

export function VoiceChannelView() {
  const { channels, activeChannelId } = useChatStore();
  const {
    connectedChannelId,
    connecting,
    connectionError,
    participants,
    isMuted,
    isDeafened,
    isScreenSharing,
    screenSharers,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
  } = useVoiceStore();

  const [showSettings, setShowSettings] = useState(false);

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
          {screenSharers.length > 0 && <ScreenShareViewer />}

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
              className={`voice-control-btn ${isScreenSharing ? "active" : ""}`}
              onClick={toggleScreenShare}
              title={isScreenSharing ? "Stop Sharing" : "Share Screen"}
            >
              {isScreenSharing ? "Stop Share" : "Screen"}
            </button>
            <button
              className={`voice-control-btn ${showSettings ? "active" : ""}`}
              onClick={() => setShowSettings(!showSettings)}
              title="Settings"
            >
              &#x2699;
            </button>
            <button
              className="voice-control-btn disconnect"
              onClick={leaveVoiceChannel}
              title="Disconnect"
            >
              Disconnect
            </button>
          </div>

          {showSettings && <AudioSettingsPanel />}
        </>
      )}
    </div>
  );
}
