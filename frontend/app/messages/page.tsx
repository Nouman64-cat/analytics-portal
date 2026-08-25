"use client";

import { useCallback, useEffect, useState } from "react";
import { messagesService } from "@/lib/services";
import type { MessageThreadSummary } from "@/lib/types";
import { PageLoader, ErrorState } from "@/components/PageStates";
import ThreadList from "@/components/messages/ThreadList";
import ConversationPane from "@/components/messages/ConversationPane";
import ContactPicker from "@/components/messages/ContactPicker";

const POLL_INTERVAL_MS = 6 * 1000;

export default function MessagesPage() {
  const [threads, setThreads] = useState<MessageThreadSummary[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

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

  useEffect(() => {
    fetchThreads(true);
    const interval = setInterval(() => fetchThreads(false), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchThreads]);

  const handleSelect = (thread: MessageThreadSummary) => {
    setActiveThreadId(thread.id);
    setThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, unread_count: 0 } : t)));
  };

  const handleThreadReady = (thread: MessageThreadSummary) => {
    setThreads((prev) =>
      prev.some((t) => t.id === thread.id)
        ? prev.map((t) => (t.id === thread.id ? thread : t))
        : [thread, ...prev],
    );
    setActiveThreadId(thread.id);
  };

  const activeThread = threads.find((t) => t.id === activeThreadId) ?? null;

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={() => fetchThreads(true)} />;

  return (
    <div className="h-[calc(100vh-9rem)] min-h-[520px] overflow-hidden rounded-[20px] border border-white/60 dark:border-white/[0.08] bg-white/40 dark:bg-white/[0.06] backdrop-blur-3xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.25)] flex">
      <div className="w-[300px] shrink-0 border-r border-slate-200/70 dark:border-white/[0.07]">
        <ThreadList
          threads={threads}
          activeThreadId={activeThreadId}
          onSelect={handleSelect}
          onNewMessage={() => setPickerOpen(true)}
        />
      </div>
      <div className="min-w-0 flex-1">
        <ConversationPane thread={activeThread} onMessageSent={() => fetchThreads(false)} />
      </div>

      <ContactPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onThreadReady={handleThreadReady}
      />
    </div>
  );
}
