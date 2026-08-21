"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getCalendarDays, toISODateLocal, type CalendarGridView } from "@/components/TimeGridCalendar";

const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

function getMonthGrid(year: number, month: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  // (getDay + 6) % 7 maps Monday to 0, Tuesday to 1 ... Sunday to 6
  const startPad = (first.getDay() + 6) % 7;
  const dim = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

interface CalendarSidebarProps {
  cursorDate: Date;
  view: CalendarGridView;
  onNavigate: (date: Date) => void;
  showInterviews: boolean;
  onToggleInterviews: (v: boolean) => void;
  showEngagements: boolean;
  onToggleEngagements: (v: boolean) => void;
}

export default function CalendarSidebar({
  cursorDate,
  view,
  onNavigate,
  showInterviews,
  onToggleInterviews,
  showEngagements,
  onToggleEngagements,
}: CalendarSidebarProps) {
  const [miniMonth, setMiniMonth] = useState(
    () => new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1),
  );

  // Follow the main grid when it jumps to a different month (e.g. "Today", or paging past a
  // month boundary) without fighting the user's own prev/next clicks on the mini calendar.
  useEffect(() => {
    setMiniMonth(new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorDate.getFullYear(), cursorDate.getMonth()]);

  const grid = useMemo(
    () => getMonthGrid(miniMonth.getFullYear(), miniMonth.getMonth()),
    [miniMonth],
  );
  const todayIso = useMemo(() => toISODateLocal(new Date()), []);
  const selectedIso = toISODateLocal(cursorDate);
  const visibleIsoSet = useMemo(
    () => new Set(getCalendarDays(view, cursorDate).map(toISODateLocal)),
    [view, cursorDate],
  );

  return (
    <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-white/[0.08] dark:bg-[#12141c] lg:w-60">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {miniMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setMiniMonth(new Date(miniMonth.getFullYear(), miniMonth.getMonth() - 1, 1))}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06]"
            aria-label="Previous month"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => setMiniMonth(new Date(miniMonth.getFullYear(), miniMonth.getMonth() + 1, 1))}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06]"
            aria-label="Next month"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-7 place-items-center">
        {WEEKDAY_LETTERS.map((l, i) => (
          <span key={i} className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
            {l}
          </span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 place-items-center gap-y-1">
        {grid.map((day, i) => {
          if (!day) return <span key={i} />;
          const iso = toISODateLocal(day);
          const isSelected = iso === selectedIso;
          const isToday = iso === todayIso;
          const inRange = visibleIsoSet.has(iso);
          return (
            <button
              key={i}
              type="button"
              onClick={() => onNavigate(day)}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${
                isSelected
                  ? "bg-indigo-600 text-white"
                  : inRange
                    ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200"
                    : isToday
                      ? "font-bold text-indigo-600 dark:text-indigo-400"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]"
              }`}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-5 space-y-1.5 border-t border-slate-100 pt-4 dark:border-white/[0.06]">
        <p className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          My calendars
        </p>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/[0.04]">
          <input
            type="checkbox"
            checked={showInterviews}
            onChange={(e) => onToggleInterviews(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-500" />
          Interviews
        </label>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1 py-1 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/[0.04]">
          <input
            type="checkbox"
            checked={showEngagements}
            onChange={(e) => onToggleEngagements(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
          />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500" />
          Meetings
        </label>
      </div>
    </aside>
  );
}
