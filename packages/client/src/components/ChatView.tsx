import { useState, useRef, useEffect, type FormEvent } from "react";
import { useChatStore } from "../stores/chat.js";
import { useAuthStore } from "../stores/auth.js";

export function ChatView() {
  const { messages, sendMessage, loadMoreMessages, hasMoreMessages, loadingMessages } = useChatStore();
  const { user } = useAuthStore();
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
  }

  function handleScroll() {
    if (!containerRef.current) return;
    if (containerRef.current.scrollTop === 0 && hasMoreMessages && !loadingMessages) {
      loadMoreMessages();
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
      <div className="messages-container" ref={containerRef} onScroll={handleScroll}>
        {loadingMessages && <div className="loading-messages">Loading...</div>}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.senderId === user?.id ? "own" : ""}`}
          >
            <div className="message-header">
              <span className="message-sender">{msg.senderId === user?.id ? "You" : msg.senderId.slice(0, 8)}</span>
              <span className="message-time">
                {new Date(msg.createdAt).toLocaleTimeString()}
              </span>
            </div>
            <div className="message-body">{decodeContent(msg.ciphertext)}</div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      <form className="message-input-form" onSubmit={handleSubmit}>
        <input
          type="text"
          className="message-input"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
        />
        <button type="submit" className="btn-send" disabled={!input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
