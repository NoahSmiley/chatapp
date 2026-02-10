import { useState, useRef, useEffect, useMemo, type FormEvent, type ReactNode, type KeyboardEvent } from "react";
import { useChatStore, getUsernameMap } from "../stores/chat.js";
import { useAuthStore } from "../stores/auth.js";

const QUICK_EMOJIS = ["👍", "👎", "❤️", "😂", "😮", "😢", "🔥", "🎉", "👀", "💯"];

const URL_REGEX = /https?:\/\/[^\s<]+/g;
const MENTION_REGEX = /@([a-zA-Z0-9_-]+)/g;

function renderMessageContent(text: string, memberUsernames: Set<string>): ReactNode[] {
  const segments: ReactNode[] = [];
  let lastIndex = 0;

  const matches: { index: number; length: number; type: "url" | "mention"; value: string }[] = [];

  let m: RegExpExecArray | null;
  URL_REGEX.lastIndex = 0;
  while ((m = URL_REGEX.exec(text)) !== null) {
    matches.push({ index: m.index, length: m[0].length, type: "url", value: m[0] });
  }
  MENTION_REGEX.lastIndex = 0;
  while ((m = MENTION_REGEX.exec(text)) !== null) {
    if (memberUsernames.has(m[1])) {
      matches.push({ index: m.index, length: m[0].length, type: "mention", value: m[0] });
    }
  }

  matches.sort((a, b) => a.index - b.index);

  for (const match of matches) {
    if (match.index < lastIndex) continue;
    if (match.index > lastIndex) {
      segments.push(text.slice(lastIndex, match.index));
    }
    if (match.type === "url") {
      segments.push(
        <a key={match.index} href={match.value} target="_blank" rel="noopener noreferrer">
          {match.value}
        </a>
      );
    } else {
      segments.push(
        <span key={match.index} className="mention">{match.value}</span>
      );
    }
    lastIndex = match.index + match.length;
  }

  if (lastIndex < text.length) {
    segments.push(text.slice(lastIndex));
  }

  return segments.length > 0 ? segments : [text];
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export function ChatView() {
  const {
    messages, sendMessage, loadMoreMessages, hasMoreMessages, loadingMessages,
    members, onlineUsers, reactions, addReaction, removeReaction,
    searchMessages, searchResults, searchQuery, clearSearch,
  } = useChatStore();
  const { user } = useAuthStore();
  const [input, setInput] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mention autocomplete
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const usernameMap = useMemo(() => getUsernameMap(members), [members]);
  const memberUsernames = useMemo(() => new Set(members.map((m) => m.username)), [members]);

  const filteredMentions = useMemo(() => {
    if (!mentionActive) return [];
    const q = mentionQuery.toLowerCase();
    return members.filter((m) => m.username.toLowerCase().includes(q) && m.userId !== user?.id).slice(0, 8);
  }, [mentionActive, mentionQuery, members, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!emojiPickerMsgId) return;
    const handler = () => setEmojiPickerMsgId(null);
    const timer = setTimeout(() => document.addEventListener("click", handler), 0);
    return () => { clearTimeout(timer); document.removeEventListener("click", handler); };
  }, [emojiPickerMsgId]);

  const displayMessages = searchResults ?? messages;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage(input);
    setInput("");
    setMentionActive(false);
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

  function handlePopOut() {
    window.flux?.openPopoutWindow("chat");
  }

  function handleCopy(text: string, id: string) {
    copyToClipboard(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    if (searchInput.trim()) {
      searchMessages(searchInput.trim());
    }
  }

  function handleInputChange(value: string) {
    setInput(value);
    const cursorPos = inputRef.current?.selectionStart ?? value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([a-zA-Z0-9_-]*)$/);
    if (atMatch) {
      setMentionActive(true);
      setMentionQuery(atMatch[1]);
      setMentionIndex(0);
    } else {
      setMentionActive(false);
    }
  }

  function insertMention(username: string) {
    const cursorPos = inputRef.current?.selectionStart ?? input.length;
    const textBeforeCursor = input.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    if (atIndex === -1) return;
    const newInput = input.slice(0, atIndex) + `@${username} ` + input.slice(cursorPos);
    setInput(newInput);
    setMentionActive(false);
    setTimeout(() => {
      const newPos = atIndex + username.length + 2;
      inputRef.current?.setSelectionRange(newPos, newPos);
      inputRef.current?.focus();
    }, 0);
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (mentionActive && filteredMentions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filteredMentions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Tab" || (e.key === "Enter" && mentionActive)) {
        e.preventDefault();
        insertMention(filteredMentions[mentionIndex].username);
      } else if (e.key === "Escape") {
        setMentionActive(false);
      }
    }
  }

  return (
    <div className="chat-view">
      <div className="chat-header">
        <form className="search-bar" onSubmit={handleSearchSubmit}>
          <input
            type="text"
            placeholder="Search messages..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {searchResults && (
            <button type="button" className="btn-small" onClick={() => { clearSearch(); setSearchInput(""); }}>
              Clear
            </button>
          )}
        </form>
        <button className="btn-small popout-btn" onClick={handlePopOut} title="Pop out chat">
          &#x2197;
        </button>
      </div>

      {searchResults && (
        <div className="search-results-banner">
          {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &quot;{searchQuery}&quot;
        </div>
      )}

      <div className="messages-container" ref={containerRef} onScroll={handleScroll}>
        {loadingMessages && <div className="loading-messages">Loading...</div>}

        {displayMessages.map((msg) => {
          const senderName = msg.senderId === user?.id ? "You" : (usernameMap[msg.senderId] ?? msg.senderId.slice(0, 8));
          const isOnline = onlineUsers.has(msg.senderId);
          const msgReactions = reactions[msg.id] ?? [];
          const decoded = decodeContent(msg.ciphertext);

          return (
            <div key={msg.id} className={`message ${msg.senderId === user?.id ? "own" : ""}`}>
              <div className="message-header">
                <span className={`status-dot ${isOnline ? "online" : "offline"}`} />
                <span
                  className={`message-sender ${copiedId === `s-${msg.id}` ? "copied" : ""}`}
                  onClick={() => handleCopy(senderName === "You" ? (user?.username ?? "") : senderName, `s-${msg.id}`)}
                  title="Click to copy username"
                >
                  {senderName}
                </span>
                <span
                  className={`message-time ${copiedId === `t-${msg.id}` ? "copied" : ""}`}
                  onClick={() => handleCopy(new Date(msg.createdAt).toLocaleString(), `t-${msg.id}`)}
                  title="Click to copy timestamp"
                >
                  {new Date(msg.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="message-body">
                {renderMessageContent(decoded, memberUsernames)}
              </div>

              <div className="message-reactions">
                {msgReactions.map(({ emoji, userIds }) => (
                  <button
                    key={emoji}
                    className={`reaction-chip ${userIds.includes(user?.id ?? "") ? "own" : ""}`}
                    onClick={() =>
                      userIds.includes(user?.id ?? "")
                        ? removeReaction(msg.id, emoji)
                        : addReaction(msg.id, emoji)
                    }
                    title={userIds.map((id) => usernameMap[id] ?? id.slice(0, 8)).join(", ")}
                  >
                    {emoji} {userIds.length}
                  </button>
                ))}
                <div className="reaction-add-wrapper">
                  <button
                    className="reaction-add-btn"
                    onClick={(e) => { e.stopPropagation(); setEmojiPickerMsgId(emojiPickerMsgId === msg.id ? null : msg.id); }}
                  >
                    +
                  </button>
                  {emojiPickerMsgId === msg.id && (
                    <div className="emoji-picker" onClick={(e) => e.stopPropagation()}>
                      {QUICK_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          onClick={() => { addReaction(msg.id, emoji); setEmojiPickerMsgId(null); }}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={messagesEndRef} />
      </div>

      <div className="message-input-wrapper">
        {mentionActive && filteredMentions.length > 0 && (
          <div className="mention-autocomplete">
            {filteredMentions.map((m, i) => (
              <button
                key={m.userId}
                className={`mention-option ${i === mentionIndex ? "selected" : ""}`}
                onMouseDown={(e) => { e.preventDefault(); insertMention(m.username); }}
              >
                <span className={`status-dot ${onlineUsers.has(m.userId) ? "online" : "offline"}`} />
                {m.username}
              </button>
            ))}
          </div>
        )}
        <form className="message-input-form" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className="message-input"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleInputKeyDown}
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
