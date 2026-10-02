"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { JdHighlight, JdHighlightType } from "@/lib/types";

/** Color + label per highlight type — the order here is the legend order. */
export const JD_HIGHLIGHT_STYLES: Record<JdHighlightType, { label: string; className: string }> = {
  skill: {
    label: "Skills & tools",
    className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-400/20 dark:text-indigo-200",
  },
  concept: {
    label: "Concepts",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-400/20 dark:text-sky-200",
  },
  requirement: {
    label: "Requirements",
    className: "bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-200",
  },
  compensation: {
    label: "Compensation",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-400/20 dark:text-emerald-200",
  },
  employment: {
    label: "Type & location",
    className: "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-400/20 dark:text-fuchsia-200",
  },
};

const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `text` with every highlight phrase (case-insensitive, any whitespace between words) marked
 * in its type's color. Phrases no longer in the text (e.g. after an edit) are simply skipped. */
export function JobDescriptionText({
  text,
  highlights,
}: {
  text: string;
  highlights: JdHighlight[];
}) {
  const typeByPhrase = new Map<string, JdHighlightType>();
  for (const h of highlights) {
    const key = normalize(h.text);
    if (key && JD_HIGHLIGHT_STYLES[h.type] && !typeByPhrase.has(key)) typeByPhrase.set(key, h.type);
  }
  if (!typeByPhrase.size) return <>{text}</>;

  // Longest first so "REST API" wins over "REST"; word-ish boundaries so "Go" doesn't match "Google".
  const pattern = [...typeByPhrase.keys()]
    .sort((a, b) => b.length - a.length)
    .map((p) => `(?<![\\w])${escapeRegExp(p).replace(/ /g, "\\s+")}(?![\\w])`)
    .join("|");
  const parts = text.split(new RegExp(`(${pattern})`, "gi"));

  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;
        const type = typeByPhrase.get(normalize(part));
        return (
          <mark
            key={i}
            className={`rounded px-0.5 ${type ? JD_HIGHLIGHT_STYLES[type].className : ""}`}
          >
            {part}
          </mark>
        );
      })}
    </>
  );
}

/** Legend for the highlight types actually present. */
export function JobDescriptionLegend({ highlights }: { highlights: JdHighlight[] }) {
  const present = new Set(highlights.map((h) => h.type));
  const types = (Object.keys(JD_HIGHLIGHT_STYLES) as JdHighlightType[]).filter((t) => present.has(t));
  if (!types.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map((t) => (
        <span
          key={t}
          className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${JD_HIGHLIGHT_STYLES[t].className}`}
        >
          {JD_HIGHLIGHT_STYLES[t].label}
        </span>
      ))}
    </div>
  );
}

/** Highlights for an interview: the typed ones when present, else the older plain keyword list
 * (documents processed before typed highlights existed) shown as skills. */
export function interviewJdHighlights(interview: {
  jd_highlights?: JdHighlight[] | null;
  interview_doc_keywords?: string | null;
}): JdHighlight[] {
  if (interview.jd_highlights?.length) return interview.jd_highlights;
  return (interview.interview_doc_keywords || "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean)
    .map((text) => ({ text, type: "skill" as const }));
}

/** Centered dialog for reading/editing a JD at full size. Stacks above the side drawer (Modal):
 * Escape and backdrop clicks close only this dialog, not the drawer underneath. */
export function JobDescriptionDialog({
  open,
  onClose,
  title = "Job Description",
  headerActions,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Capture phase on window runs before the drawer's own Escape listener — stop it there.
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-2xl border border-white/40 dark:border-white/[0.08] bg-white dark:bg-[#14161f] shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/70 dark:border-white/[0.07] px-5 py-3.5">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white sm:text-base">
            {title}
          </h2>
          {headerActions}
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.07] hover:text-slate-900 dark:hover:text-white transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
