import { useState, useRef, useEffect, type FormEvent } from "react";
import { useChatStore } from "../stores/chat.js";
import { useAuthStore } from "../stores/auth.js";

export function DMChatView() {
  const {
    dmMessages, sendDM, loadMoreDMMessages, dmHasMore, loadingMessages,
    dmChannels, activeDMChannelId, onlineUsers,
  } = useChatStore();
  const { user } = useAuthStore();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const dm = dmChannels.find((d) => d.id === activeDMChannelId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dmMessages]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    sendDM(input);
    setInput("");
  }

  function handleScroll() {
    if (!containerRef.current) return;
    if (containerRef.current.scrollTop === 0 && dmHasMore && !loadingMessages) {
      loadMoreDMMessages();
    }
  }

  function decodeContent(ciphertext: string): string {
    try {
      return atob(ciphertext);
    } catch {
      return "[encrypted message]";
    }
  }

  return (
    <div className="chat-view">
      <div className="chat-header">
        <span className="dm-chat-title">
          {dm && (
            <>
              <span className={`status-dot ${onlineUsers.has(dm.otherUser.id) ? "online" : "offline"}`} />
              {dm.otherUser.username}
            </>
          )}
        </span>
      </div>

      <div className="messages-container" ref={containerRef} onScroll={handleScroll}>
        {loadingMessages && <div className="loading-messages">Loading...</div>}

        {dmMessages.map((msg) => {
          const senderName = msg.senderId === user?.id ? "You" : (dm?.otherUser.username ?? msg.senderId.slice(0, 8));
          const decoded = decodeContent(msg.ciphertext);

          return (
            <div key={msg.id} className={`message ${msg.senderId === user?.id ? "own" : ""}`}>
              <div className="message-header">
                <span className="message-sender">{senderName}</span>
                <span className="message-time">
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="message-body">{decoded}</div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      <div className="message-input-wrapper">
        <form className="message-input-form" onSubmit={handleSubmit}>
          <input
            type="text"
            className="message-input"
            placeholder={dm ? `Message @${dm.otherUser.username}` : "Type a message..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn-send" disabled={!input.trim()}>
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
