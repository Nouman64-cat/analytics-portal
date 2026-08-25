"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Loader2, Search, Send, X } from "lucide-react";
import { getUserId } from "@/lib/auth";
import { messagesService } from "@/lib/services";
import { subscribeToMessages } from "@/lib/messagesSocket";
import type { TeamMessage, MessageThreadSummary } from "@/lib/types";
import ThreadAvatar from "./ThreadAvatar";
import { dayKey, formatDateDivider, formatMessageTime } from "./format";

// Safety-net only — live updates arrive over the WebSocket in lib/messagesSocket.ts.
const POLL_INTERVAL_MS = 30 * 1000;
const SEARCH_DEBOUNCE_MS = 250;

export default function ConversationPane({
  thread,
  onMessageSent,
  onBack,
}: {
  thread: MessageThreadSummary | null;
  /** Called after a message is successfully sent, so the parent can refresh the thread list. */
  onMessageSent?: () => void;
  /** Mobile-only: returns to the thread list pane. Omit in desktop-only contexts. */
  onBack?: () => void;
}) {
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentUserId = getUserId();

  // Search + jump-to-context ("history mode": viewing an older window, not the live tail)
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<TeamMessage[]>([]);
  const [searching, setSearching] = useState(false);
  const [historyMode, setHistoryMode] = useState(false);
  const historyModeRef = useRef(false);
  historyModeRef.current = historyMode;
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [pendingScrollToId, setPendingScrollToId] = useState<string | null>(null);
  const messageRefs = useRef(new Map<string, HTMLDivElement>());

  const fetchMessages = useCallback(async (threadId: string, showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    try {
      const data = await messagesService.getMessages(threadId);
      setMessages(data);
    } catch {
      // keep the last known messages on a transient poll failure
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!thread) {
      setMessages([]);
      return;
    }
    setHistoryMode(false);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    fetchMessages(thread.id, true);
    messagesService.markRead(thread.id).catch(() => {});
    const interval = setInterval(() => {
      if (historyModeRef.current) return; // don't clobber a jumped-to context window
      fetchMessages(thread.id, false);
    }, POLL_INTERVAL_MS);
    const unsubscribe = subscribeToMessages((evt) => {
      if (evt.thread_id !== thread.id) return;
      if (historyModeRef.current) return; // live pushes don't belong in a historical view
      setMessages((prev) => (prev.some((m) => m.id === evt.message.id) ? prev : [...prev, evt.message]));
      messagesService.markRead(thread.id).catch(() => {});
    });
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
    // Deliberately keyed on thread?.id, not `thread` — the parent creates a new thread
    // object on every incoming-message/refetch (to update last_message/unread_count), which
    // would otherwise re-trigger this effect (and its loading-spinner reset) on every new
    // message instead of only when actually switching to a different conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id, fetchMessages]);

  useEffect(() => {
    if (historyMode) return;
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, thread?.id, historyMode]);

  useEffect(() => {
    if (!pendingScrollToId) return;
    const el = messageRefs.current.get(pendingScrollToId);
    el?.scrollIntoView({ block: "center" });
    setHighlightedId(pendingScrollToId);
    setPendingScrollToId(null);
    const t = setTimeout(() => setHighlightedId(null), 2000);
    return () => clearTimeout(t);
  }, [pendingScrollToId, messages]);

  useEffect(() => {
    if (!searchOpen || !thread) return;
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const data = await messagesService.searchMessages(thread.id, q);
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchOpen, searchQuery, thread]);

  const handleJumpToResult = async (result: TeamMessage) => {
    if (!thread) return;
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setLoading(true);
    try {
      const window = await messagesService.getMessages(thread.id, { around: result.id });
      setMessages(window);
      setHistoryMode(true);
      setPendingScrollToId(result.id);
    } catch {
      // leave the current view as-is on failure
    } finally {
      setLoading(false);
    }
  };

  const handleJumpToLatest = () => {
    if (!thread) return;
    setHistoryMode(false);
    fetchMessages(thread.id, true);
  };

  const handleSend = async () => {
    if (!thread) return;
    const body = composerText.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await messagesService.sendMessage(thread.id, body);
      if (historyModeRef.current) {
        setHistoryMode(false);
        await fetchMessages(thread.id, false);
      } else {
        setMessages((prev) => [...prev, sent]);
      }
      setComposerText("");
      onMessageSent?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that message");
    } finally {
      setSending(false);
    }
  };

  if (!thread) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-slate-400 dark:text-slate-500">
        Select a conversation, or start a new one.
      </div>
    );
  }

  let lastDayKey = "";

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 px-4 py-3.5 border-b border-slate-200/70 dark:border-white/[0.07]">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="md:hidden -ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06]"
            aria-label="Back to conversations"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <ThreadAvatar title={thread.title} kind={thread.kind} size={32} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">
          {thread.title}
        </span>
        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
            searchOpen
              ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400"
              : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06]"
          }`}
          title="Search messages"
          aria-label="Search messages"
        >
          <Search size={16} />
        </button>
      </div>

      {searchOpen && (
        <div className="shrink-0 border-b border-slate-200/70 dark:border-white/[0.07] bg-white/60 dark:bg-white/[0.02]">
          <div className="relative px-4 py-2.5">
            <Search size={14} className="absolute left-7 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search this conversation…"
              className="w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] pl-8 pr-8 py-1.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-500/50"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {searching ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 size={16} className="animate-spin text-slate-400" />
              </div>
            ) : searchQuery.trim() && searchResults.length === 0 ? (
              <p className="px-4 pb-3 text-center text-xs text-slate-400 dark:text-slate-500">No matches</p>
            ) : (
              searchResults.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleJumpToResult(r)}
                  className="flex w-full flex-col items-start gap-0.5 px-4 py-2 text-left hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors"
                >
                  <span className="flex w-full items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">{r.sender_name}</span>
                    <span className="shrink-0 text-slate-400 dark:text-slate-500">
                      {formatMessageTime(r.created_at)}
                    </span>
                  </span>
                  <span className="w-full truncate text-sm text-slate-600 dark:text-slate-400">{r.body}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {historyMode && (
          <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-1 flex justify-center bg-gradient-to-b from-white dark:from-[#14161f] to-transparent px-4 pt-2 pb-4">
            <button
              type="button"
              onClick={handleJumpToLatest}
              className="rounded-full bg-slate-900/90 dark:bg-white/90 px-3 py-1 text-xs font-medium text-white dark:text-slate-900 shadow-lg hover:opacity-90 transition-opacity"
            >
              Jump to latest
            </button>
          </div>
        )}
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-8">
            No messages yet — say hello.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === currentUserId;
            const key = dayKey(m.created_at);
            const showDivider = key !== lastDayKey;
            lastDayKey = key;
            return (
              <div key={m.id}>
                {showDivider && (
                  <div className="flex items-center justify-center py-1.5">
                    <span className="rounded-full bg-slate-100 dark:bg-white/[0.06] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      {formatDateDivider(m.created_at)}
                    </span>
                  </div>
                )}
                <div
                  ref={(el) => {
                    if (el) messageRefs.current.set(m.id, el);
                    else messageRefs.current.delete(m.id);
                  }}
                  className={`flex ${mine ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                    {!mine && thread.kind !== "dm" && (
                      <span className="px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {m.sender_name}
                      </span>
                    )}
                    <div
                      className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words transition-colors ${
                        mine
                          ? "bg-indigo-600 text-white rounded-br-sm"
                          : "bg-slate-100 dark:bg-white/[0.06] text-slate-800 dark:text-slate-200 rounded-bl-sm"
                      } ${highlightedId === m.id ? "ring-2 ring-offset-2 ring-amber-400 dark:ring-offset-[#14161f]" : ""}`}
                    >
                      {m.body}
                    </div>
                    <span className="px-1 text-[10px] text-slate-400 dark:text-slate-500">
                      {formatMessageTime(m.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {error && (
        <p className="shrink-0 px-4 pb-1 text-xs text-red-500 dark:text-red-400">{error}</p>
      )}

      <div className="shrink-0 flex items-end gap-2 px-4 py-3 border-t border-slate-200/70 dark:border-white/[0.07]">
        <textarea
          value={composerText}
          onChange={(e) => setComposerText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Write a message…"
          rows={1}
          className="min-h-[38px] max-h-32 flex-1 resize-none rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-500/50"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || !composerText.trim()}
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Send"
          aria-label="Send message"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}
