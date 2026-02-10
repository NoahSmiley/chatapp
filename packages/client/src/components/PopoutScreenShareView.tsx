import { useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track } from "livekit-client";
import { onStateUpdate, sendCommand, type VoiceStateMessage } from "../lib/broadcast.js";

export function PopoutScreenShareView() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [status, setStatus] = useState("Waiting for screen share...");
  const [sharerName, setSharerName] = useState<string | null>(null);

  useEffect(() => {
    let currentUrl: string | null = null;
    let currentToken: string | null = null;
    let currentSharerPid: string | null = null;

    // Request initial state from main window
    sendCommand({ type: "request-state" });

    const cleanup = onStateUpdate(async (msg) => {
      if (msg.type !== "voice-state") return;
      const voiceMsg = msg as VoiceStateMessage;

      // If no screen share info, disconnect
      if (!voiceMsg.livekitUrl || !voiceMsg.livekitToken || !voiceMsg.screenSharerParticipantId) {
        if (roomRef.current) {
          roomRef.current.disconnect();
          roomRef.current = null;
        }
        setStatus("Screen share ended");
        setSharerName(null);
        return;
      }

      setSharerName(voiceMsg.screenSharerUsername);

      // If already connected to same room+sharer, skip
      if (
        currentUrl === voiceMsg.livekitUrl &&
        currentToken === voiceMsg.livekitToken &&
        currentSharerPid === voiceMsg.screenSharerParticipantId
      ) {
        return;
      }

      currentUrl = voiceMsg.livekitUrl;
      currentToken = voiceMsg.livekitToken;
      currentSharerPid = voiceMsg.screenSharerParticipantId;

      // Disconnect existing room
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }

      setStatus("Connecting...");

      try {
        const room = new Room();
        roomRef.current = room;

        room.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.source === Track.Source.ScreenShare && track.kind === Track.Kind.Video && videoRef.current) {
            track.attach(videoRef.current);
            setStatus("Watching");
          }
        });

        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          if (track.source === Track.Source.ScreenShare && videoRef.current) {
            track.detach(videoRef.current);
            setStatus("Screen share ended");
          }
        });

        room.on(RoomEvent.Disconnected, () => {
          setStatus("Disconnected");
        });

        await room.connect(voiceMsg.livekitUrl, voiceMsg.livekitToken);

        // Check if sharer is already publishing
        for (const participant of room.remoteParticipants.values()) {
          if (participant.identity === voiceMsg.screenSharerParticipantId) {
            for (const pub of participant.videoTrackPublications.values()) {
              if (pub.source === Track.Source.ScreenShare && pub.track && videoRef.current) {
                pub.track.attach(videoRef.current);
                setStatus("Watching");
              }
            }
          }
        }
      } catch (err) {
        setStatus("Connection failed");
        console.error("Popout screen share connection failed:", err);
      }
    });

    return () => {
      cleanup();
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
    };
  }, []);

  return (
    <div className="popout-screenshare">
      <div className="popout-header">
        <span>{sharerName ? `${sharerName}'s screen` : "Screen Share"}</span>
        <span className="popout-status">{status}</span>
      </div>
      <video ref={videoRef} autoPlay playsInline className="popout-screenshare-video" />
    </div>
  );
}
