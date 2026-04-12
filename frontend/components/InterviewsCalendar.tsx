"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Interview } from "@/lib/types";
import { formatDate, formatTime } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";
import Modal from "@/components/Modal";

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

  const smUp = useMinWidthSm();
  const maxPerDay = smUp ? 3 : 2;

  /** Full-day list when "+N more" is used */
  const [dayListModal, setDayListModal] = useState<{
    date: Date;
    interviews: Interview[];
  } | null>(null);

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
        <button
          type="button"
          onClick={goToday}
          className="inline-flex w-full items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20 sm:w-auto"
        >
          Today
        </button>
      </div>

      <p className="text-center text-[11px] text-slate-500 dark:text-slate-400 sm:text-left">
        <span className="font-medium text-slate-600 dark:text-slate-300">
          Times shown in Eastern (EST/ET)
        </span>{" "}
        — same as the EST column. Day cells use each row&apos;s interview date
        (aligned with Date (EST) on the list); within a day, entries sort by EST
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
            const isToday = iso === todayIso;
            const visible = dayInterviews.slice(0, maxPerDay);
            const rest = dayInterviews.length - visible.length;

            return (
              <div
                key={iso}
                className={`min-h-[4.5rem] border-b border-r border-slate-100 p-0.5 sm:min-h-[7.5rem] sm:p-1.5 dark:border-white/[0.06] last:border-r-0 ${
                  isToday
                    ? "bg-indigo-50/80 dark:bg-indigo-500/10"
                    : "bg-white dark:bg-[#12141c]"
                }`}
              >
                <div className="mb-0.5 flex items-center justify-between gap-0.5 sm:mb-1">
                  <span
                    className={`inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded px-0.5 text-[10px] font-medium sm:h-6 sm:min-w-[1.5rem] sm:text-xs ${
                      isToday
                        ? "bg-indigo-600 text-white dark:bg-indigo-500"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    {day.getDate()}
                  </span>
                </div>
                <ul className="space-y-0.5 sm:space-y-1">
                  {visible.map((inv) => (
                    <li key={inv.id}>
                      <button
                        type="button"
                        onClick={() => onSelectInterview(inv)}
                        className="w-full rounded border border-slate-200/80 bg-slate-50 px-0.5 py-px text-left text-[8px] leading-tight text-slate-800 shadow-sm hover:border-indigo-300 hover:bg-indigo-50/80 active:bg-indigo-100/50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-100 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/15 sm:rounded-md sm:px-1.5 sm:py-0.5 sm:text-[10px]"
                      >
                        <span className="line-clamp-2 break-words sm:line-clamp-1">
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
                  <button
                    type="button"
                    onClick={() =>
                      setDayListModal({ date: day, interviews: dayInterviews })
                    }
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
              {dayListModal.interviews.map((inv) => (
                <li key={inv.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectInterview(inv);
                      setDayListModal(null);
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm text-slate-900 shadow-sm transition-colors hover:border-indigo-300 hover:bg-indigo-50/80 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-100 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-500/15"
                  >
                    <div className="font-medium text-slate-900 dark:text-white">
                      {inv.time_est ? formatTime(inv.time_est) : "—"}{" "}
                      <span className="font-normal text-slate-600 dark:text-slate-300">
                        {inv.company_name || "Company"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {inv.candidate_name || "Candidate"} · {inv.role || "—"}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
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
            {undated.map((inv) => (
              <li key={inv.id} className="min-w-0 sm:max-w-none">
                <button
                  type="button"
                  onClick={() => onSelectInterview(inv)}
                  className="flex w-full max-w-full flex-col items-stretch gap-1.5 rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-left text-xs font-medium text-amber-950 hover:bg-amber-50 sm:inline-flex sm:w-auto sm:flex-row sm:items-center sm:gap-2 dark:border-amber-500/30 dark:bg-[#1a1d2a] dark:text-amber-50 dark:hover:bg-amber-500/10"
                >
                  <span className="line-clamp-2 min-w-0 break-words sm:line-clamp-1 sm:max-w-[12rem]">
                    {inv.candidate_name} · {inv.company_name}
                  </span>
                  <span className="shrink-0 self-start sm:self-center">
                    <StatusBadge status={inv.computed_status} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
