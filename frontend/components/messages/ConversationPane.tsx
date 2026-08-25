"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, Loader2, Send } from "lucide-react";
import { getUserId } from "@/lib/auth";
import { messagesService } from "@/lib/services";
import type { TeamMessage, MessageThreadSummary } from "@/lib/types";
import ThreadAvatar from "./ThreadAvatar";
import { formatMessageTime } from "./format";

const POLL_INTERVAL_MS = 4 * 1000;

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
    fetchMessages(thread.id, true);
    messagesService.markRead(thread.id).catch(() => {});
    const interval = setInterval(() => fetchMessages(thread.id, false), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [thread, fetchMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages, thread?.id]);

  const handleSend = async () => {
    if (!thread) return;
    const body = composerText.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      const sent = await messagesService.sendMessage(thread.id, body);
      setMessages((prev) => [...prev, sent]);
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
        <span className="text-sm font-semibold text-slate-900 dark:text-white">{thread.title}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 space-y-3">
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
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                  {!mine && thread.kind !== "dm" && (
                    <span className="px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      {m.sender_name}
                    </span>
                  )}
                  <div
                    className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words ${
                      mine
                        ? "bg-indigo-600 text-white rounded-br-sm"
                        : "bg-slate-100 dark:bg-white/[0.06] text-slate-800 dark:text-slate-200 rounded-bl-sm"
                    }`}
                  >
                    {m.body}
                  </div>
                  <span className="px-1 text-[10px] text-slate-400 dark:text-slate-500">
                    {formatMessageTime(m.created_at)}
                  </span>
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
