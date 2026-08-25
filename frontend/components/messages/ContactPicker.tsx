"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Search } from "lucide-react";
import Modal, { buttonPrimary, inputClass } from "@/components/Modal";
import { messagesService } from "@/lib/services";
import type { MessageContact, MessageThreadSummary } from "@/lib/types";
import ThreadAvatar from "./ThreadAvatar";

const SEARCH_DEBOUNCE_MS = 250;

export default function ContactPicker({
  open,
  onClose,
  onThreadReady,
}: {
  open: boolean;
  onClose: () => void;
  onThreadReady: (thread: MessageThreadSummary) => void;
}) {
  const [mode, setMode] = useState<"dm" | "group">("dm");
  const [query, setQuery] = useState("");
  const [contacts, setContacts] = useState<MessageContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MessageContact[]>([]);
  const [groupTitle, setGroupTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setMode("dm");
      setQuery("");
      setSelected([]);
      setGroupTitle("");
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const data = await messagesService.getContacts(query);
        if (!cancelled) setContacts(data);
      } catch {
        if (!cancelled) setContacts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, query]);

  const handlePickDm = async (contact: MessageContact) => {
    setSubmitting(true);
    setError(null);
    try {
      const thread = await messagesService.openDm(contact.id);
      onThreadReady(thread);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start that conversation");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleSelected = (contact: MessageContact) => {
    setSelected((prev) =>
      prev.some((c) => c.id === contact.id)
        ? prev.filter((c) => c.id !== contact.id)
        : [...prev, contact],
    );
  };

  const handleCreateGroup = async () => {
    if (!groupTitle.trim() || selected.length < 2) return;
    setSubmitting(true);
    setError(null);
    try {
      const thread = await messagesService.createGroup(
        groupTitle.trim(),
        selected.map((c) => c.id),
      );
      onThreadReady(thread);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the group");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New message" size="sm">
      <div className="space-y-4">
        <div className="flex gap-1.5 rounded-full bg-slate-100 dark:bg-white/[0.06] p-1 w-fit">
          {(["dm", "group"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                mode === m
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {m === "dm" ? "Direct message" : "Group"}
            </button>
          ))}
        </div>

        {mode === "group" && (
          <input
            type="text"
            value={groupTitle}
            onChange={(e) => setGroupTitle(e.target.value)}
            placeholder="Group name…"
            className={inputClass}
          />
        )}

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            className={`${inputClass} pl-8`}
          />
        </div>

        {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

        <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/[0.08]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={18} className="animate-spin text-slate-400" />
            </div>
          ) : contacts.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
              No one found in your department scope.
            </p>
          ) : (
            contacts.map((c) => {
              const isSelected = selected.some((s) => s.id === c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={submitting}
                  onClick={() => (mode === "dm" ? handlePickDm(c) : toggleSelected(c))}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors disabled:opacity-50 border-b border-slate-100 dark:border-white/[0.04] last:border-b-0"
                >
                  <ThreadAvatar title={c.full_name} kind="dm" size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">
                      {c.full_name}
                    </span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                      {c.email}
                    </span>
                  </span>
                  {mode === "group" && isSelected && (
                    <Check size={16} className="shrink-0 text-indigo-600 dark:text-indigo-400" />
                  )}
                </button>
              );
            })
          )}
        </div>

        {mode === "group" && (
          <button
            type="button"
            onClick={handleCreateGroup}
            disabled={submitting || !groupTitle.trim() || selected.length < 2}
            className={`${buttonPrimary} w-full justify-center disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {submitting && <Loader2 size={16} className="animate-spin" />}
            Create group{selected.length > 0 ? ` (${selected.length + 1})` : ""}
          </button>
        )}
      </div>
    </Modal>
  );
}
