import { create } from "zustand";
import { Room, RoomEvent, Track } from "livekit-client";
import type { VoiceParticipant } from "@flux/shared";
import * as api from "../lib/api.js";
import { gateway } from "../lib/ws.js";
import { broadcastState, onCommand, isPopout } from "../lib/broadcast.js";

// ── Sound Effects ──

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

function playScreenShareStartSound() {
  playTone([660, 880], 0.06);
}

function playScreenShareStopSound() {
  playTone([880, 660], 0.06);
}

// ── Audio Pipeline (Web Audio API) ──

interface AudioPipeline {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  highPass: BiquadFilterNode;
  lowPass: BiquadFilterNode;
  gain: GainNode;
}

const audioPipelines = new Map<string, AudioPipeline>();

function createAudioPipeline(
  audioElement: HTMLAudioElement,
  trackSid: string,
  settings: AudioSettings,
  volume: number,
): AudioPipeline {
  const context = new AudioContext();
  const source = context.createMediaElementSource(audioElement);

  const highPass = context.createBiquadFilter();
  highPass.type = "highpass";
  highPass.frequency.value = settings.highPassFrequency > 0 ? settings.highPassFrequency : 0;

  const lowPass = context.createBiquadFilter();
  lowPass.type = "lowpass";
  lowPass.frequency.value = settings.lowPassFrequency > 0 ? settings.lowPassFrequency : 24000;

  const gain = context.createGain();
  gain.gain.value = volume;

  source.connect(highPass);
  highPass.connect(lowPass);
  lowPass.connect(gain);
  gain.connect(context.destination);

  const pipeline: AudioPipeline = { context, source, highPass, lowPass, gain };
  audioPipelines.set(trackSid, pipeline);
  return pipeline;
}

function destroyAudioPipeline(trackSid: string) {
  const pipeline = audioPipelines.get(trackSid);
  if (pipeline) {
    pipeline.context.close();
    audioPipelines.delete(trackSid);
  }
}

function destroyAllPipelines() {
  for (const trackSid of [...audioPipelines.keys()]) {
    destroyAudioPipeline(trackSid);
  }
}

// ── Types ──

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
  highPassFrequency: number;
  lowPassFrequency: number;
  bitrate: number;
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

  // Per-user volume
  participantVolumes: Record<string, number>;
  participantTrackMap: Record<string, string>;

  // Screen share
  isScreenSharing: boolean;
  screenSharers: ScreenShareInfo[];
  watchingScreenShare: string | null;

  // Participants in the current room (from LiveKit)
  participants: VoiceUser[];

  // Voice channel occupancy (from WebSocket, for sidebar)
  channelParticipants: Record<string, VoiceParticipant[]>;

  // Actions
  joinVoiceChannel: (channelId: string) => Promise<void>;
  leaveVoiceChannel: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  updateAudioSetting: (key: keyof AudioSettings, value: boolean | number) => void;
  toggleScreenShare: () => Promise<void>;
  setParticipantVolume: (participantId: string, volume: number) => void;
  watchScreenShare: (participantId: string) => void;
  stopWatchingScreenShare: () => void;

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
  highPassFrequency: 0,
  lowPassFrequency: 0,
  bitrate: 128_000,
};

export const useVoiceStore = create<VoiceState>((set, get) => ({
  room: null,
  connectedChannelId: null,
  connecting: false,
  connectionError: null,
  isMuted: false,
  isDeafened: false,
  audioSettings: { ...DEFAULT_SETTINGS },
  participantVolumes: {},
  participantTrackMap: {},
  isScreenSharing: false,
  screenSharers: [],
  watchingScreenShare: null,
  participants: [],
  channelParticipants: {},

  joinVoiceChannel: async (channelId: string) => {
    const { room: existingRoom, connectedChannelId, audioSettings } = get();

    if (connectedChannelId === channelId) return;

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
            maxBitrate: audioSettings.bitrate,
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

      // Attach remote audio tracks with Web Audio pipeline
      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.id = `lk-audio-${track.sid}`;
          document.body.appendChild(el);

          // Create audio pipeline for filtering + volume
          const { audioSettings: settings, participantVolumes, isDeafened } = get();
          const volume = isDeafened ? 0 : (participantVolumes[participant.identity] ?? 1.0);
          createAudioPipeline(el, track.sid!, settings, volume);

          // Track participant → track mapping
          set((state) => ({
            participantTrackMap: {
              ...state.participantTrackMap,
              [participant.identity]: track.sid!,
            },
          }));
        }
        if (track.kind === Track.Kind.Video) {
          get()._updateScreenSharers();
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track, _publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          destroyAudioPipeline(track.sid!);
          if (participant) {
            set((state) => {
              const newMap = { ...state.participantTrackMap };
              delete newMap[participant.identity];
              return { participantTrackMap: newMap };
            });
          }
        }
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
        destroyAllPipelines();
        set({
          room: null,
          connectedChannelId: null,
          participants: [],
          isMuted: false,
          isDeafened: false,
          isScreenSharing: false,
          screenSharers: [],
          participantTrackMap: {},
          watchingScreenShare: null,
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
        participantTrackMap: {},
        watchingScreenShare: null,
      });

      get()._updateParticipants();
      get()._updateScreenSharers();

      playJoinSound();

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

    // Destroy all audio pipelines
    destroyAllPipelines();

    if (room) {
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

    const updatedParticipants = { ...channelParticipants };
    if (connectedChannelId && updatedParticipants[connectedChannelId] && localId) {
      updatedParticipants[connectedChannelId] = updatedParticipants[connectedChannelId].filter(
        (p) => p.userId !== localId,
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
      participantTrackMap: {},
      watchingScreenShare: null,
    });
  },

  toggleMute: () => {
    const { room, isMuted } = get();
    if (!room) return;
    room.localParticipant.setMicrophoneEnabled(isMuted);
    set({ isMuted: !isMuted });
  },

  toggleDeafen: () => {
    const { room, isDeafened, isMuted, participantVolumes, participantTrackMap } = get();
    if (!room) return;

    const newDeafened = !isDeafened;

    if (newDeafened) {
      // Mute all audio via gain nodes
      for (const pipeline of audioPipelines.values()) {
        pipeline.gain.gain.value = 0;
      }
    } else {
      // Restore per-user volumes
      for (const [identity, trackSid] of Object.entries(participantTrackMap)) {
        const pipeline = audioPipelines.get(trackSid);
        if (pipeline) {
          pipeline.gain.gain.value = participantVolumes[identity] ?? 1.0;
        }
      }
    }

    if (newDeafened && !isMuted) {
      room.localParticipant.setMicrophoneEnabled(false);
      set({ isDeafened: newDeafened, isMuted: true });
    } else {
      set({ isDeafened: newDeafened });
    }
  },

  setParticipantVolume: (participantId: string, volume: number) => {
    const { participantTrackMap, isDeafened } = get();

    set((state) => ({
      participantVolumes: {
        ...state.participantVolumes,
        [participantId]: volume,
      },
    }));

    if (isDeafened) return;

    const trackSid = participantTrackMap[participantId];
    if (trackSid) {
      const pipeline = audioPipelines.get(trackSid);
      if (pipeline) {
        pipeline.gain.gain.value = volume;
      }
    }
  },

  updateAudioSetting: (key: keyof AudioSettings, value: boolean | number) => {
    const { room, audioSettings } = get();
    const newSettings = { ...audioSettings, [key]: value } as AudioSettings;
    set({ audioSettings: newSettings });

    // Apply filter changes instantly to all pipelines
    if (key === "highPassFrequency") {
      for (const pipeline of audioPipelines.values()) {
        pipeline.highPass.frequency.value = (value as number) > 0 ? (value as number) : 0;
      }
      return;
    }
    if (key === "lowPassFrequency") {
      for (const pipeline of audioPipelines.values()) {
        pipeline.lowPass.frequency.value = (value as number) > 0 ? (value as number) : 24000;
      }
      return;
    }

    if (!room) return;

    // Bitrate change requires republishing
    if (key === "bitrate") {
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
      return;
    }

    // DTX or audio processing changes require republishing
    if (key === "dtx" || key === "noiseSuppression" || key === "echoCancellation" || key === "autoGainControl") {
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
      if (err instanceof Error && err.message.includes("Permission denied")) return;
      console.error("Screen share error:", err);
    }
  },

  watchScreenShare: (participantId: string) => {
    set({ watchingScreenShare: participantId });
  },

  stopWatchingScreenShare: () => {
    set({ watchingScreenShare: null });
  },

  _updateParticipants: () => {
    const { room } = get();
    if (!room) return;

    const activeSpeakerIds = new Set(
      room.activeSpeakers.map((s) => s.identity),
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
    const { room, screenSharers: previousSharers, watchingScreenShare } = get();
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

    // Detect new/removed screen sharers for sounds
    const prevIds = new Set(previousSharers.map((s) => s.participantId));
    const newIds = new Set(sharers.map((s) => s.participantId));

    let playedStart = false;
    for (const s of sharers) {
      if (!prevIds.has(s.participantId)) {
        if (!playedStart) {
          playScreenShareStartSound();
          playedStart = true;
        }
      }
    }

    let playedStop = false;
    let clearWatching = false;
    for (const s of previousSharers) {
      if (!newIds.has(s.participantId)) {
        if (!playedStop) {
          playScreenShareStopSound();
          playedStop = true;
        }
        if (watchingScreenShare === s.participantId) {
          clearWatching = true;
        }
      }
    }

    set({
      screenSharers: sharers,
      ...(clearWatching ? { watchingScreenShare: null } : {}),
    });
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

// ── BroadcastChannel: publish voice/screen share state to popout windows ──

// Track the LiveKit URL for popout connections
let lastLivekitUrl: string | null = null;
let lastLivekitToken: string | null = null;

function broadcastVoiceState() {
  const state = useVoiceStore.getState();
  const watchedSharer = state.screenSharers.find(
    (s) => s.participantId === state.watchingScreenShare,
  );
  broadcastState({
    type: "voice-state",
    livekitUrl: state.connectedChannelId ? lastLivekitUrl : null,
    livekitToken: state.connectedChannelId ? lastLivekitToken : null,
    watchingScreenShare: state.watchingScreenShare,
    screenSharerParticipantId: watchedSharer?.participantId ?? null,
    screenSharerUsername: watchedSharer?.username ?? null,
  });
}

if (!isPopout()) {
  // Store LiveKit connection info when joining (viewer token for popout use)
  const origJoin = useVoiceStore.getState().joinVoiceChannel;
  const wrappedJoin = async (channelId: string) => {
    await origJoin(channelId);
    // Fetch a viewer token for popout windows (different identity so it won't kick main)
    try {
      const { token, url } = await api.getVoiceToken(channelId, true);
      lastLivekitUrl = url;
      lastLivekitToken = token;
    } catch {
      // Non-critical
    }
  };
  useVoiceStore.setState({ joinVoiceChannel: wrappedJoin });

  // Broadcast voice state on changes
  useVoiceStore.subscribe(() => broadcastVoiceState());

  // Respond to request-state from popout windows
  onCommand((cmd) => {
    if (cmd.type === "request-state") {
      broadcastVoiceState();
    }
  });
}
