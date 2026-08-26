"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarCheck2,
  Check,
  ChevronLeft,
  FileText,
  Loader2,
  MoreVertical,
  Paperclip,
  Pencil,
  Search,
  Send,
  Smile,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import { getUserId } from "@/lib/auth";
import { messagesService } from "@/lib/services";
import { generatePdfThumbnail } from "@/lib/pdfThumbnail";
import { subscribeToMessages, setActiveThreadId } from "@/lib/messagesSocket";
import type { TeamMessage, MessageThreadSummary, MessageContact, MessageAttachment } from "@/lib/types";
import Modal, { buttonSecondary, buttonDanger } from "@/components/Modal";
import ThreadAvatar from "./ThreadAvatar";
import MentionText from "./MentionText";
import AttachmentLightbox from "./AttachmentLightbox";
import { dayKey, formatDateDivider, formatMessageTime } from "./format";
import { QUICK_ACTIONS, QuickActionKey, buildQuickMessage } from "./quickMessages";
import { EMOJI_GROUPS } from "./EMOJI_LIST";

// Safety-net only — live updates arrive over the WebSocket in lib/messagesSocket.ts.
const POLL_INTERVAL_MS = 30 * 1000;
const SEARCH_DEBOUNCE_MS = 250;
const MENTION_DEBOUNCE_MS = 200;

// Must mirror the backend's _ATTACHMENT_ALLOWED_TYPES (app/routers/messages.py) — this is
// just an early client-side check so a bad pick fails instantly instead of after upload.
const ALLOWED_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;

type MentionItem = { type: "action"; key: QuickActionKey; label: string } | { type: "contact"; contact: MessageContact };

type PendingAttachment = {
  id: string;
  file: File;
  previewUrl?: string;
  progress: number;
  status: "uploading" | "done" | "error";
  error?: string;
  result?: {
    s3_key: string;
    filename: string;
    content_type: string;
    size_bytes: number;
    thumbnail_s3_key?: string;
  };
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

  // "@" quick actions / mentions in the composer
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [mentionItems, setMentionItems] = useState<MentionItem[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionHighlight, setMentionHighlight] = useState(0);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // Contacts tagged via the @ dropdown while composing — sent alongside the message so the
  // backend/other clients know exactly who was mentioned (not re-parsed from the text).
  const [taggedContacts, setTaggedContacts] = useState<MessageContact[]>([]);

  // Emoji picker in the composer
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // Header "more options" menu — currently just "Clear chat"
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  // Editing one of my own messages in place
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // File attachments (images + PDFs) — each one uploads to S3 directly and asynchronously
  // (in parallel, off the main send action) the moment it's picked; only fully-uploaded
  // ones are attached when the message is actually sent.
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewAttachment, setPreviewAttachment] = useState<MessageAttachment | null>(null);

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
      setActiveThreadId(null);
      return;
    }
    setHistoryMode(false);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setComposerText("");
    setTaggedContacts([]);
    setActiveThreadId(thread.id);
    fetchMessages(thread.id, true);
    messagesService.markRead(thread.id).catch(() => {});
    const interval = setInterval(() => {
      if (historyModeRef.current) return; // don't clobber a jumped-to context window
      fetchMessages(thread.id, false);
    }, POLL_INTERVAL_MS);
    const unsubscribe = subscribeToMessages((evt) => {
      if (evt.thread_id !== thread.id) return;
      if (historyModeRef.current) return; // live pushes don't belong in a historical view
      if (evt.type === "message_edited" || evt.type === "message_deleted") {
        setMessages((prev) => prev.map((m) => (m.id === evt.message.id ? evt.message : m)));
        return;
      }
      setMessages((prev) => (prev.some((m) => m.id === evt.message.id) ? prev : [...prev, evt.message]));
      messagesService.markRead(thread.id).catch(() => {});
    });
    return () => {
      clearInterval(interval);
      unsubscribe();
      setActiveThreadId(null);
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

  useEffect(() => {
    if (!mention) {
      setMentionItems([]);
      return;
    }
    setMentionHighlight(0);
    let cancelled = false;
    setMentionLoading(true);
    const t = setTimeout(async () => {
      try {
        const q = mention.query.trim().toLowerCase();
        const actionItems: MentionItem[] = QUICK_ACTIONS.filter(
          (a) => !q || a.label.toLowerCase().includes(q),
        ).map((a) => ({ type: "action", key: a.key, label: a.label }));
        const contacts = await messagesService.getContacts(mention.query.trim());
        if (!cancelled) {
          setMentionItems([
            ...actionItems,
            ...contacts.slice(0, 6).map((c): MentionItem => ({ type: "contact", contact: c })),
          ]);
        }
      } catch {
        if (!cancelled) setMentionItems([]);
      } finally {
        if (!cancelled) setMentionLoading(false);
      }
    }, MENTION_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [mention]);

  // Auto-grow the composer to fit its content (e.g. a multi-line inserted template),
  // capped by the max-h-56 in its className below — beyond that it scrolls internally.
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [composerText]);

  // Close the header "more options" menu on an outside click.
  useEffect(() => {
    if (!moreMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [moreMenuOpen]);

  // Close the emoji picker on an outside click.
  useEffect(() => {
    if (!emojiPickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setEmojiPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [emojiPickerOpen]);

  /** Inserts an emoji at the composer's current cursor position (or appends it if unfocused). */
  const handleInsertEmoji = (emoji: string) => {
    const el = composerRef.current;
    const cursor = el?.selectionStart ?? composerText.length;
    const end = el?.selectionEnd ?? composerText.length;
    const before = composerText.slice(0, cursor);
    const after = composerText.slice(end);
    const next = before + emoji + after;
    setComposerText(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = before.length + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  };

  /** Re-derive the active "@" mention (if any) from the textarea's current text + cursor. */
  const syncMentionFromComposer = useCallback((text: string, cursor: number) => {
    let atIndex = -1;
    for (let i = cursor - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === "\n") break;
      if (ch === "@") {
        const before = text[i - 1];
        if (i === 0 || before === " " || before === "\n") atIndex = i;
        break;
      }
    }
    if (atIndex === -1) {
      setMention(null);
      return;
    }
    setMention({ start: atIndex, query: text.slice(atIndex + 1, cursor) });
  }, []);

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

  const handleStartEdit = (m: TeamMessage) => {
    setEditingId(m.id);
    setEditingText(m.body);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  const handleSaveEdit = async () => {
    if (!thread || !editingId) return;
    const body = editingText.trim();
    if (!body) return;
    setEditSaving(true);
    try {
      const updated = await messagesService.editMessage(thread.id, editingId, body);
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      setEditingId(null);
      setEditingText("");
    } catch {
      setError("Failed to save changes");
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteMessage = async (m: TeamMessage) => {
    if (!thread) return;
    setDeletingId(m.id);
    try {
      const updated = await messagesService.deleteMessage(thread.id, m.id);
      setMessages((prev) => prev.map((msg) => (msg.id === updated.id ? updated : msg)));
      if (editingId === m.id) handleCancelEdit();
    } catch {
      setError("Failed to delete message");
    } finally {
      setDeletingId(null);
    }
  };

  /** Replaces the active "@...query" span in the composer with the picked item's text — a
   * plain "@Name " tag for a contact, or the blank fill-in-yourself template for a quick
   * action (the user types the actual details in by hand after it's inserted). */
  const handleSelectMentionItem = (item: MentionItem) => {
    if (!mention) return;
    const cursor = mention.start + 1 + mention.query.length;
    const before = composerText.slice(0, mention.start);
    const after = composerText.slice(cursor);
    const replacement = item.type === "contact" ? `@${item.contact.full_name} ` : `${buildQuickMessage(item.key)}\n`;
    const next = before + replacement + after;
    setComposerText(next);
    if (item.type === "contact") {
      setTaggedContacts((prev) => (prev.some((c) => c.id === item.contact.id) ? prev : [...prev, item.contact]));
    }
    setMention(null);
    setMentionItems([]);
    requestAnimationFrame(() => {
      const el = composerRef.current;
      if (!el) return;
      el.focus();
      const pos = before.length + replacement.length;
      el.setSelectionRange(pos, pos);
    });
  };

  /** Validates and stages picked files, then kicks off an independent, parallel S3 upload
   * for each one immediately — nothing here blocks the composer or waits on another file. */
  const handleFilesSelected = (files: FileList | null) => {
    if (!files || !thread) return;
    const incoming = Array.from(files);
    if (pendingAttachments.length + incoming.length > MAX_ATTACHMENTS) {
      setError(`You can attach up to ${MAX_ATTACHMENTS} files per message`);
      return;
    }
    const accepted: PendingAttachment[] = [];
    for (const file of incoming) {
      if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
        setError(`${file.name}: only images and PDF files are allowed`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_SIZE) {
        setError(`${file.name} is too large (max ${formatFileSize(MAX_ATTACHMENT_SIZE)})`);
        continue;
      }
      accepted.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
        progress: 0,
        status: "uploading",
      });
    }
    if (accepted.length === 0) return;
    setError(null);
    setPendingAttachments((prev) => [...prev, ...accepted]);

    // Each file uploads on its own, independent async path — a PDF additionally renders a
    // page-1 thumbnail client-side (via PDF.js) and uploads that in parallel with the main
    // file, so the message gets an inline visual preview the same way an image does. None
    // of this blocks the composer or other in-flight uploads.
    accepted.forEach(async (att) => {
      try {
        const isPdf = att.file.type === "application/pdf";
        const thumbBlob = isPdf ? await generatePdfThumbnail(att.file) : null;
        if (thumbBlob) {
          const url = URL.createObjectURL(thumbBlob);
          setPendingAttachments((prev) => prev.map((p) => (p.id === att.id ? { ...p, previewUrl: url } : p)));
        }

        const mainUpload = messagesService.uploadAttachment(thread.id, att.file, (pct) => {
          setPendingAttachments((prev) => prev.map((p) => (p.id === att.id ? { ...p, progress: pct } : p)));
        });
        const thumbUpload = thumbBlob
          ? messagesService
              .uploadAttachment(thread.id, new File([thumbBlob], `thumb-${att.id}.jpg`, { type: "image/jpeg" }))
              .then((r) => r.s3_key)
              .catch(() => undefined) // thumbnail is best-effort — never fail the whole attachment over it
          : Promise.resolve(undefined);

        const [main, thumbnail_s3_key] = await Promise.all([mainUpload, thumbUpload]);
        setPendingAttachments((prev) =>
          prev.map((p) =>
            p.id === att.id ? { ...p, status: "done", progress: 100, result: { ...main, thumbnail_s3_key } } : p,
          ),
        );
      } catch (err) {
        setPendingAttachments((prev) =>
          prev.map((p) =>
            p.id === att.id
              ? { ...p, status: "error", error: err instanceof Error ? err.message : "Upload failed" }
              : p,
          ),
        );
      }
    });
  };

  const handleRemoveAttachment = (id: string) => {
    setPendingAttachments((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  /** "Clear chat for me" — hides history from this view only; the other participant(s) keep
   * theirs untouched, and a new message afterwards shows up normally (WhatsApp's Clear Chat,
   * not Delete for Everyone). */
  const handleConfirmClearChat = async () => {
    if (!thread) return;
    setClearing(true);
    try {
      await messagesService.clearChat(thread.id);
      setMessages([]);
      onMessageSent?.(); // thread list preview/unread count need to refresh too
      setClearConfirmOpen(false);
    } catch {
      setError("Failed to clear chat");
    } finally {
      setClearing(false);
    }
  };

  const handleSend = async () => {
    if (!thread) return;
    const body = composerText.trim();
    const uploading = pendingAttachments.some((a) => a.status === "uploading");
    const readyAttachments = pendingAttachments.filter((a) => a.status === "done" && a.result).map((a) => a.result!);
    if ((!body && readyAttachments.length === 0) || sending || uploading) return;
    // Only mention contacts whose "@Name" tag is still actually present in the text — covers
    // the case where the user backspaced a tag out after inserting it.
    const mentionIds = taggedContacts
      .filter((c) => composerText.includes(`@${c.full_name}`))
      .map((c) => c.id);
    setSending(true);
    setError(null);
    try {
      const sent = await messagesService.sendMessage(thread.id, body, mentionIds, readyAttachments);
      if (historyModeRef.current) {
        setHistoryMode(false);
        await fetchMessages(thread.id, false);
      } else {
        // The backend also broadcasts this message back to the sender over the WebSocket
        // (for multi-tab sync), which may arrive before this response does — dedupe by id
        // the same way the WS handler does, or the message renders twice.
        setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]));
      }
      setComposerText("");
      setTaggedContacts([]);
      pendingAttachments.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
      setPendingAttachments([]);
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
        <div className="relative" ref={moreMenuRef}>
          <button
            type="button"
            onClick={() => setMoreMenuOpen((v) => !v)}
            disabled={clearing}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:opacity-50 ${
              moreMenuOpen
                ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400"
                : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06]"
            }`}
            title="More options"
            aria-label="More options"
          >
            {clearing ? <Loader2 size={16} className="animate-spin" /> : <MoreVertical size={16} />}
          </button>
          {moreMenuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1.5 w-44 overflow-hidden rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1d2e] shadow-xl">
              <button
                type="button"
                onClick={() => {
                  setMoreMenuOpen(false);
                  setClearConfirmOpen(true);
                }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <Trash2 size={14} className="shrink-0" />
                Clear chat
              </button>
            </div>
          )}
        </div>
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
                  className={`group flex items-end gap-1.5 ${mine ? "justify-end" : "justify-start"}`}
                >
                  {mine && !m.deleted_at && editingId !== m.id && (
                    <div className="mb-4 flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(m)}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.07] hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        title="Edit message"
                        aria-label="Edit message"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteMessage(m)}
                        disabled={deletingId === m.id}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
                        title="Delete message"
                        aria-label="Delete message"
                      >
                        {deletingId === m.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Trash2 size={12} />
                        )}
                      </button>
                    </div>
                  )}
                  <div className={`max-w-[75%] ${mine ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                    {!mine && thread.kind !== "dm" && (
                      <span className="px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        {m.sender_name}
                      </span>
                    )}
                    {!m.deleted_at && m.attachments.length > 0 && editingId !== m.id && (
                      <div className={`flex flex-wrap gap-1.5 ${mine ? "justify-end" : "justify-start"}`}>
                        {m.attachments.map((a) => {
                          // Images preview in-app (lightbox); PDFs open in a new tab either
                          // way — like WhatsApp, the visual card is just a preview, tapping
                          // it hands off to the browser's own PDF viewer/download.
                          if (a.content_type.startsWith("image/")) {
                            return (
                              <button
                                key={a.id}
                                type="button"
                                onClick={() => setPreviewAttachment(a)}
                                className="relative block w-[180px] shrink-0 overflow-hidden rounded-xl border border-slate-200 dark:border-white/10"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL, not a static/local asset next/image can optimize */}
                                <img src={a.url} alt={a.filename} className="max-h-48 w-full object-cover" />
                              </button>
                            );
                          }
                          return a.thumbnail_url ? (
                            <a
                              key={a.id}
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="relative block w-[180px] shrink-0 overflow-hidden rounded-xl border border-slate-200 dark:border-white/10"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL, not a static/local asset next/image can optimize */}
                              <img src={a.thumbnail_url} alt={a.filename} className="h-[140px] w-full object-cover" />
                              <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                                PDF
                              </span>
                              <span className="flex items-center gap-1.5 bg-white dark:bg-white/[0.03] px-2.5 py-1.5">
                                <FileText size={13} className="shrink-0 text-slate-500 dark:text-slate-400" />
                                <span className="min-w-0 flex-1 truncate text-left text-xs font-medium text-slate-700 dark:text-slate-300">
                                  {a.filename}
                                </span>
                              </span>
                            </a>
                          ) : (
                            <a
                              key={a.id}
                              href={a.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-3 py-2 hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
                            >
                              <FileText size={16} className="shrink-0 text-slate-500 dark:text-slate-400" />
                              <span className="min-w-0 max-w-[160px] truncate text-xs font-medium text-slate-700 dark:text-slate-300">
                                {a.filename}
                              </span>
                              <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                                {formatFileSize(a.size_bytes)}
                              </span>
                            </a>
                          );
                        })}
                      </div>
                    )}
                    {editingId === m.id ? (
                      <div className="flex flex-col gap-1.5 w-full min-w-[240px]">
                        <textarea
                          autoFocus
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSaveEdit();
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              handleCancelEdit();
                            }
                          }}
                          rows={2}
                          className="w-full resize-none rounded-xl border border-indigo-500/50 bg-white dark:bg-white/[0.03] px-3.5 py-2 text-sm text-slate-900 dark:text-white outline-none"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.07] transition-colors"
                            title="Cancel"
                            aria-label="Cancel edit"
                          >
                            <X size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveEdit}
                            disabled={editSaving || !editingText.trim()}
                            className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
                            title="Save"
                            aria-label="Save edit"
                          >
                            {editSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          </button>
                        </div>
                      </div>
                    ) : (
                      (m.body || m.deleted_at) && (
                        <div
                          className={`rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words transition-colors ${
                            m.deleted_at
                              ? "italic text-slate-400 dark:text-slate-500 bg-transparent border border-dashed border-slate-300 dark:border-white/10"
                              : mine
                                ? "bg-indigo-600 text-white rounded-br-sm"
                                : "bg-slate-100 dark:bg-white/[0.06] text-slate-800 dark:text-slate-200 rounded-bl-sm"
                          } ${highlightedId === m.id ? "ring-2 ring-offset-2 ring-amber-400 dark:ring-offset-[#14161f]" : ""}`}
                        >
                          {m.deleted_at ? (
                            "Message deleted"
                          ) : (
                            <MentionText body={m.body} mentions={m.mentions} mine={mine} />
                          )}
                        </div>
                      )
                    )}
                    {editingId !== m.id && (
                      <span className="px-1 text-[10px] text-slate-400 dark:text-slate-500">
                        {formatMessageTime(m.created_at)}
                        {m.edited_at && !m.deleted_at && " · edited"}
                      </span>
                    )}
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

      {pendingAttachments.length > 0 && (
        <div className="shrink-0 flex flex-wrap gap-2 px-4 pt-3">
          {pendingAttachments.map((att) => (
            <div
              key={att.id}
              className="relative flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] pl-2 pr-7 py-1.5"
            >
              {att.previewUrl ? (
                <img src={att.previewUrl} alt={att.file.name} className="h-9 w-9 shrink-0 rounded-lg object-cover" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/[0.06]">
                  <FileText size={16} className="text-slate-500 dark:text-slate-400" />
                </div>
              )}
              <div className="min-w-0 max-w-[140px]">
                <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">{att.file.name}</p>
                {att.status === "uploading" && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">Uploading… {att.progress}%</p>
                )}
                {att.status === "done" && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{formatFileSize(att.file.size)}</p>
                )}
                {att.status === "error" && <p className="text-[10px] text-red-500 dark:text-red-400">Failed</p>}
              </div>
              {att.status === "uploading" && (
                <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden rounded-b-xl bg-slate-100 dark:bg-white/[0.06]">
                  <div
                    className="h-full bg-indigo-500 transition-all"
                    style={{ width: `${att.progress}%` }}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => handleRemoveAttachment(att.id)}
                className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.07] hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                title="Remove"
                aria-label="Remove attachment"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative shrink-0 flex items-end gap-2 px-4 py-3 border-t border-slate-200/70 dark:border-white/[0.07]">
        {mention && (
          <div className="absolute bottom-full left-4 right-4 mb-2 max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1d2e] shadow-xl z-20">
            {mentionLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 size={16} className="animate-spin text-slate-400" />
              </div>
            ) : (
              mentionItems.map((item, idx) => {
                const isHighlighted = idx === mentionHighlight;
                const base = `flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors ${
                  isHighlighted ? "bg-indigo-500/10" : "hover:bg-slate-100 dark:hover:bg-white/[0.04]"
                }`;
                if (item.type === "action") {
                  return (
                    <button
                      key={`action-${item.key}`}
                      type="button"
                      onMouseEnter={() => setMentionHighlight(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectMentionItem(item);
                      }}
                      className={base}
                    >
                      <CalendarCheck2 size={15} className="shrink-0 text-indigo-500" />
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{item.label}</span>
                    </button>
                  );
                }
                return (
                  <button
                    key={`contact-${item.contact.id}`}
                    type="button"
                    onMouseEnter={() => setMentionHighlight(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectMentionItem(item);
                    }}
                    className={base}
                  >
                    <UserIcon size={15} className="shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-800 dark:text-slate-200">
                      {item.contact.full_name}
                    </span>
                  </button>
                );
              })
            )}
            {!mentionLoading && mentionItems.length === 0 && (
              <p className="px-3.5 py-3 text-center text-xs text-slate-400 dark:text-slate-500">No matches</p>
            )}
          </div>
        )}
        {emojiPickerOpen && (
          <div
            ref={emojiPickerRef}
            className="absolute bottom-full right-4 mb-2 max-h-72 w-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1d2e] shadow-xl z-20 p-2"
          >
            {EMOJI_GROUPS.map((group) => (
              <div key={group.label} className="mb-2 last:mb-0">
                <p className="px-1.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {group.label}
                </p>
                <div className="grid grid-cols-8 gap-0.5">
                  {group.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleInsertEmoji(emoji);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                      title={emoji}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <textarea
          ref={composerRef}
          value={composerText}
          onChange={(e) => {
            setComposerText(e.target.value);
            syncMentionFromComposer(e.target.value, e.target.selectionStart ?? e.target.value.length);
          }}
          onKeyDown={(e) => {
            if (mention) {
              // Intercept every navigation/confirm key while an "@" mention is being
              // composed — even with zero items yet (still typing a search term) — so
              // Enter never falls through to send the literal "@..." text as a message.
              if (e.key === "ArrowDown" && mentionItems.length > 0) {
                e.preventDefault();
                setMentionHighlight((i) => (i + 1) % mentionItems.length);
                return;
              }
              if (e.key === "ArrowUp" && mentionItems.length > 0) {
                e.preventDefault();
                setMentionHighlight((i) => (i - 1 + mentionItems.length) % mentionItems.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                if (mentionItems.length > 0) {
                  handleSelectMentionItem(mentionItems[mentionHighlight]);
                }
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setMention(null);
                setMentionItems([]);
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Write a message… (type @ for quick actions)"
          rows={1}
          className="min-h-[38px] max-h-56 flex-1 resize-none overflow-y-auto rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-3.5 py-2 text-sm text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-indigo-500/50"
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_ATTACHMENT_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-slate-200 dark:border-white/[0.08] text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
          title="Attach files"
          aria-label="Attach files"
        >
          <Paperclip size={17} />
        </button>
        <button
          type="button"
          onClick={() => setEmojiPickerOpen((v) => !v)}
          className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border transition-colors ${
            emojiPickerOpen
              ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-500"
              : "border-slate-200 dark:border-white/[0.08] text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
          }`}
          title="Emoji"
          aria-label="Insert emoji"
        >
          <Smile size={17} />
        </button>
        <button
          type="button"
          onClick={handleSend}
          disabled={
            sending ||
            pendingAttachments.some((a) => a.status === "uploading") ||
            (!composerText.trim() && !pendingAttachments.some((a) => a.status === "done"))
          }
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Send"
          aria-label="Send message"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </div>
      <AttachmentLightbox attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
      <Modal
        open={clearConfirmOpen}
        onClose={() => !clearing && setClearConfirmOpen(false)}
        title="Clear chat"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            This will remove the message history from your view only — it stays exactly as-is for
            {thread.kind === "dm" ? " the other person" : " everyone else in this conversation"}, and
            any new message sent afterwards will show up normally.
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setClearConfirmOpen(false)}
              disabled={clearing}
              className={buttonSecondary}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmClearChat}
              disabled={clearing}
              className={`${buttonDanger} disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2`}
            >
              {clearing && <Loader2 className="animate-spin" size={16} />}
              {clearing ? "Clearing..." : "Clear chat"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
