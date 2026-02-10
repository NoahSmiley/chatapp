import { useState, useRef, useEffect, type FormEvent } from "react";
import type { Message } from "@flux/shared";
import { onStateUpdate, sendCommand, type ChatStateMessage, type StateMessage } from "../lib/broadcast.js";

export function PopoutChatView() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [channelName, setChannelName] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleState = (msg: StateMessage) => {
      if (msg.type === "chat-state") {
        const chatMsg = msg as ChatStateMessage;
        setMessages(chatMsg.messages);
        setChannelName(chatMsg.channelName);
      }
    };
    const cleanup = onStateUpdate(handleState);
    // Request initial state from main window
    sendCommand({ type: "request-state" });
    return cleanup;
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    sendCommand({ type: "send-message", content: input });
    setInput("");
  }

  function decodeContent(ciphertext: string): string {
    try {
      return atob(ciphertext);
    } catch {
      return "[encrypted message]";
    }
  }

  return (
    <div className="popout-chat">
      <div className="popout-header">
        <span>{channelName ? `# ${channelName}` : "Chat"}</span>
      </div>
      <div className="messages-container popout-messages">
        {messages.map((msg) => (
          <div key={msg.id} className="message">
            <div className="message-header">
              <span className="message-sender">{msg.senderId.slice(0, 8)}</span>
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
