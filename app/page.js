"use client";

import { useEffect, useId, useRef, useState } from "react";
import { renderMarkdown } from "./lib/markdown";

// A faceted gem catching warm light — the MY·GPT mark. Deliberately not a
// sparkle/asterisk (that's Gemini's silhouette); this one is a cut-gem
// shape in the app's own brass gradient, reused for the sidebar mark, the
// assistant avatar, and the browser favicon (see app/icon.svg).
function BrandMark({ className }) {
  const gradId = useId();
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f8e0ab" />
          <stop offset="0.55" stopColor="#e0a94c" />
          <stop offset="1" stopColor="#a97a2f" />
        </linearGradient>
      </defs>
      <path d="M8 3H16L21 9L12 21L3 9L8 3Z" fill={`url(#${gradId})`} />
      <path
        d="M8 3L12 9L16 3"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <path d="M3 9H21" stroke="rgba(255,255,255,0.32)" strokeWidth="0.6" />
      <path d="M12 9V21" stroke="rgba(32,22,7,0.28)" strokeWidth="0.6" />
    </svg>
  );
}

const WELCOME_MESSAGE = {
  role: "assistant",
  content:
    "Hey, I'm MY·GPT — your personal AI assistant. Ask me anything, and I'll do my best to help.",
};

const SUGGESTIONS = [
  "Explain a tricky concept in plain terms",
  "Help me debug a piece of code",
  "Draft a clear, concise email",
  "Summarize something long for me",
];

const STORAGE_KEY = "mygpt.chats.v1";

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function newChat() {
  return {
    id: makeId(),
    title: "New chat",
    messages: [WELCOME_MESSAGE],
  };
}

export default function Home() {
  const [chats, setChats] = useState(() => [newChat()]);
  const [activeId, setActiveId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  // Hydrate saved sessions on first load.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.chats) && parsed.chats.length > 0) {
          setChats(parsed.chats);
          setActiveId(
            parsed.activeId && parsed.chats.some((c) => c.id === parsed.activeId)
              ? parsed.activeId
              : parsed.chats[0].id
          );
          setHydrated(true);
          return;
        }
      }
    } catch {
      // ignore corrupt/unavailable storage
    }
    setChats((prev) => {
      const initial = prev.length ? prev : [newChat()];
      setActiveId(initial[0].id);
      return initial;
    });
    setHydrated(true);
  }, []);

  // Persist sessions whenever they change.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ chats, activeId }));
    } catch {
      // storage full or unavailable — degrade silently
    }
  }, [chats, activeId, hydrated]);

  const activeChat = chats.find((c) => c.id === activeId) || chats[0];
  const messages = activeChat ? activeChat.messages : [WELCOME_MESSAGE];
  const isEmpty = messages.length <= 1;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function sendMessage(e, presetText) {
    if (e && e.preventDefault) e.preventDefault();
    if (!activeChat) return;
    const trimmed = (presetText ?? input).trim();
    if (!trimmed || loading) return;

    const nextMessages = [...activeChat.messages, { role: "user", content: trimmed }];

    setChats((prev) =>
      prev.map((c) =>
        c.id === activeChat.id
          ? {
              ...c,
              messages: nextMessages,
              title: c.title === "New chat" ? trimmed.slice(0, 42) : c.title,
            }
          : c
      )
    );
    setInput("");
    setError("");
    setLoading(true);

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChat.id
            ? { ...c, messages: [...c.messages, { role: "assistant", content: data.reply }] }
            : c
        )
      );
    } catch (err) {
      setError("Couldn't reach the server. Is `npm run dev` still running?");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
    }
  }

  function handleInput(e) {
    setInput(e.target.value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }

  function handleNewChat() {
    const chat = newChat();
    setChats((prev) => [chat, ...prev]);
    setActiveId(chat.id);
    setError("");
    setInput("");
    setSidebarOpen(false);
  }

  function handleSwitchChat(id) {
    setActiveId(id);
    setError("");
    setSidebarOpen(false);
  }

  function handleDeleteChat(e, id) {
    e.stopPropagation();
    setChats((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      if (remaining.length === 0) {
        const fresh = newChat();
        setActiveId(fresh.id);
        return [fresh];
      }
      if (id === activeId) {
        setActiveId(remaining[0].id);
      }
      return remaining;
    });
  }

  return (
    <div className="shell">
      {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-brand">
          <BrandMark className="brand-mark" />
          MY&middot;GPT
        </div>

        <button className="new-chat-btn" onClick={handleNewChat} type="button">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          New chat
        </button>

        <nav className="chat-list" aria-label="Chat history">
          <div className="chat-list-label">Recent</div>
          {chats.map((c) => (
            <div
              key={c.id}
              className={`chat-item ${c.id === activeId ? "active" : ""}`}
              onClick={() => handleSwitchChat(c.id)}
            >
              <span className="chat-item-title">{c.title}</span>
              <button
                className="chat-item-delete"
                onClick={(e) => handleDeleteChat(e, c.id)}
                type="button"
                aria-label={`Delete "${c.title}"`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 6L18 18M6 18L18 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" aria-hidden="true" />
          Connected via Gemini
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button
            className="hamburger"
            onClick={() => setSidebarOpen(true)}
            type="button"
            aria-label="Open chat history"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 7H20M4 12H20M4 17H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          <div className="topbar-title">{activeChat ? activeChat.title : "MY·GPT"}</div>
          <button className="clear-btn" onClick={handleNewChat} type="button">
            New chat
          </button>
        </header>

        <main className="chat">
          <div className="chat-inner">
            {isEmpty ? (
              <div className="hero">
                <div className="hero-glow" aria-hidden="true" />
                <h1>What can I help with?</h1>
                <p>Ask a question, paste some code, or talk through an idea — I&apos;m listening.</p>
                <div className="suggestions">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="suggestion-chip"
                      onClick={() => sendMessage(null, s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`row ${m.role}`}>
                  {m.role === "assistant" && <BrandMark className="avatar" />}
                  <div className="bubble">
                    {m.role === "assistant" ? renderMarkdown(m.content) : m.content}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="row assistant">
                <BrandMark className="avatar" />
                <div className="bubble typing" aria-live="polite" aria-label="MY-GPT is typing">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}

            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </main>

        <form className="composer" onSubmit={sendMessage}>
          <div className="composer-glow" aria-hidden="true" />
          <div className="composer-inner">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Message MY-GPT..."
              rows={1}
              aria-label="Message MY-GPT"
            />
            <button type="submit" disabled={loading || !input.trim()} aria-label="Send message">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M4 12L20 4L13 20L11 13L4 12Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
