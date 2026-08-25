"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { CalendarClock, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Sparkles } from "lucide-react";
import type { BusyDay, Candidate, Engagement, Interview } from "@/lib/types";
import {
  formatDate,
  formatInterviewTimeInZone,
  INTERVIEW_SCHEDULE_TZ,
  parseUtcDatetime,
  TIMEZONE_OPTIONS,
} from "@/lib/utils";
import { getCandidateColor } from "@/lib/candidateColor";
import StatusBadge from "@/components/StatusBadge";
import CandidateAvatar from "@/components/CandidateAvatar";
import Modal, { buttonPrimary, textareaClass } from "@/components/Modal";
import WeeklyProgressButton from "@/components/WeeklyProgressButton";
import { addDays, startOfDay, toISODateLocal } from "@/components/TimeGridCalendar";
import { toZonedTime } from "date-fns-tz";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** Narrow screens: short labels so columns stay readable */
const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

function useMinWidthSm(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(min-width: 640px)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(min-width: 640px)").matches,
    () => false,
  );
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMonthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const dim = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

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

/** "Interviews - August 29 / 1. Final for Acme - Backend Dev: Jane Doe / ..." — most advanced round first. */
function buildDayInterviewsMessage(date: Date, dayInterviews: Interview[]): string {
  const header = `Interviews - ${date.toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;
  const ordered = [...dayInterviews].sort((a, b) => roundRank(b.round) - roundRank(a.round));
  const lines = ordered.map((inv, idx) => {
    const roundLabel = formatRoundLabel(inv.round);
    const company = inv.company_name || "—";
    const candidate = inv.candidate_name || "—";
    const time = formatInterviewTimeInZone(inv.interview_date, inv.time_est, INTERVIEW_SCHEDULE_TZ);
    const timeSuffix = time !== "—" ? ` (${time})` : "";
    return `${idx + 1}. ${roundLabel} for ${company} - Dev name: ${candidate}${timeSuffix}`;
  });
  return [header, ...lines].join("\n");
}

export default function InterviewsCalendar({
  interviews,
  onSelectInterview,
  busyDays = [],
  engagements = [],
  currentUserId,
  onDayClick,
  onBusyBarClick,
  onExpandDay,
  onVisibleRangeChange,
  tz = INTERVIEW_SCHEDULE_TZ,
  onTzChange,
  candidateMap = {},
}: {
  interviews: Interview[];
  onSelectInterview: (interview: Interview, anchorRect?: DOMRect) => void;
  busyDays?: BusyDay[];
  /** Engagements touching the visible month — used only to flag days that have one (see {@link onVisibleRangeChange}). */
  engagements?: Engagement[];
  currentUserId?: string;
  onDayClick?: (date: string) => void;
  onBusyBarClick?: (date: string) => void;
  /** Click anywhere on a day cell (outside its interactive controls) to open that day's full hourly agenda. */
  onExpandDay?: (date: string) => void;
  /** Fired whenever the visible month changes, so the caller can (re)fetch `engagements` for it. */
  onVisibleRangeChange?: (start: Date, end: Date) => void;
  /** IANA zone to display interview times in (see {@link TIMEZONE_OPTIONS}). Defaults to Eastern. */
  tz?: string;
  onTzChange?: (tz: string) => void;
  /** candidate_id -> Candidate, used to show each interview's avatar/color and accent its block. */
  candidateMap?: Record<string, Candidate>;
}) {
  function getCandidateInitials(name?: string | null): string {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const label = cursor.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });

  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);

  useEffect(() => {
    onVisibleRangeChange?.(new Date(year, month, 1), new Date(year, month + 1, 0));
  }, [year, month, onVisibleRangeChange]);

  const todayIso = useMemo(() => toISODate(new Date()), []);

  const byDate = useMemo(() => {
    const m = new Map<string, Interview[]>();
    for (const i of interviews) {
      if (!i.interview_date) continue;
      const key = i.interview_date.split("T")[0];
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(i);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const ta = a.time_est || "";
        const tb = b.time_est || "";
        if (ta !== tb) return ta.localeCompare(tb);
        return a.company_name?.localeCompare(b.company_name || "") || 0;
      });
    }
    return m;
  }, [interviews]);

  const busyByDate = useMemo(() => {
    const m = new Map<string, BusyDay[]>();
    for (const bd of busyDays) {
      const key = bd.date.split("T")[0];
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(bd);
    }
    return m;
  }, [busyDays]);

  /** Every calendar day an engagement touches (spans multiple days for multi-day all-day items),
   * in `tz` wall-clock terms — used only to flag day cells that have one. */
  const engagementsByDate = useMemo(() => {
    const m = new Map<string, Engagement[]>();
    for (const eng of engagements) {
      const start = parseUtcDatetime(eng.start_time);
      const end = parseUtcDatetime(eng.end_time);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      let cur = startOfDay(toZonedTime(start, tz));
      const last = startOfDay(toZonedTime(end, tz));
      let guard = 0;
      while (cur <= last && guard < 60) {
        const key = toISODateLocal(cur);
        if (!m.has(key)) m.set(key, []);
        m.get(key)!.push(eng);
        cur = addDays(cur, 1);
        guard += 1;
      }
    }
    return m;
  }, [engagements, tz]);

  const undated = useMemo(
    () => interviews.filter((i) => !i.interview_date),
    [interviews],
  );

  const smUp = useMinWidthSm();
  const maxPerDay = smUp ? 3 : 2;

  /** Full-day list when "+N more" is used */
  const [dayListModal, setDayListModal] = useState<{
    date: Date;
    interviews: Interview[];
  } | null>(null);

  /** AI-magic message generator for the per-day (sparkle icon) message */
  const [messageModal, setMessageModal] = useState<{ title: string; text: string } | null>(null);
  const [messageCopied, setMessageCopied] = useState(false);

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

  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));
  const goToday = () => {
    const n = new Date();
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
  };

  return (
    <div className="mx-auto w-full max-w-[100vw] min-w-0 space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1 sm:justify-start sm:gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/[0.1] dark:bg-[#12141c] dark:text-slate-200 dark:hover:bg-white/[0.04]"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="min-w-0 flex-1 text-center text-base font-semibold text-slate-900 sm:min-w-[10rem] sm:flex-none sm:text-lg dark:text-white">
            {label}
          </h2>
          <button
            type="button"
            onClick={goNext}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/[0.1] dark:bg-[#12141c] dark:text-slate-200 dark:hover:bg-white/[0.04]"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <button
            type="button"
            onClick={goToday}
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20 sm:flex-none"
          >
            Today
          </button>
          <WeeklyProgressButton interviews={interviews} />
          {onTzChange && (
            <div className="relative flex-1 sm:flex-none">
              <select
                value={tz}
                onChange={(e) => onTzChange(e.target.value)}
                aria-label="Timezone"
                className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-700 shadow-sm outline-none transition-colors hover:bg-slate-50 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 dark:border-white/[0.1] dark:bg-[#12141c] dark:text-slate-200 dark:hover:bg-white/[0.04]"
              >
                {TIMEZONE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
              />
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-[11px] text-slate-500 dark:text-slate-400 sm:text-left">
        <span className="font-medium text-slate-600 dark:text-slate-300">
          Times shown in {TIMEZONE_OPTIONS.find((o) => o.value === tz)?.label ?? tz}
        </span>{" "}
        — day cells use each row&apos;s interview date (aligned with Date
        (EST) on the list); within a day, entries sort by scheduled EST
        time.
      </p>

      <div className="w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#12141c]">
        <div
          className="grid w-full grid-cols-7 border-b border-slate-200 dark:border-white/[0.06]"
          role="row"
        >
          {WEEKDAYS.map((wd, wi) => (
            <div
              key={wd}
              className="px-0.5 py-1.5 text-center text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:px-2 sm:py-2 sm:text-[11px] dark:text-slate-400"
            >
              <span className="sm:hidden">{WEEKDAY_SHORT[wi]}</span>
              <span className="hidden sm:inline">{wd}</span>
            </div>
          ))}
        </div>
        <div className="grid w-full grid-cols-7">
          {grid.map((day, idx) => {
            if (!day) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="min-h-[4.5rem] border-b border-r border-slate-100 bg-slate-50/50 sm:min-h-[7.5rem] dark:border-white/[0.04] dark:bg-white/[0.01] last:border-r-0"
                />
              );
            }
            const iso = toISODate(day);
            const dayInterviews = byDate.get(iso) ?? [];
            const dayBusy = busyByDate.get(iso) ?? [];
            const dayEngagements = engagementsByDate.get(iso) ?? [];
            const isToday = iso === todayIso;
            const isMyBusy = dayBusy.some((b) => b.user_id === currentUserId);
            const visible = dayInterviews.slice(0, maxPerDay);
            const rest = dayInterviews.length - visible.length;

            const cellBg = isToday
              ? "bg-indigo-50/80 dark:bg-indigo-500/10"
              : isMyBusy
                ? "bg-red-50/70 dark:bg-red-500/[0.07]"
                : "bg-white dark:bg-[#12141c]";

            return (
              <div
                key={iso}
                onClick={onExpandDay ? () => onExpandDay(iso) : undefined}
                title={onExpandDay ? "Click to view this day's full agenda" : undefined}
                className={`min-h-[4.5rem] border-b border-r border-slate-100 p-0.5 sm:min-h-[7.5rem] sm:p-1.5 dark:border-white/[0.06] last:border-r-0 ${cellBg} ${onExpandDay ? "cursor-pointer" : ""}`}
              >
                <div className="mb-0.5 flex items-center justify-between gap-0.5 sm:mb-1">
                  {onDayClick ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDayClick(iso);
                      }}
                      title="Manage availability for this day"
                      className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded px-0.5 text-[10px] font-medium transition-shadow hover:ring-2 hover:ring-red-400 hover:ring-offset-1 sm:h-6 sm:min-w-[1.5rem] sm:text-xs ${
                        isToday
                          ? "bg-indigo-600 text-white dark:bg-indigo-500"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {day.getDate()}
                    </button>
                  ) : (
                    <span
                      className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded px-0.5 text-[10px] font-medium sm:h-6 sm:min-w-[1.5rem] sm:text-xs ${
                        isToday
                          ? "bg-indigo-600 text-white dark:bg-indigo-500"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {day.getDate()}
                    </span>
                  )}
                  {dayInterviews.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMessageCopied(false);
                        setMessageModal({
                          title: `Interviews message — ${formatDate(iso)}`,
                          text: buildDayInterviewsMessage(day, dayInterviews),
                        });
                      }}
                      title="Generate interviews message for this day"
                      aria-label="Generate interviews message for this day"
                      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-indigo-500 hover:bg-indigo-100 hover:text-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-500/20 sm:h-5 sm:w-5"
                    >
                      <Sparkles size={11} />
                    </button>
                  )}
                </div>
                {/* Busy Day label + names */}
                {dayBusy.length > 0 && (() => {
                  const nameList = dayBusy
                    .slice(0, 2)
                    .map((bd) =>
                      bd.user_id === currentUserId ? "You" : bd.user_name.split(" ")[0],
                    )
                    .join(", ") + (dayBusy.length > 2 ? ` +${dayBusy.length - 2}` : "");

                  const inner = (
                    <>
                      <span className="inline-flex w-full items-center justify-center rounded bg-red-100 px-0.5 py-0.5 text-[7px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-500/20 dark:text-red-400 sm:text-[8px]">
                        Busy Day{dayBusy.length > 1 ? ` ×${dayBusy.length}` : ""}
                      </span>
                      <p className="hidden sm:block mt-0.5 truncate text-[8px] leading-tight text-red-600/80 dark:text-red-400/70">
                        {nameList}
                      </p>
                    </>
                  );

                  return onBusyBarClick ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onBusyBarClick(iso);
                      }}
                      className="mb-0.5 w-full text-left transition-opacity hover:opacity-75 sm:mb-1"
                      title="Click to see details"
                    >
                      {inner}
                    </button>
                  ) : (
                    <div className="mb-0.5 sm:mb-1">{inner}</div>
                  );
                })()}
                {/* Engagement indicator — shown even when the day has no interviews, so the
                    cell doesn't read as empty when a meeting is actually scheduled. */}
                {dayEngagements.length > 0 && (
                  <div
                    title={dayEngagements
                      .slice(0, 3)
                      .map((e) => e.title)
                      .join(", ")}
                    className="mb-0.5 flex w-full items-center gap-0.5 rounded bg-violet-100 px-0.5 py-0.5 text-[7px] font-bold uppercase tracking-wide text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 sm:mb-1 sm:text-[8px]"
                  >
                    <CalendarClock size={9} className="shrink-0" />
                    <span className="truncate">
                      {dayEngagements.length === 1
                        ? dayEngagements[0].title
                        : `${dayEngagements.length} Engagements`}
                    </span>
                  </div>
                )}
                <ul className="space-y-0.5 sm:space-y-1 min-w-0">
                  {visible.map((inv) => {
                    const cand = inv.candidate_id ? candidateMap[inv.candidate_id] : undefined;
                    const candColor = cand ? getCandidateColor(cand) : undefined;
                    return (
                    <li key={inv.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectInterview(inv, e.currentTarget.getBoundingClientRect());
                        }}
                        style={candColor ? { borderLeftColor: candColor, borderLeftWidth: 3 } : undefined}
                        title={`${inv.round} — ${inv.company_name || "Interview"}${inv.candidate_name ? ` (${inv.candidate_name})` : ""}`}
                        className="group flex w-full items-center gap-1 min-w-0 overflow-hidden rounded border border-slate-200/80 bg-slate-50 px-1 py-0.5 text-left text-[8px] sm:text-[10px] leading-tight text-slate-800 shadow-sm hover:border-indigo-300 hover:bg-indigo-50/80 active:bg-indigo-100/50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-100 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/15 sm:rounded-md sm:px-1.5 sm:py-1"
                      >
                        {/* Initials Avatar */}
                        <span className="shrink-0 flex items-center">
                          {cand ? (
                            <CandidateAvatar candidate={cand} size={15} />
                          ) : (
                            <span className="flex h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[7px] sm:text-[8px] font-bold text-indigo-700 dark:text-indigo-300">
                              {getCandidateInitials(inv.candidate_name)}
                            </span>
                          )}
                        </span>

                        {/* Content text - strictly truncated with ellipsis */}
                        <span className="min-w-0 flex-1 truncate font-medium">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {inv.round || "Interview"}
                          </span>
                          {inv.company_name && (
                            <span className="text-slate-500 dark:text-slate-400 font-normal">
                              {" · "}{inv.company_name}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                    );
                  })}
                </ul>
                {rest > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDayListModal({ date: day, interviews: dayInterviews });
                    }}
                    className="mt-0.5 w-full rounded px-0.5 py-0.5 text-left text-[8px] font-semibold text-indigo-600 underline decoration-indigo-500/50 underline-offset-2 hover:bg-indigo-500/10 hover:text-indigo-700 sm:mt-1 sm:px-0.5 sm:text-[10px] dark:text-indigo-400 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300"
                    aria-label={`Show ${rest} more interview${rest === 1 ? "" : "s"} for this day`}
                  >
                    +{rest} more
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Modal
        open={!!dayListModal}
        onClose={() => setDayListModal(null)}
        title={
          dayListModal
            ? formatDate(toISODate(dayListModal.date))
            : "Interviews"
        }
        size="sm"
      >
        {dayListModal && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {dayListModal.interviews.length} interview
              {dayListModal.interviews.length !== 1 ? "s" : ""} on this day —
              open one for details.
            </p>
            <ul className="max-h-[min(60vh,20rem)] space-y-2 overflow-y-auto">
              {dayListModal.interviews.map((inv) => {
                const cand = inv.candidate_id ? candidateMap[inv.candidate_id] : undefined;
                const candColor = cand ? getCandidateColor(cand) : undefined;
                return (
                <li key={inv.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectInterview(inv);
                      setDayListModal(null);
                    }}
                    style={candColor ? { borderLeftColor: candColor, borderLeftWidth: 3 } : undefined}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm text-slate-900 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/80 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-100 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/15"
                  >
                    <div className="flex items-center gap-2">
                      {/* Candidate avatar */}
                      {cand ? (
                        <CandidateAvatar candidate={cand} size={28} />
                      ) : (
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-700 dark:text-indigo-300">
                          {getCandidateInitials(inv.candidate_name)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">
                          {inv.candidate_name || "Candidate"}
                          <span className="ml-2 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                            {inv.round}
                          </span>
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">
                          {inv.company_name || "Company"}
                          {inv.time_est && (
                            <span className="ml-2 tabular-nums">
                              {formatInterviewTimeInZone(inv.interview_date, inv.time_est, tz)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
                );
              })}
            </ul>
          </div>
        )}
      </Modal>

      <Modal
        open={!!messageModal}
        onClose={() => setMessageModal(null)}
        title={messageModal?.title ?? "Interviews message"}
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

      {undated.length > 0 && (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 sm:p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            No interview date ({undated.length})
          </h3>
          <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/80">
            These rows have no scheduled date yet. Open the interviews list to
            add or edit dates.
          </p>
          <ul className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {undated.map((inv) => {
              const cand = inv.candidate_id ? candidateMap[inv.candidate_id] : undefined;
              return (
              <li key={inv.id} className="min-w-0 sm:max-w-none">
                <button
                  type="button"
                  onClick={(e) => onSelectInterview(inv, e.currentTarget.getBoundingClientRect())}
                  className="flex w-full max-w-full flex-col items-stretch gap-1.5 rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-left text-xs font-medium text-amber-950 hover:bg-amber-50 sm:inline-flex sm:w-auto sm:flex-row sm:items-center sm:gap-2 dark:border-amber-500/30 dark:bg-[#1a1d2a] dark:text-amber-50 dark:hover:bg-amber-500/10"
                >
                  <span className="line-clamp-2 min-w-0 break-words sm:line-clamp-1 sm:max-w-[12rem] inline-flex items-center gap-1.5">
                    {cand && <CandidateAvatar candidate={cand} size={14} />}
                    {inv.candidate_name} · {inv.company_name}
                  </span>
                  <span className="shrink-0 self-start sm:self-center">
                    <StatusBadge status={inv.computed_status} />
                  </span>
                </button>
              </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
