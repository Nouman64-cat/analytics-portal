"use client";

import { useState } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import type { MessageThreadSummary, TeamMessage } from "@/lib/types";
import ThreadAvatar from "./ThreadAvatar";
import { formatMessageTime } from "./format";

/** Body text is blank for a deleted message and for an attachment-only message — fall back
 * to a label so the thread-list preview isn't just empty. */
function lastMessagePreview(m: TeamMessage): string {
  if (m.deleted_at) return "Message deleted";
  if (m.body) return m.body;
  if (m.attachments.length > 0) {
    const isImage = m.attachments[0].content_type.startsWith("image/");
    const kind = isImage ? "Photo" : "File";
    return m.attachments.length > 1 ? `${kind} +${m.attachments.length - 1} more` : kind;
  }
  return "";
}

export default function ThreadList({
  threads,
  activeThreadId,
  onSelect,
  onNewMessage,
  onRemove,
}: {
  threads: MessageThreadSummary[];
  activeThreadId: string | null;
  onSelect: (thread: MessageThreadSummary) => void;
  onNewMessage: () => void;
  /** Ask to remove (delete-for-me) a conversation from the list — the caller owns the
   * confirmation step and the actual API call. */
  onRemove: (thread: MessageThreadSummary) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? threads.filter((t) => t.title.toLowerCase().includes(query.trim().toLowerCase()))
    : threads;

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3.5 border-b border-slate-200/70 dark:border-white/[0.07]">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Messages</h2>
        <button
          type="button"
          onClick={onNewMessage}
          title="New message"
          aria-label="New message"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 transition-colors"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="relative shrink-0 px-3 py-2.5 border-b border-slate-200/70 dark:border-white/[0.07]">
        <Search size={13} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search conversations…"
          className="w-full rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-500/50"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-400 dark:text-slate-500">
            {threads.length === 0 ? "No conversations yet." : "No matches."}
          </p>
        ) : (
          filtered.map((t) => (
            <div
              key={t.id}
              className={`group relative flex items-center border-b border-slate-100 dark:border-white/[0.04] last:border-b-0 transition-colors ${
                activeThreadId === t.id
                  ? "bg-indigo-50 dark:bg-indigo-500/10"
                  : "hover:bg-slate-50 dark:hover:bg-white/[0.03]"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelect(t)}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
              >
                <ThreadAvatar title={t.title} kind={t.kind} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={`truncate text-sm ${
                        t.unread_count > 0
                          ? "font-semibold text-slate-900 dark:text-white"
                          : "font-medium text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {t.title}
                    </span>
                    <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                      {formatMessageTime(t.updated_at)}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {t.last_message
                        ? `${t.last_message.sender_name}: ${lastMessagePreview(t.last_message)}`
                        : "No messages yet"}
                    </span>
                    {t.unread_count > 0 && (
                      <span className="shrink-0 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold leading-none text-white">
                        {t.unread_count > 99 ? "99+" : t.unread_count}
                      </span>
                    )}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => onRemove(t)}
                className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors"
                title="Delete chat"
                aria-label="Delete chat"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
