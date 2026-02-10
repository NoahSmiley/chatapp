import { create } from "zustand";
import { Room, RoomEvent } from "livekit-client";
import type { VoiceParticipant } from "@flux/shared";
import * as api from "../lib/api.js";
import { gateway } from "../lib/ws.js";

interface VoiceUser {
  userId: string;
  username: string;
  speaking: boolean;
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

  // Participants in the current room (from LiveKit)
  participants: VoiceUser[];

  // Voice channel occupancy (from WebSocket, for sidebar)
  channelParticipants: Record<string, VoiceParticipant[]>;

  // Actions
  joinVoiceChannel: (channelId: string) => Promise<void>;
  leaveVoiceChannel: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;

  // Internal
  _updateParticipants: () => void;
  _setChannelParticipants: (channelId: string, participants: VoiceParticipant[]) => void;
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  room: null,
  connectedChannelId: null,
  connecting: false,
  connectionError: null,
  isMuted: false,
  isDeafened: false,
  participants: [],
  channelParticipants: {},

  joinVoiceChannel: async (channelId: string) => {
    const { room: existingRoom, connectedChannelId } = get();

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
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      room.on(RoomEvent.ParticipantConnected, () => get()._updateParticipants());
      room.on(RoomEvent.ParticipantDisconnected, () => get()._updateParticipants());
      room.on(RoomEvent.ActiveSpeakersChanged, () => get()._updateParticipants());
      room.on(RoomEvent.TrackMuted, () => get()._updateParticipants());
      room.on(RoomEvent.TrackUnmuted, () => get()._updateParticipants());
      room.on(RoomEvent.Disconnected, () => {
        set({
          room: null,
          connectedChannelId: null,
          participants: [],
          isMuted: false,
          isDeafened: false,
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
      });

      get()._updateParticipants();

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

    if (room) {
      room.disconnect();
    }
    if (connectedChannelId) {
      gateway.send({ type: "voice_state_update", channelId: connectedChannelId, action: "leave" });
    }

    // Optimistically remove self from sidebar participants
    // (in case the server broadcast doesn't arrive due to WS reconnect)
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
    });
  },

  toggleMute: () => {
    const { room, isMuted } = get();
    if (!room) return;
    // If muted, enable mic; if unmuted, disable mic
    room.localParticipant.setMicrophoneEnabled(isMuted);
    set({ isMuted: !isMuted });
  },

  toggleDeafen: () => {
    const { room, isDeafened, isMuted } = get();
    if (!room) return;

    const newDeafened = !isDeafened;

    // Mute/unmute all remote audio tracks
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.audioTrackPublications.values()) {
        if (publication.track) {
          publication.track.setEnabled(!newDeafened);
        }
      }
    }

    // Deafening auto-mutes (Discord convention)
    if (newDeafened && !isMuted) {
      room.localParticipant.setMicrophoneEnabled(false);
      set({ isDeafened: newDeafened, isMuted: true });
    } else {
      set({ isDeafened: newDeafened });
    }
  },

  _updateParticipants: () => {
    const { room } = get();
    if (!room) return;

    const activeSpeakerIds = new Set(
      room.activeSpeakers.map((s) => s.identity)
    );

    const users: VoiceUser[] = [];

    // Local participant
    const local = room.localParticipant;
    users.push({
      userId: local.identity,
      username: local.name ?? local.identity.slice(0, 8),
      speaking: activeSpeakerIds.has(local.identity),
    });

    // Remote participants
    for (const participant of room.remoteParticipants.values()) {
      users.push({
        userId: participant.identity,
        username: participant.name ?? participant.identity.slice(0, 8),
        speaking: activeSpeakerIds.has(participant.identity),
      });
    }

    set({ participants: users });
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
