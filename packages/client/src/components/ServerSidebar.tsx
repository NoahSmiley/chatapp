import { useState } from "react";
import { useChatStore } from "../stores/chat.js";

export function ServerSidebar() {
  const { servers, activeServerId, selectServer, createServer, joinServer } = useChatStore();
  const [showModal, setShowModal] = useState<"create" | "join" | null>(null);
  const [input, setInput] = useState("");

  async function handleSubmit() {
    if (!input.trim()) return;
    if (showModal === "create") {
      await createServer(input.trim());
    } else if (showModal === "join") {
      await joinServer(input.trim());
    }
    setInput("");
    setShowModal(null);
  }

  return (
    <div className="server-sidebar">
      {servers.map((server) => (
        <button
          key={server.id}
          className={`server-icon ${server.id === activeServerId ? "active" : ""}`}
          onClick={() => selectServer(server.id)}
          title={server.name}
        >
          {server.name.charAt(0).toUpperCase()}
        </button>
      ))}

      <div className="server-sidebar-divider" />

      <button
        className="server-icon add-server"
        onClick={() => setShowModal("create")}
        title="Create Server"
      >
        +
      </button>

      <button
        className="server-icon add-server"
        onClick={() => setShowModal("join")}
        title="Join Server"
      >
        &#8594;
      </button>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{showModal === "create" ? "Create Server" : "Join Server"}</h3>
            <input
              type="text"
              placeholder={showModal === "create" ? "Server name" : "Invite code"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn-small" onClick={() => setShowModal(null)}>Cancel</button>
              <button className="btn-primary btn-small" onClick={handleSubmit}>
                {showModal === "create" ? "Create" : "Join"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
