import { useState, useEffect, type FormEvent } from "react";
import { useChatStore } from "../stores/chat.js";
import { useAuthStore } from "../stores/auth.js";
import * as api from "../lib/api.js";

export function DMSidebar() {
  const { dmChannels, activeDMChannelId, selectDM, openDM, loadDMChannels, onlineUsers } = useChatStore();
  const { user } = useAuthStore();
  const [showSearch, setShowSearch] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; username: string }[]>([]);

  useEffect(() => {
    loadDMChannels();
  }, [loadDMChannels]);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!searchInput.trim()) return;
    try {
      const results = await api.searchUsers(searchInput.trim());
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    }
  }

  function handleStartDM(userId: string) {
    openDM(userId);
    setShowSearch(false);
    setSearchInput("");
    setSearchResults([]);
  }

  return (
    <div className="channel-sidebar dm-sidebar">
      <div className="channel-sidebar-header">
        <h3>Direct Messages</h3>
      </div>

      <div className="dm-actions">
        <button className="btn-small dm-new-btn" onClick={() => setShowSearch(!showSearch)}>
          New Message
        </button>
      </div>

      {showSearch && (
        <div className="dm-search-panel">
          <form onSubmit={handleSearch}>
            <input
              type="text"
              placeholder="Search users..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              autoFocus
            />
          </form>
          {searchResults.map((u) => (
            <button key={u.id} className="dm-search-result" onClick={() => handleStartDM(u.id)}>
              <span className={`status-dot ${onlineUsers.has(u.id) ? "online" : "offline"}`} />
              {u.username}
            </button>
          ))}
        </div>
      )}

      <div className="channel-list">
        {dmChannels.map((dm) => (
          <button
            key={dm.id}
            className={`channel-item ${dm.id === activeDMChannelId ? "active" : ""}`}
            onClick={() => selectDM(dm.id)}
          >
            <span className={`status-dot ${onlineUsers.has(dm.otherUser.id) ? "online" : "offline"}`} />
            {dm.otherUser.username}
          </button>
        ))}
        {dmChannels.length === 0 && !showSearch && (
          <div className="dm-empty">No conversations yet</div>
        )}
      </div>
    </div>
  );
}
