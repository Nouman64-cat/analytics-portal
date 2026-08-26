"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getUserId } from "@/lib/auth";
import { messagesService } from "@/lib/services";
import { subscribeToMessages, type MessageEvent } from "@/lib/messagesSocket";
import type { MessageThreadSummary } from "@/lib/types";
import { PageLoader, ErrorState } from "@/components/PageStates";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import ThreadList from "@/components/messages/ThreadList";
import ConversationPane from "@/components/messages/ConversationPane";
import ContactPicker from "@/components/messages/ContactPicker";

// Safety-net only — live updates arrive over the WebSocket in lib/messagesSocket.ts.
const POLL_INTERVAL_MS = 45 * 1000;

export default function MessagesPage() {
  const [threads, setThreads] = useState<MessageThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "conversation">("list");
  const [removeThread, setRemoveThread] = useState<MessageThreadSummary | null>(null);
  const [removing, setRemoving] = useState(false);
  const activeThreadIdRef = useRef<string | null>(null);
  activeThreadIdRef.current = activeThreadId;

  const fetchThreads = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) setLoading(true);
    try {
      const data = await messagesService.getThreads();
      setThreads(data);
      setError(null);
    } catch (err) {
      if (showSpinner) setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, []);

  const handleIncomingMessage = useCallback(
    (evt: MessageEvent) => {
      const myId = getUserId();
      setThreads((prev) => {
        const idx = prev.findIndex((t) => t.id === evt.thread_id);
        if (idx === -1) {
          // A thread I don't have yet (e.g. a group/channel's first message) — full refetch.
          fetchThreads(false);
          return prev;
        }
        const isOpen = evt.thread_id === activeThreadIdRef.current;
        const current = prev[idx];
        const next = [...prev];
        next[idx] = {
          ...current,
          last_message: evt.message,
          updated_at: evt.message.created_at,
          unread_count:
            isOpen || evt.message.sender_id === myId ? current.unread_count : current.unread_count + 1,
        };
        next.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        return next;
      });
    },
    [fetchThreads],
  );

  useEffect(() => {
    fetchThreads(true);
    const interval = setInterval(() => fetchThreads(false), POLL_INTERVAL_MS);
    const unsubscribe = subscribeToMessages(handleIncomingMessage);
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [fetchThreads, handleIncomingMessage]);

  const handleSelect = (thread: MessageThreadSummary) => {
    setActiveThreadId(thread.id);
    setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, unread_count: 0 } : t)));
    setMobileView("conversation");
  };

  const handleThreadReady = (thread: MessageThreadSummary) => {
    setThreads((prev) =>
      prev.some((t) => t.id === thread.id)
        ? prev.map((t) => (t.id === thread.id ? thread : t))
        : [thread, ...prev],
    );
    setActiveThreadId(thread.id);
    setMobileView("conversation");
  };

  const handleConfirmRemove = async () => {
    if (!removeThread) return;
    setRemoving(true);
    try {
      await messagesService.removeChat(removeThread.id);
      setThreads((prev) => prev.filter((t) => t.id !== removeThread.id));
      if (activeThreadId === removeThread.id) {
        setActiveThreadId(null);
        setMobileView("list");
      }
      setRemoveThread(null);
    } catch {
      // leave the modal open so the user can see it failed and retry
    } finally {
      setRemoving(false);
    }
  };

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={() => fetchThreads(true)} />;

  return (
    <div className="h-[calc(100vh-9rem)] min-h-[520px] overflow-hidden rounded-[20px] border border-white/60 dark:border-white/[0.08] bg-white/40 dark:bg-white/[0.06] backdrop-blur-3xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.25)] flex">
      <div
        className={`w-full md:w-[300px] md:shrink-0 border-r border-slate-200/70 dark:border-white/[0.07] ${
          mobileView === "conversation" ? "hidden md:block" : "block"
        }`}
      >
        <ThreadList
          threads={threads}
          activeThreadId={activeThreadId}
          onSelect={handleSelect}
          onNewMessage={() => setPickerOpen(true)}
          onRemove={(thread) => setRemoveThread(thread)}
        />
      </div>
      <div className={`min-w-0 flex-1 ${mobileView === "list" ? "hidden md:block" : "block"}`}>
        <ConversationPane
          thread={activeThread}
          onMessageSent={() => fetchThreads(false)}
          onBack={() => setMobileView("list")}
        />
      </div>

      <ContactPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onThreadReady={handleThreadReady}
      />

      <DeleteConfirmModal
        open={removeThread !== null}
        onClose={() => !removing && setRemoveThread(null)}
        onConfirm={() => void handleConfirmRemove()}
        isDeleting={removing}
        title="Delete chat"
        description="This removes the conversation from your messages list only — it stays intact for everyone else, and it'll reappear if a new message comes in."
        itemName={removeThread?.title ?? "This conversation"}
      />
    </div>
  );
}
