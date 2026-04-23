import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { STATUS_COLORS } from "./constants";
import type { Interview } from "./types";

/** IANA zone for interview scheduling (US Eastern, handles EST/EDT). */
export const INTERVIEW_SCHEDULE_TZ = "America/New_York";

/**
 * Format an ISO date string to a human-readable format (browser local timezone).
 * Prefer {@link formatInterviewDateEst} for interview calendar dates.
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseTimePartsForEst(
  timeStr: string | null | undefined,
): { h: number; m: number; s: number } {
  if (!timeStr || !timeStr.trim()) return { h: 12, m: 0, s: 0 };
  const parts = timeStr.trim().split(":").map((p) => parseInt(p, 10));
  return {
    h: Number.isFinite(parts[0]) ? parts[0]! : 12,
    m: Number.isFinite(parts[1]) ? parts[1]! : 0,
    s: Number.isFinite(parts[2]) ? parts[2]! : 0,
  };
}

/**
 * Calendar date of the interview in US Eastern (interviews are scheduled in EST/ET).
 * Uses `interview_date` + `time_est` as wall-clock time in {@link INTERVIEW_SCHEDULE_TZ},
 * then formats that instant's date in the same zone — stable across user system timezones.
 */
export function formatInterviewDateEst(
  interviewDate: string | null | undefined,
  timeEst?: string | null,
): string {
  if (!interviewDate) return "—";
  const ymd = interviewDate.split("T")[0]!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
    const d = new Date(interviewDate);
    if (Number.isNaN(d.getTime())) return "—";
    return formatInTimeZone(d, INTERVIEW_SCHEDULE_TZ, "MMM d, yyyy");
  }
  const { h, m, s } = parseTimePartsForEst(timeEst ?? null);
  const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const zonedLocalStr = `${ymd} ${timeStr}`;
  const utcInstant = fromZonedTime(zonedLocalStr, INTERVIEW_SCHEDULE_TZ);
  if (Number.isNaN(utcInstant.getTime())) return "—";
  return formatInTimeZone(utcInstant, INTERVIEW_SCHEDULE_TZ, "MMM d, yyyy");
}

/**
 * Returns today's date in YYYY-MM-DD format in US Eastern time.
 */
export function getTodayEst(): string {
  return formatInTimeZone(new Date(), INTERVIEW_SCHEDULE_TZ, "yyyy-MM-dd");
}

/**
 * Format a time string (HH:MM:SS) to 12-hour format.
 */
export function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return "—";
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

/**
 * Get status badge styling based on status text.
 */
/** Badge colors for thread lead outcome (GET/PATCH lead on interviews). */
export function getLeadOutcomeBadgeStyle(outcome: string | null | undefined): {
  bg: string;
  text: string;
  dot: string;
} {
  const o = (outcome || "").toLowerCase();
  if (o === "active" || o === "in_pipeline") {
    return {
      bg: "bg-blue-500/15",
      text: "text-blue-800 dark:text-blue-300",
      dot: "bg-blue-500",
    };
  }
  if (o === "unresponsive") {
    return {
      bg: "bg-amber-500/15",
      text: "text-amber-800 dark:text-amber-300",
      dot: "bg-amber-500",
    };
  }
  if (o === "rejected") return STATUS_COLORS.rejected;
  if (o === "dropped") return STATUS_COLORS.dropped;
  if (o === "closed") return STATUS_COLORS.closed;
  if (o === "dead") return STATUS_COLORS.dead;
  if (o === "converted") return STATUS_COLORS.converted;
  return {
    bg: "bg-slate-500/10",
    text: "text-slate-600 dark:text-slate-400",
    dot: "bg-slate-400",
  };
}

/** Same palette as {@link getLeadOutcomeBadgeStyle} for native select shells on the Leads table. */
export function getLeadOutcomeSelectShellClass(
  outcome: string | null | undefined,
): string {
  const o = (outcome || "").toLowerCase();
  const f =
    "focus:ring-2 focus:ring-offset-0 dark:focus:ring-offset-0 focus:outline-none";
  if (o === "active" || o === "in_pipeline") {
    return `border-blue-500/40 bg-blue-500/[0.08] text-blue-950 dark:text-blue-100 ${f} focus:border-blue-500/55 focus:ring-blue-500/25`;
  }
  if (o === "unresponsive") {
    return `border-amber-500/40 bg-amber-500/[0.08] text-amber-950 dark:text-amber-100 ${f} focus:border-amber-500/55 focus:ring-amber-500/25`;
  }
  if (o === "rejected") {
    return `border-red-500/40 bg-red-500/[0.08] text-red-950 dark:text-red-100 ${f} focus:border-red-500/55 focus:ring-red-500/25`;
  }
  if (o === "dropped") {
    return `border-amber-500/40 bg-amber-500/[0.08] text-amber-950 dark:text-amber-100 ${f} focus:border-amber-500/55 focus:ring-amber-500/25`;
  }
  if (o === "closed") {
    return `border-emerald-500/45 bg-emerald-500/[0.10] text-emerald-950 dark:text-emerald-100 ${f} focus:border-emerald-500/55 focus:ring-emerald-500/25`;
  }
  if (o === "dead") {
    return `border-stone-500/40 bg-stone-500/[0.08] text-stone-900 dark:text-stone-200 ${f} focus:border-stone-500/55 focus:ring-stone-500/25`;
  }
  if (o === "converted") {
    return `border-violet-500/45 bg-violet-500/[0.10] text-violet-950 dark:text-violet-100 ${f} focus:border-violet-500/55 focus:ring-violet-500/25`;
  }
  return `border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-slate-900 dark:text-white ${f} focus:border-indigo-500/50 focus:ring-indigo-500/20`;
}

export function getStatusStyle(status: string | null | undefined) {
  const label = getStatusLabel(status).toLowerCase();

  if (label === "unresponsed") {
    return {
      bg: "bg-amber-500/15",
      text: "text-amber-800 dark:text-amber-300",
      dot: "bg-amber-500",
    };
  }
  if (label === "upcoming") {
    return {
      bg: "bg-blue-500/15",
      text: "text-blue-800 dark:text-blue-300",
      dot: "bg-blue-500",
    };
  }
  if (label.includes("converted")) return STATUS_COLORS.converted;
  if (label.includes("rejected")) return STATUS_COLORS.rejected;
  if (label.includes("dropped")) return STATUS_COLORS.dropped;
  if (label.includes("closed")) return STATUS_COLORS.closed;
  if (label === "dead") return STATUS_COLORS.dead;

  return { bg: "bg-slate-500/10", text: "text-slate-400", dot: "bg-slate-400" };
}

/**
 * Get a short label for a status string.
 */
export function getStatusLabel(status: string | null | undefined): string {
  if (!status || status.trim() === "") return "Unresponsed";
  if (status.length > 50) return status.substring(0, 47) + "...";
  return status;
}

/**
 * Truncate text to a max length with ellipsis.
 */
export function truncate(text: string | null | undefined, max: number = 80): string {
  if (!text) return "—";
  if (text.length <= max) return text;
  return text.substring(0, max - 3) + "...";
}

/**
 * Convert a record to chart-friendly array of {name, value}.
 */
export function recordToChartData(record: Record<string, number>): { name: string; value: number }[] {
  return Object.entries(record)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Capitalize the first letter of each word.
 */
export function titleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Order interviews in a pipeline: by date, then created_at. Missing dates sort last. */
export function sortInterviewsInChain(a: Interview, b: Interview): number {
  const da = a.interview_date ?? "9999-12-31";
  const db = b.interview_date ?? "9999-12-31";
  if (da !== db) return da.localeCompare(db);
  return a.created_at.localeCompare(b.created_at);
}

/** Interview IDs that are later rounds in the chain (children of rootId). */
export function collectDescendantInterviewIds(
  interviews: Interview[],
  rootId: string,
): Set<string> {
  const byParent = new Map<string, string[]>();
  for (const i of interviews) {
    if (!i.parent_interview_id) continue;
    const list = byParent.get(i.parent_interview_id) ?? [];
    list.push(i.id);
    byParent.set(i.parent_interview_id, list);
  }
  const out = new Set<string>();
  const stack = [...(byParent.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(byParent.get(id) ?? []));
  }
  return out;
}

/** Suggested label for the next round (user can edit). */
export function suggestNextRoundLabel(currentRound: string): string {
  const lower = currentRound.trim().toLowerCase();
  if (/recruiter|screen|phone|intro/.test(lower)) return "1st";
  if (lower === "1st" || lower === "first") return "2nd";
  if (lower === "2nd" || lower === "second") return "3rd";
  if (lower === "3rd" || lower === "third") return "4th";
  if (lower === "4th") return "5th";
  return "";
}
