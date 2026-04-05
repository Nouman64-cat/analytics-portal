"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Interview } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

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

export default function InterviewsCalendar({
  interviews,
  onSelectInterview,
}: {
  interviews: Interview[];
  onSelectInterview: (interview: Interview) => void;
}) {
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

  const undated = useMemo(
    () => interviews.filter((i) => !i.interview_date),
    [interviews],
  );

  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));
  const goToday = () => {
    const n = new Date();
    setCursor(new Date(n.getFullYear(), n.getMonth(), 1));
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={goPrev}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/[0.1] dark:bg-[#12141c] dark:text-slate-200 dark:hover:bg-white/[0.04]"
            aria-label="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <h2 className="min-w-[12rem] text-center text-lg font-semibold text-slate-900 dark:text-white">
            {label}
          </h2>
          <button
            type="button"
            onClick={goNext}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/[0.1] dark:bg-[#12141c] dark:text-slate-200 dark:hover:bg-white/[0.04]"
            aria-label="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <button
          type="button"
          onClick={goToday}
          className="inline-flex items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20"
        >
          Today
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-white/[0.08] dark:bg-[#12141c]">
        <div
          className="grid min-w-[720px] grid-cols-7 border-b border-slate-200 dark:border-white/[0.06]"
          role="row"
        >
          {WEEKDAYS.map((wd) => (
            <div
              key={wd}
              className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            >
              {wd}
            </div>
          ))}
        </div>
        <div className="grid min-w-[720px] grid-cols-7">
          {grid.map((day, idx) => {
            if (!day) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="min-h-[7.5rem] border-b border-r border-slate-100 bg-slate-50/50 dark:border-white/[0.04] dark:bg-white/[0.01] last:border-r-0"
                />
              );
            }
            const iso = toISODate(day);
            const dayInterviews = byDate.get(iso) ?? [];
            const isToday = iso === todayIso;
            const MAX = 3;
            const visible = dayInterviews.slice(0, MAX);
            const rest = dayInterviews.length - visible.length;

            return (
              <div
                key={iso}
                className={`min-h-[7.5rem] border-b border-r border-slate-100 p-1.5 dark:border-white/[0.06] last:border-r-0 ${
                  isToday
                    ? "bg-indigo-50/80 dark:bg-indigo-500/10"
                    : "bg-white dark:bg-[#12141c]"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span
                    className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md text-xs font-medium ${
                      isToday
                        ? "bg-indigo-600 text-white dark:bg-indigo-500"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </div>
                <ul className="space-y-1">
                  {visible.map((inv) => (
                    <li key={inv.id}>
                      <button
                        type="button"
                        onClick={() => onSelectInterview(inv)}
                        className="w-full rounded-md border border-slate-200/80 bg-slate-50 px-1.5 py-0.5 text-left text-[10px] leading-tight text-slate-800 shadow-sm hover:border-indigo-300 hover:bg-indigo-50/80 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-100 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/15"
                      >
                        <span className="line-clamp-1 font-medium">
                          {inv.time_est
                            ? formatTime(inv.time_est)
                            : "—"}{" "}
                          <span className="text-slate-600 dark:text-slate-300">
                            {inv.company_name || "Company"}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                {rest > 0 && (
                  <p className="mt-1 px-0.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                    +{rest} more
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {undated.length > 0 && (
        <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            No interview date ({undated.length})
          </h3>
          <p className="mt-1 text-xs text-amber-800/90 dark:text-amber-200/80">
            These rows have no scheduled date yet. Open the interviews list to
            add or edit dates.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {undated.map((inv) => (
              <li key={inv.id}>
                <button
                  type="button"
                  onClick={() => onSelectInterview(inv)}
                  className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-50 dark:border-amber-500/30 dark:bg-[#1a1d2a] dark:text-amber-50 dark:hover:bg-amber-500/10"
                >
                  <span className="line-clamp-1 max-w-[12rem]">
                    {inv.candidate_name} · {inv.company_name}
                  </span>
                  <StatusBadge status={inv.computed_status} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
