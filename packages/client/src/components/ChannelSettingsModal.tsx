import { useState, type FormEvent } from "react";
import type { Channel } from "@flux/shared";
import * as api from "../lib/api.js";
import { useChatStore } from "../stores/chat.js";
import { useVoiceStore } from "../stores/voice.js";

interface Props {
  channel: Channel;
  serverId: string;
  onClose: () => void;
}

export function ChannelSettingsModal({ channel, serverId, onClose }: Props) {
  const [name, setName] = useState(channel.name);
  const [bitrate, setBitrate] = useState(channel.bitrate ?? 128_000);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const updates: { name?: string; bitrate?: number | null } = {};

      if (name.trim() !== channel.name) {
        updates.name = name.trim();
      }

      if (channel.type === "voice") {
        const newBitrate = bitrate;
        if (newBitrate !== (channel.bitrate ?? 128_000)) {
          updates.bitrate = newBitrate;
        }
      }

      if (Object.keys(updates).length > 0) {
        const updated = await api.updateChannel(serverId, channel.id, updates);
        // Update in chat store
        const { channels } = useChatStore.getState();
        useChatStore.setState({
          channels: channels.map((c) => (c.id === channel.id ? updated : c)),
        });

        // If bitrate changed and we're connected to this channel, apply live
        if (updates.bitrate !== undefined) {
          const { connectedChannelId, applyBitrate } = useVoiceStore.getState();
          if (connectedChannelId === channel.id) {
            applyBitrate(updates.bitrate ?? 128_000);
          }
        }
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update channel");
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete #${channel.name}? This cannot be undone.`)) return;

    try {
      await api.deleteChannel(serverId, channel.id);
      const { channels, activeChannelId, selectChannel } = useChatStore.getState();
      const remaining = channels.filter((c) => c.id !== channel.id);
      useChatStore.setState({ channels: remaining });

      // If this was the active channel, switch to another
      if (activeChannelId === channel.id && remaining.length > 0) {
        selectChannel(remaining[0].id);
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete channel");
    }
  }

  return (
    <div className="modal-overlay channel-settings-modal" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Channel Settings</h3>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSave}>
          <div className="field">
            <span>Channel Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))}
            />
          </div>

          {channel.type === "voice" && (
            <div className="channel-settings-section">
              <h4>Voice Settings</h4>
              <div className="channel-settings-row">
                <div className="audio-setting-slider-label">
                  <label>Bitrate</label>
                  <span className="channel-settings-value">{bitrate / 1000} kbps</span>
                </div>
                <input
                  type="range"
                  min="8000"
                  max="384000"
                  step="8000"
                  value={bitrate}
                  onChange={(e) => setBitrate(parseInt(e.target.value))}
                  className="settings-slider"
                />
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-danger" onClick={handleDelete}>
              Delete Channel
            </button>
            <button type="button" className="btn-small" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving} style={{ width: "auto", padding: "8px 24px" }}>
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
