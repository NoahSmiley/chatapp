import { useEffect, useRef, useState } from "react";
import { Track } from "livekit-client";
import { useVoiceStore } from "../stores/voice.js";
import { useChatStore } from "../stores/chat.js";

function ScreenShareViewer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { room, watchingScreenShare, screenSharers, stopWatchingScreenShare } = useVoiceStore();

  const sharer = screenSharers.find((s) => s.participantId === watchingScreenShare);

  useEffect(() => {
    if (!room || !videoRef.current || !sharer) return;

    let track: Track | undefined;

    if (sharer.participantId === room.localParticipant.identity) {
      for (const pub of room.localParticipant.videoTrackPublications.values()) {
        if (pub.source === Track.Source.ScreenShare && pub.track) {
          track = pub.track;
          break;
        }
      }
    } else {
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
  }, [room, sharer, watchingScreenShare]);

  if (!sharer) return null;

  return (
    <div className="screen-share-viewer">
      <div className="screen-share-header">
        <span className="screen-share-label">
          {sharer.username}'s screen
        </span>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn-small popout-btn" onClick={() => window.flux?.openPopoutWindow("screenshare")} title="Pop out">
            &#x2197;
          </button>
          <button className="btn-small" onClick={stopWatchingScreenShare}>
            Stop Watching
          </button>
        </div>
      </div>
      <video ref={videoRef} autoPlay playsInline className="screen-share-video" />
    </div>
  );
}

function ScreenShareNotifications() {
  const { screenSharers, watchingScreenShare, watchScreenShare } = useVoiceStore();

  const unwatched = screenSharers.filter((s) => s.participantId !== watchingScreenShare);

  if (unwatched.length === 0) return null;

  return (
    <div className="screen-share-notifications">
      {unwatched.map((sharer) => (
        <div key={sharer.participantId} className="screen-share-notification">
          <span>{sharer.username} is sharing their screen</span>
          <button className="btn-small" onClick={() => watchScreenShare(sharer.participantId)}>
            Watch
          </button>
        </div>
      ))}
    </div>
  );
}

function AudioSettingsPanel() {
  const { audioSettings, updateAudioSetting } = useVoiceStore();

  const booleanSettings = [
    { key: "noiseSuppression" as const, label: "Noise Suppression" },
    { key: "echoCancellation" as const, label: "Echo Cancellation" },
    { key: "autoGainControl" as const, label: "Auto Gain Control" },
    { key: "dtx" as const, label: "Silence Detection (DTX)" },
  ];

  return (
    <div className="audio-settings">
      {booleanSettings.map(({ key, label }) => (
        <label key={key} className="audio-setting-row">
          <span>{label}</span>
          <input
            type="checkbox"
            checked={audioSettings[key] as boolean}
            onChange={(e) => updateAudioSetting(key, e.target.checked)}
          />
        </label>
      ))}

      <div className="audio-settings-divider" />

      <div className="audio-setting-slider-row">
        <div className="audio-setting-slider-label">
          <span>High-Pass Filter</span>
          <span className="audio-setting-value">
            {audioSettings.highPassFrequency === 0 ? "Off" : `${audioSettings.highPassFrequency} Hz`}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="2000"
          step="10"
          value={audioSettings.highPassFrequency}
          onChange={(e) => updateAudioSetting("highPassFrequency", parseInt(e.target.value))}
          className="settings-slider"
        />
      </div>

      <div className="audio-setting-slider-row">
        <div className="audio-setting-slider-label">
          <span>Low-Pass Filter</span>
          <span className="audio-setting-value">
            {audioSettings.lowPassFrequency === 0 ? "Off" : `${audioSettings.lowPassFrequency} Hz`}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="20000"
          step="100"
          value={audioSettings.lowPassFrequency}
          onChange={(e) => updateAudioSetting("lowPassFrequency", parseInt(e.target.value))}
          className="settings-slider"
        />
      </div>

      <div className="audio-setting-slider-row">
        <div className="audio-setting-slider-label">
          <span>Bitrate</span>
          <span className="audio-setting-value">
            {audioSettings.bitrate / 1000} kbps
          </span>
        </div>
        <input
          type="range"
          min="8000"
          max="256000"
          step="8000"
          value={audioSettings.bitrate}
          onChange={(e) => updateAudioSetting("bitrate", parseInt(e.target.value))}
          className="settings-slider"
        />
      </div>
    </div>
  );
}

export function VoiceChannelView() {
  const { channels, activeChannelId } = useChatStore();
  const {
    room,
    connectedChannelId,
    connecting,
    connectionError,
    participants,
    isMuted,
    isDeafened,
    isScreenSharing,
    watchingScreenShare,
    participantVolumes,
    joinVoiceChannel,
    leaveVoiceChannel,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    setParticipantVolume,
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
          <ScreenShareNotifications />
          {watchingScreenShare && <ScreenShareViewer />}

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
                {user.userId !== room?.localParticipant?.identity && (
                  <div className="participant-volume">
                    <input
                      type="range"
                      min="0"
                      max="200"
                      value={Math.round((participantVolumes[user.userId] ?? 1.0) * 100)}
                      onChange={(e) => setParticipantVolume(user.userId, parseInt(e.target.value) / 100)}
                      className="volume-slider"
                      title={`Volume: ${Math.round((participantVolumes[user.userId] ?? 1.0) * 100)}%`}
                    />
                    <span className="volume-label">
                      {Math.round((participantVolumes[user.userId] ?? 1.0) * 100)}%
                    </span>
                  </div>
                )}
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
