import { create } from "zustand";
import { Room, RoomEvent, Track } from "livekit-client";
import type { VoiceParticipant } from "@flux/shared";
import * as api from "../lib/api.js";
import { gateway } from "../lib/ws.js";

function playTone(frequencies: number[], duration = 0.08) {
  const ctx = new AudioContext();
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.value = 0.15;
  let t = ctx.currentTime;
  for (const freq of frequencies) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(t);
    osc.stop(t + duration);
    t += duration + 0.02;
  }
  gain.gain.setValueAtTime(0.15, t - 0.02);
  gain.gain.linearRampToValueAtTime(0, t + 0.05);
  setTimeout(() => ctx.close(), (t - ctx.currentTime + 0.1) * 1000);
}

function playJoinSound() {
  playTone([440, 580]);
}

function playLeaveSound() {
  playTone([520, 380]);
}

interface VoiceUser {
  userId: string;
  username: string;
  speaking: boolean;
}

interface AudioSettings {
  noiseSuppression: boolean;
  echoCancellation: boolean;
  autoGainControl: boolean;
  dtx: boolean;
}

interface ScreenShareInfo {
  participantId: string;
  username: string;
}

interface VoiceState {
  // Connection state
  room: Room | null;
  connectedChannelId: string | null;
  connecting: boolean;
  connectionError: string | null;

  // Local user controls
  isMuted: boolean;
  isDeafened: boolean;

  // Audio settings
  audioSettings: AudioSettings;

  // Screen share
  isScreenSharing: boolean;
  screenSharers: ScreenShareInfo[];

  // Participants in the current room (from LiveKit)
  participants: VoiceUser[];

  // Voice channel occupancy (from WebSocket, for sidebar)
  channelParticipants: Record<string, VoiceParticipant[]>;

  // Actions
  joinVoiceChannel: (channelId: string) => Promise<void>;
  leaveVoiceChannel: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  updateAudioSetting: (key: keyof AudioSettings, value: boolean) => void;
  toggleScreenShare: () => Promise<void>;

  // Internal
  _updateParticipants: () => void;
  _updateScreenSharers: () => void;
  _setChannelParticipants: (channelId: string, participants: VoiceParticipant[]) => void;
}

const DEFAULT_SETTINGS: AudioSettings = {
  noiseSuppression: true,
  echoCancellation: true,
  autoGainControl: true,
  dtx: false,
};

export const useVoiceStore = create<VoiceState>((set, get) => ({
  room: null,
  connectedChannelId: null,
  connecting: false,
  connectionError: null,
  isMuted: false,
  isDeafened: false,
  audioSettings: { ...DEFAULT_SETTINGS },
  isScreenSharing: false,
  screenSharers: [],
  participants: [],
  channelParticipants: {},

  joinVoiceChannel: async (channelId: string) => {
    const { room: existingRoom, connectedChannelId, audioSettings } = get();

    // Already in this channel
    if (connectedChannelId === channelId) return;

    // Leave current voice channel first
    if (existingRoom) {
      get().leaveVoiceChannel();
    }

    set({ connecting: true, connectionError: null });

    try {
      const { token, url } = await api.getVoiceToken(channelId);

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: audioSettings.echoCancellation,
          noiseSuppression: audioSettings.noiseSuppression,
          autoGainControl: audioSettings.autoGainControl,
          sampleRate: 48000,
          channelCount: 2,
        },
        publishDefaults: {
          audioPreset: {
            maxBitrate: 128_000,
          },
          dtx: audioSettings.dtx,
          red: true,
          screenShareEncoding: {
            maxBitrate: 3_000_000,
            maxFramerate: 30,
          },
        },
      });

      room.on(RoomEvent.ParticipantConnected, () => get()._updateParticipants());
      room.on(RoomEvent.ParticipantDisconnected, () => {
        get()._updateParticipants();
        get()._updateScreenSharers();
      });
      room.on(RoomEvent.ActiveSpeakersChanged, () => get()._updateParticipants());
      room.on(RoomEvent.TrackMuted, () => get()._updateParticipants());
      room.on(RoomEvent.TrackUnmuted, () => get()._updateParticipants());

      // Attach remote audio tracks to DOM so they actually play
      room.on(RoomEvent.TrackSubscribed, (track, _publication, _participant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.id = `lk-audio-${track.sid}`;
          document.body.appendChild(el);
        }
        if (track.kind === Track.Kind.Video) {
          get()._updateScreenSharers();
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
        if (track.kind === Track.Kind.Video) {
          get()._updateScreenSharers();
        }
      });
      room.on(RoomEvent.LocalTrackPublished, () => get()._updateScreenSharers());
      room.on(RoomEvent.LocalTrackUnpublished, () => {
        set({ isScreenSharing: false });
        get()._updateScreenSharers();
      });
      room.on(RoomEvent.Disconnected, () => {
        set({
          room: null,
          connectedChannelId: null,
          participants: [],
          isMuted: false,
          isDeafened: false,
          isScreenSharing: false,
          screenSharers: [],
        });
      });

      await room.connect(url, token);
      await room.localParticipant.setMicrophoneEnabled(true);

      set({
        room,
        connectedChannelId: channelId,
        connecting: false,
        isMuted: false,
        isDeafened: false,
        isScreenSharing: false,
        screenSharers: [],
      });

      get()._updateParticipants();

      playJoinSound();

      // Notify server via WebSocket
      gateway.send({ type: "voice_state_update", channelId, action: "join" });
    } catch (err) {
      set({
        connecting: false,
        connectionError: err instanceof Error ? err.message : "Failed to connect to voice",
      });
    }
  },

  leaveVoiceChannel: () => {
    const { room, connectedChannelId, channelParticipants } = get();
    const localId = room?.localParticipant?.identity;

    playLeaveSound();

    if (room) {
      // Clean up any attached audio/video elements
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.audioTrackPublications.values()) {
          if (publication.track) {
            publication.track.detach().forEach((el) => el.remove());
          }
        }
        for (const publication of participant.videoTrackPublications.values()) {
          if (publication.track) {
            publication.track.detach().forEach((el) => el.remove());
          }
        }
      }
      room.disconnect();
    }
    if (connectedChannelId) {
      gateway.send({ type: "voice_state_update", channelId: connectedChannelId, action: "leave" });
    }

    // Optimistically remove self from sidebar participants
    const updatedParticipants = { ...channelParticipants };
    if (connectedChannelId && updatedParticipants[connectedChannelId] && localId) {
      updatedParticipants[connectedChannelId] = updatedParticipants[connectedChannelId].filter(
        (p) => p.userId !== localId
      );
    }

    set({
      room: null,
      connectedChannelId: null,
      participants: [],
      channelParticipants: updatedParticipants,
      isMuted: false,
      isDeafened: false,
      connecting: false,
      isScreenSharing: false,
      screenSharers: [],
    });
  },

  toggleMute: () => {
    const { room, isMuted } = get();
    if (!room) return;
    room.localParticipant.setMicrophoneEnabled(isMuted);
    set({ isMuted: !isMuted });
  },

  toggleDeafen: () => {
    const { room, isDeafened, isMuted } = get();
    if (!room) return;

    const newDeafened = !isDeafened;

    // Mute/unmute all remote audio elements in the DOM
    document.querySelectorAll<HTMLAudioElement>('audio[id^="lk-audio-"]').forEach((el) => {
      el.muted = newDeafened;
    });

    if (newDeafened && !isMuted) {
      room.localParticipant.setMicrophoneEnabled(false);
      set({ isDeafened: newDeafened, isMuted: true });
    } else {
      set({ isDeafened: newDeafened });
    }
  },

  updateAudioSetting: (key: keyof AudioSettings, value: boolean) => {
    const { room, audioSettings } = get();
    const newSettings = { ...audioSettings, [key]: value };
    set({ audioSettings: newSettings });

    if (!room) return;

    // Apply DTX change immediately (requires republishing)
    if (key === "dtx") {
      // DTX applies to next publish, so re-enable mic to pick it up
      const micEnabled = room.localParticipant.isMicrophoneEnabled;
      if (micEnabled) {
        room.localParticipant.setMicrophoneEnabled(false).then(() => {
          room.localParticipant.setMicrophoneEnabled(true, {
            echoCancellation: newSettings.echoCancellation,
            noiseSuppression: newSettings.noiseSuppression,
            autoGainControl: newSettings.autoGainControl,
          });
        });
      }
    }

    // Apply audio processing changes immediately
    if (key === "noiseSuppression" || key === "echoCancellation" || key === "autoGainControl") {
      const micEnabled = room.localParticipant.isMicrophoneEnabled;
      if (micEnabled) {
        room.localParticipant.setMicrophoneEnabled(false).then(() => {
          room.localParticipant.setMicrophoneEnabled(true, {
            echoCancellation: newSettings.echoCancellation,
            noiseSuppression: newSettings.noiseSuppression,
            autoGainControl: newSettings.autoGainControl,
          });
        });
      }
    }
  },

  toggleScreenShare: async () => {
    const { room, isScreenSharing } = get();
    if (!room) return;

    try {
      if (isScreenSharing) {
        await room.localParticipant.setScreenShareEnabled(false);
        set({ isScreenSharing: false });
      } else {
        await room.localParticipant.setScreenShareEnabled(true, {
          audio: true,
          resolution: { width: 1920, height: 1080, frameRate: 30 },
        });
        set({ isScreenSharing: true });
      }
      get()._updateScreenSharers();
    } catch (err) {
      // User cancelled screen share picker — not an error
      if (err instanceof Error && err.message.includes("Permission denied")) return;
      console.error("Screen share error:", err);
    }
  },

  _updateParticipants: () => {
    const { room } = get();
    if (!room) return;

    const activeSpeakerIds = new Set(
      room.activeSpeakers.map((s) => s.identity)
    );

    const users: VoiceUser[] = [];

    const local = room.localParticipant;
    users.push({
      userId: local.identity,
      username: local.name ?? local.identity.slice(0, 8),
      speaking: activeSpeakerIds.has(local.identity),
    });

    for (const participant of room.remoteParticipants.values()) {
      users.push({
        userId: participant.identity,
        username: participant.name ?? participant.identity.slice(0, 8),
        speaking: activeSpeakerIds.has(participant.identity),
      });
    }

    set({ participants: users });
  },

  _updateScreenSharers: () => {
    const { room } = get();
    if (!room) return;

    const sharers: ScreenShareInfo[] = [];

    // Check local
    for (const pub of room.localParticipant.videoTrackPublications.values()) {
      if (pub.source === Track.Source.ScreenShare) {
        sharers.push({
          participantId: room.localParticipant.identity,
          username: room.localParticipant.name ?? room.localParticipant.identity.slice(0, 8),
        });
        break;
      }
    }

    // Check remote
    for (const participant of room.remoteParticipants.values()) {
      for (const pub of participant.videoTrackPublications.values()) {
        if (pub.source === Track.Source.ScreenShare) {
          sharers.push({
            participantId: participant.identity,
            username: participant.name ?? participant.identity.slice(0, 8),
          });
          break;
        }
      }
    }

    set({ screenSharers: sharers });
  },

  _setChannelParticipants: (channelId: string, participants: VoiceParticipant[]) => {
    set((state) => ({
      channelParticipants: {
        ...state.channelParticipants,
        [channelId]: participants,
      },
    }));
  },
}));

// Listen for voice_state events from WebSocket (for sidebar display)
gateway.on((event) => {
  if (event.type === "voice_state") {
    useVoiceStore.getState()._setChannelParticipants(event.channelId, event.participants);
  }
});
