"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Link2, MapPin } from "lucide-react";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { BusyDay, Candidate, Engagement, Interview } from "@/lib/types";
import { interviewInstant, parseUtcDatetime } from "@/lib/utils";
import { getCandidateColor } from "@/lib/candidateColor";
import CandidateAvatar from "@/components/CandidateAvatar";

function getCandidateInitials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export type CalendarGridView = "day" | "week" | "workweek";

const HOUR_PX = 56; // matches the h-14 hour row below
const DAY_PX = HOUR_PX * 24;
const MIN_BLOCK_PX = 20;
/** Fallback block length for interview rows saved before `duration_minutes` existed. */
const DEFAULT_INTERVIEW_BLOCK_MINUTES = 30;

export function toISODateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** A `Date` whose plain getters (getHours/getDate/…) read as `d`'s wall-clock time in `tz`. */
function zoned(d: Date, tz: string): Date {
  return toZonedTime(d, tz);
}

function hourLabel(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour === 12) return "12 PM";
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`;
}

/** The days a given grid view shows for `d`. "week" is the full Sun–Sat week (Google Calendar
 * style); "workweek" is just the 5 business days Monday–Friday. */
export function getCalendarDays(view: CalendarGridView, d: Date): Date[] {
  if (view === "day") return [startOfDay(d)];

  if (view === "workweek") {
    // Calculate Monday of the current week (Sunday = 0 -> -6, Monday = 1 -> 0, etc.)
    const day = d.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = addDays(startOfDay(d), diffToMonday);
    return Array.from({ length: 5 }, (_, i) => addDays(monday, i));
  }

  // "week": Sunday through Saturday (7 days)
  const sunday = addDays(startOfDay(d), -d.getDay());
  return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

interface LaidOutBlock<T> {
  item: T;
  startMin: number;
  endMin: number;
  col: number;
  cols: number;
}

/** Greedy column assignment for overlapping same-day events, clustered by connectivity. */
function layoutDayEvents<T>(
  events: { item: T; startMin: number; endMin: number }[],
): LaidOutBlock<T>[] {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const out: LaidOutBlock<T>[] = [];
  let cluster: typeof sorted = [];
  let clusterEnd = -Infinity;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const colEnds: number[] = [];
    const withCol = cluster.map((ev) => {
      let col = colEnds.findIndex((end) => end <= ev.startMin);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(ev.endMin);
      } else {
        colEnds[col] = ev.endMin;
      }
      return { ...ev, col };
    });
    const cols = colEnds.length;
    for (const ev of withCol) {
      out.push({ item: ev.item, startMin: ev.startMin, endMin: ev.endMin, col: ev.col, cols });
    }
    cluster = [];
  };

  for (const ev of sorted) {
    if (cluster.length > 0 && ev.startMin >= clusterEnd) flushCluster();
    cluster.push(ev);
    clusterEnd = Math.max(clusterEnd, ev.endMin);
  }
  flushCluster();
  return out;
}

interface TimeGridCalendarProps {
  view: CalendarGridView;
  cursorDate: Date;
  /** IANA zone the grid's hours, event positions, and "now" line are rendered in. */
  tz: string;
  interviews: Interview[];
  engagements: Engagement[];
  busyDays?: BusyDay[];
  candidateMap?: Record<string, Candidate>;
  currentUserId?: string;
  onSelectInterview: (interview: Interview, anchorRect?: DOMRect) => void;
  onSelectEngagement: (engagement: Engagement) => void;
  /** Omit to disable click-to-create (read-only users). */
  onCreateSlot?: (start: Date, end: Date) => void;
  onDayHeaderClick?: (iso: string) => void;
}

export default function TimeGridCalendar({
  view,
  cursorDate,
  tz,
  interviews,
  engagements,
  busyDays = [],
  candidateMap = {},
  currentUserId,
  onSelectInterview,
  onSelectEngagement,
  onCreateSlot,
  onDayHeaderClick,
}: TimeGridCalendarProps) {
  const days = useMemo(() => getCalendarDays(view, cursorDate), [view, cursorDate]);
  const todayIso = useMemo(() => toISODateLocal(zoned(new Date(), tz)), [tz]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll to a bit before the current hour whenever the visible range changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const showsToday = days.some((d) => toISODateLocal(d) === todayIso);
    const anchorMinutes = showsToday ? minutesOfDay(zoned(new Date(), tz)) : 8 * 60;
    el.scrollTop = Math.max(0, (anchorMinutes / 60 - 1.5) * HOUR_PX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cursorDate, tz]);

  const interviewsByDay = useMemo(() => {
    const m = new Map<string, { item: Interview; startMin: number; endMin: number }[]>();
    for (const iv of interviews) {
      const instant = interviewInstant(iv);
      if (!instant) continue;
      const z = zoned(instant, tz);
      const iso = toISODateLocal(z);
      const startMin = minutesOfDay(z);
      const durationMin = iv.duration_minutes ?? DEFAULT_INTERVIEW_BLOCK_MINUTES;
      const endMin = Math.min(startMin + durationMin, 1440);
      if (!m.has(iso)) m.set(iso, []);
      m.get(iso)!.push({ item: iv, startMin, endMin });
    }
    return m;
  }, [interviews, tz]);

  const engagementsByDay = useMemo(() => {
    const m = new Map<string, { item: Engagement; startMin: number; endMin: number }[]>();
    const allDay: Engagement[] = [];
    for (const eng of engagements) {
      if (eng.is_all_day) {
        allDay.push(eng);
        continue;
      }
      const start = parseUtcDatetime(eng.start_time);
      const end = parseUtcDatetime(eng.end_time);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) continue;
      const zStart = zoned(start, tz);
      const zEnd = zoned(end, tz);
      const iso = toISODateLocal(zStart);
      const startMin = minutesOfDay(zStart);
      const sameDay = toISODateLocal(zEnd) === iso;
      const endMin = sameDay ? Math.max(minutesOfDay(zEnd), startMin + 15) : 1440;
      if (!m.has(iso)) m.set(iso, []);
      m.get(iso)!.push({ item: eng, startMin, endMin });
    }
    return { byDay: m, allDay };
  }, [engagements, tz]);

  const busyByDay = useMemo(() => {
    const m = new Map<string, BusyDay[]>();
    for (const bd of busyDays) {
      const iso = bd.date.split("T")[0];
      if (!m.has(iso)) m.set(iso, []);
      m.get(iso)!.push(bd);
    }
    return m;
  }, [busyDays]);

  function handleCellDoubleClick(day: Date, hour: number, e: React.MouseEvent<HTMLDivElement>) {
    if (!onCreateSlot || e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetMin = ((e.clientY - rect.top) / HOUR_PX) * 60;
    const roundedMin = Math.round(offsetMin / 15) * 15;
    // The clicked row/column is a wall-clock slot in `tz`, not the browser's own timezone —
    // convert via `tz` so the created event lands back on the same visual slot after saving.
    const wallClock = `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())} ${pad(hour)}:${pad(roundedMin)}:00`;
    const start = fromZonedTime(wallClock, tz);
    onCreateSlot(start, new Date(start.getTime() + 30 * 60_000));
  }

  const multiCol = view !== "day";
  const colMinWidth = multiCol ? "9rem" : "0";

  return (
    <div className="w-full min-w-0 overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#12141c]">
      <div style={{ minWidth: multiCol ? `calc(3.5rem + ${days.length} * ${colMinWidth})` : undefined }}>
        {/* Day headers */}
        <div className="flex border-b border-slate-200 dark:border-white/[0.06]">
          <div className="w-14 shrink-0" />
          {days.map((day) => {
            const iso = toISODateLocal(day);
            const isToday = iso === todayIso;
            const dayBusy = busyByDay.get(iso) ?? [];
            const isMyBusy = dayBusy.some((b) => b.user_id === currentUserId);
            return (
              <div
                key={iso}
                className="min-w-0 flex-1 border-l border-slate-100 px-2 py-2 text-center dark:border-white/[0.06]"
                style={{ minWidth: multiCol ? colMinWidth : undefined }}
              >
                <button
                  type="button"
                  onClick={() => onDayHeaderClick?.(iso)}
                  disabled={!onDayHeaderClick}
                  className="mx-auto flex flex-col items-center gap-0.5"
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {day.toLocaleDateString("en-US", { weekday: "short" })}
                  </span>
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                      isToday
                        ? "bg-indigo-600 text-white dark:bg-indigo-500"
                        : "text-slate-800 dark:text-slate-100"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </button>
                {dayBusy.length > 0 && (
                  <span
                    className={`mt-1 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                      isMyBusy
                        ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                        : "bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400/80"
                    }`}
                  >
                    Busy{dayBusy.length > 1 ? ` ×${dayBusy.length}` : ""}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* All-day row */}
        {engagementsByDay.allDay.length > 0 && (
          <div className="flex border-b border-slate-200 dark:border-white/[0.06]">
            <div className="w-14 shrink-0 py-1.5 text-right pr-1.5 text-[9px] text-slate-400">All day</div>
            {days.map((day) => {
              const iso = toISODateLocal(day);
              const items = engagementsByDay.allDay.filter((e) => {
                const s = toISODateLocal(zoned(parseUtcDatetime(e.start_time), tz));
                const en = toISODateLocal(zoned(parseUtcDatetime(e.end_time), tz));
                return iso >= s && iso <= en;
              });
              return (
                <div
                  key={iso}
                  className="min-w-0 flex-1 space-y-0.5 border-l border-slate-100 p-1 dark:border-white/[0.06]"
                  style={{ minWidth: multiCol ? colMinWidth : undefined }}
                >
                  {items.map((eng) => {
                    const isCompleted = eng.status === "completed";
                    const isCancelled = eng.status === "cancelled";
                    const isTentative = eng.status === "tentative" || eng.show_as === "tentative";
                    const colorClass = isCancelled
                      ? "bg-slate-100 text-slate-400 line-through dark:bg-white/[0.04] dark:text-slate-500"
                      : isCompleted
                        ? "bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:bg-emerald-500/25 dark:text-emerald-200 border border-emerald-300/50 dark:border-emerald-500/30"
                        : isTentative
                          ? "bg-amber-100 text-amber-900 border border-dashed border-amber-300 dark:bg-amber-500/20 dark:text-amber-200"
                          : "bg-violet-100 text-violet-800 hover:bg-violet-200 dark:bg-violet-500/20 dark:text-violet-200 dark:hover:bg-violet-500/30";

                    return (
                      <button
                        key={eng.id}
                        type="button"
                        onClick={() => onSelectEngagement(eng)}
                        className={`w-full truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium flex items-center gap-1 transition-colors ${colorClass}`}
                      >
                        {isCompleted && <Check size={9} className="shrink-0 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />}
                        <span className="truncate">{eng.title}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Hourly grid */}
        <div ref={scrollRef} className="flex max-h-[68vh] min-h-[24rem] overflow-y-auto">
          {/* Time gutter */}
          <div className="w-14 shrink-0">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="relative h-14 border-b border-slate-100 dark:border-white/[0.04]">
                <span className="absolute -top-2 right-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                  {h === 0 ? "" : hourLabel(h)}
                </span>
              </div>
            ))}
          </div>

          {days.map((day) => {
            const iso = toISODateLocal(day);
            const isToday = iso === todayIso;
            const dayInterviews = interviewsByDay.get(iso) ?? [];
            const dayEngagements = engagementsByDay.byDay.get(iso) ?? [];
            const laidOutInterviews = layoutDayEvents(dayInterviews);
            const laidOutEngagements = layoutDayEvents(dayEngagements);
            const nowTop = isToday ? (minutesOfDay(zoned(now, tz)) / 1440) * DAY_PX : null;

            return (
              <div
                key={iso}
                className={`relative min-w-0 flex-1 border-l border-slate-100 dark:border-white/[0.06] ${
                  isToday ? "bg-indigo-50/40 dark:bg-indigo-500/[0.05]" : ""
                }`}
                style={{ height: DAY_PX, minWidth: multiCol ? colMinWidth : undefined }}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <div
                    key={h}
                    onDoubleClick={(e) => handleCellDoubleClick(day, h, e)}
                    className={`h-14 border-b border-slate-100 dark:border-white/[0.04] ${
                      onCreateSlot ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02]" : ""
                    }`}
                  />
                ))}

                {nowTop !== null && (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-20 flex items-center"
                    style={{ top: nowTop }}
                  >
                    <span className="-ml-1 h-2 w-2 shrink-0 rounded-full bg-red-500" />
                    <span className="h-px flex-1 bg-red-500" />
                  </div>
                )}

                {laidOutInterviews.map(({ item: iv, startMin, endMin, col, cols }) => {
                  const cand = iv.candidate_id ? candidateMap[iv.candidate_id] : undefined;
                  const candColor = cand ? getCandidateColor(cand) : "#6366f1";
                  const top = (startMin / 1440) * DAY_PX;
                  const height = Math.max(((endMin - startMin) / 1440) * DAY_PX, MIN_BLOCK_PX);
                  const widthPct = 100 / cols;
                  return (
                    <button
                      key={iv.id}
                      type="button"
                      onClick={(e) => onSelectInterview(iv, e.currentTarget.getBoundingClientRect())}
                      style={{
                        top,
                        height,
                        left: `${col * widthPct}%`,
                        width: `calc(${widthPct}% - 2px)`,
                        borderLeftColor: candColor,
                        borderLeftWidth: 3,
                      }}
                      title={`${iv.round} — ${iv.company_name ?? "Interview"}${iv.candidate_name ? ` (${iv.candidate_name})` : ""}`}
                      className="group absolute z-10 flex items-center gap-1 overflow-hidden rounded border border-slate-200/80 bg-slate-50 px-1 py-0.5 text-left text-[8px] sm:text-[10px] leading-tight text-slate-800 shadow-sm hover:border-indigo-300 hover:bg-indigo-50/80 active:bg-indigo-100/50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-100 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/15 sm:rounded-md sm:px-1.5 sm:py-1"
                    >
                      <span className="shrink-0 flex items-center">
                        {cand ? (
                          <CandidateAvatar candidate={cand} size={15} />
                        ) : (
                          <span className="flex h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[7px] sm:text-[8px] font-bold text-indigo-700 dark:text-indigo-300">
                            {getCandidateInitials(iv.candidate_name)}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {iv.round || "Interview"}
                        </span>
                        {iv.company_name && (
                          <span className="text-slate-500 dark:text-slate-400 font-normal">
                            {" · "}{iv.company_name}
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}

                {laidOutEngagements.map(({ item: eng, startMin, endMin, col, cols }) => {
                  const top = (startMin / 1440) * DAY_PX;
                  const height = Math.max(((endMin - startMin) / 1440) * DAY_PX, MIN_BLOCK_PX);
                  const widthPct = 100 / cols;
                  const isCancelled = eng.status === "cancelled";
                  const isCompleted = eng.status === "completed";
                  const isTentative = eng.show_as === "tentative" || eng.status === "tentative";
                  const isFree = eng.show_as === "free";
                  const isOof = eng.show_as === "oof";

                  const colorClass = isCancelled
                    ? "bg-slate-100 text-slate-400 line-through dark:bg-white/[0.04] dark:text-slate-500 border border-slate-200/60 dark:border-white/[0.06]"
                    : isCompleted
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
                      : isTentative
                        ? "bg-amber-50 text-amber-900 border border-dashed border-amber-300 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/40"
                        : isFree
                          ? "bg-white text-slate-700 border border-slate-300 dark:bg-transparent dark:text-slate-200 dark:border-white/20"
                          : isOof
                            ? "bg-purple-50 text-purple-800 border border-purple-300 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-500/30"
                            : "bg-violet-500 text-white dark:bg-violet-600 shadow-sm";

                  return (
                    <button
                      key={eng.id}
                      type="button"
                      onClick={() => onSelectEngagement(eng)}
                      style={{
                        top,
                        height,
                        left: `${col * widthPct}%`,
                        width: `calc(${widthPct}% - 2px)`,
                      }}
                      title={`${eng.title}${isCompleted ? " (Completed)" : ""}`}
                      className={`absolute z-10 overflow-hidden rounded-md px-1.5 py-0.5 text-left shadow-sm hover:brightness-95 transition-all ${colorClass}`}
                    >
                      <p className="flex items-center gap-1 truncate text-[10px] font-semibold">
                        {isCompleted && <Check size={10} className="shrink-0 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />}
                        <span className="truncate">{eng.title}</span>
                      </p>
                      {height > 28 && (eng.location || eng.meeting_link) && (
                        <p className={`flex items-center gap-1 truncate text-[9px] ${isCompleted ? "text-emerald-700/80 dark:text-emerald-300/80" : "opacity-80"}`}>
                          {eng.meeting_link ? <Link2 size={9} /> : <MapPin size={9} />}
                          {eng.meeting_link ? "Meeting link" : eng.location}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
