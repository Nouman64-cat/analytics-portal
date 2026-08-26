"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Sparkles } from "lucide-react";
import type { Interview } from "@/lib/types";
import { formatInterviewTimeInZone, INTERVIEW_SCHEDULE_TZ } from "@/lib/utils";
import { interviewsService } from "@/lib/services";
import Modal, { buttonPrimary, textareaClass } from "@/components/Modal";

/** Compact round label for the generated message, e.g. "1st" -> "R1". Final/other rounds pass through as-is. */
function formatRoundLabel(round: string): string {
  const trimmed = (round || "").trim();
  const m = trimmed.match(/^(\d+)(st|nd|rd|th)$/i);
  return m ? `R${m[1]}` : trimmed || "Round";
}

/** Higher = more advanced round, so Final/late rounds sort first in the generated message. */
function roundRank(round: string): number {
  const key = (round || "").trim().toLowerCase();
  if (key === "final") return 1000;
  const m = key.match(/^(\d+)(st|nd|rd|th)?$/);
  if (m) return parseInt(m[1], 10);
  if (key.includes("phone")) return 0;
  if (key.includes("recruiter")) return -1;
  return -2;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday-start calendar week containing `d` — { start: Monday 00:00, end: Sunday 23:59 }. */
function getCalendarWeekRange(d: Date): { start: Date; end: Date } {
  const day = d.getDay(); // 0 = Sun .. 6 = Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start, end };
}

interface ProgressItem {
  round: string;
  company: string;
  candidate: string;
  status: string;
  date: string;
  time?: string;
}

/** Raw (round, company, candidate, status, date/time) rows for interviews that progressed to a next
 * round across this week (Monday through today, not the rest of the week) + last week (full
 * Mon–Sun) — fed to the LLM to turn into a readable summary, since a flat sorted list reads as
 * noise once there are more than a handful of rows. */
function getWeeklyProgressPayload(interviews: Interview[]): {
  rangeLabel: string;
  items: ProgressItem[];
} {
  const today = new Date();
  const { start: thisMonday } = getCalendarWeekRange(today);
  const lastMonday = new Date(
    thisMonday.getFullYear(),
    thisMonday.getMonth(),
    thisMonday.getDate() - 7,
  );
  const startIso = toISODate(lastMonday);
  const endIso = toISODate(today);

  // A round represents real progress if its thread has more than one round — i.e. the pipeline
  // has actually advanced at some point. Checking only a round's OWN status misses the newest
  // round in the chain: creating round N+1 auto-flips round N's status to "Converted", but round
  // N+1 itself (the round the candidate is now actually in) has no status of its own yet.
  const roundCountByThread = new Map<string, number>();
  for (const inv of interviews) {
    if (!inv.thread_id) continue;
    roundCountByThread.set(inv.thread_id, (roundCountByThread.get(inv.thread_id) ?? 0) + 1);
  }

  const progressed = interviews.filter((inv) => {
    if (!inv.interview_date || !inv.thread_id) return false;
    const iso = inv.interview_date.split("T")[0];
    if (iso < startIso || iso > endIso) return false;
    return (roundCountByThread.get(inv.thread_id) ?? 0) > 1;
  });

  // A thread (lead pipeline) can have multiple rounds land within the same window — e.g. R2 and R3
  // for the same company in one week. Only the latest round reflects the pipeline's current state,
  // so collapse each thread down to its single most-recent round before reporting it.
  const latestByThread = new Map<string, Interview>();
  for (const inv of progressed) {
    const existing = latestByThread.get(inv.thread_id!);
    if (
      !existing ||
      inv.interview_date! > existing.interview_date! ||
      (inv.interview_date === existing.interview_date && roundRank(inv.round) > roundRank(existing.round))
    ) {
      latestByThread.set(inv.thread_id!, inv);
    }
  }

  const rangeLabel = `${lastMonday.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${today.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  const ordered = [...latestByThread.values()].sort((a, b) => roundRank(b.round) - roundRank(a.round));
  const items: ProgressItem[] = ordered.map((inv) => {
    const dateIso = inv.interview_date!.split("T")[0];
    const dateLabel = new Date(`${dateIso}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    const time = formatInterviewTimeInZone(inv.interview_date, inv.time_est, INTERVIEW_SCHEDULE_TZ);
    return {
      round: formatRoundLabel(inv.round),
      company: inv.company_name || "—",
      candidate: inv.candidate_name || "—",
      status: inv.computed_status || "—",
      date: dateLabel,
      time: time !== "—" ? time : undefined,
    };
  });

  return { rangeLabel, items };
}

/** "Weekly progress" button + generated-message modal — shared by the month and week calendar views. */
export default function WeeklyProgressButton({ interviews }: { interviews: Interview[] }) {
  const [messageModal, setMessageModal] = useState<{ title: string; text: string } | null>(null);
  const [messageCopied, setMessageCopied] = useState(false);
  const [weeklyProgressLoading, setWeeklyProgressLoading] = useState(false);

  const handleCopyMessage = async () => {
    if (!messageModal) return;
    try {
      await navigator.clipboard.writeText(messageModal.text);
      setMessageCopied(true);
      setTimeout(() => setMessageCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleWeeklyProgress = async () => {
    const { rangeLabel, items } = getWeeklyProgressPayload(interviews);
    setMessageCopied(false);
    if (items.length === 0) {
      setMessageModal({
        title: `Weekly progress (${rangeLabel})`,
        text: `Weekly Progress (${rangeLabel})\n\nNo interviews progressed to the next round this period.`,
      });
      return;
    }
    setWeeklyProgressLoading(true);
    try {
      const res = await interviewsService.generateProgressSummary({
        range_label: rangeLabel,
        items,
      });
      setMessageModal({ title: `Weekly progress (${rangeLabel})`, text: res.summary });
    } catch (err) {
      setMessageModal({
        title: `Weekly progress (${rangeLabel})`,
        text:
          err instanceof Error
            ? `Couldn't generate the summary: ${err.message}`
            : "Couldn't generate the summary. Try again.",
      });
    } finally {
      setWeeklyProgressLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleWeeklyProgress}
        disabled={weeklyProgressLoading}
        title="Generate an AI summary of interviews that progressed to the next round this week and last week"
        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20 sm:flex-none"
      >
        {weeklyProgressLoading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Sparkles size={14} />
        )}
        Weekly progress
      </button>

      <Modal
        open={!!messageModal}
        onClose={() => setMessageModal(null)}
        title={messageModal?.title ?? "Weekly progress"}
        size="sm"
      >
        {messageModal && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Most advanced round first. Edit before copying if needed.
            </p>
            <textarea
              className={`${textareaClass} min-h-[220px] font-mono text-xs`}
              value={messageModal.text}
              onChange={(e) =>
                setMessageModal((prev) => (prev ? { ...prev, text: e.target.value } : prev))
              }
            />
            <button
              type="button"
              onClick={handleCopyMessage}
              className={`${buttonPrimary} w-full justify-center`}
            >
              {messageCopied ? <Check size={16} /> : <Copy size={16} />}
              {messageCopied ? "Copied!" : "Copy message"}
            </button>
          </div>
        )}
      </Modal>
    </>
  );
}
