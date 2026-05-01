"use client";

import { useMemo, useState, useEffect } from "react";
import { Clock } from "lucide-react";

interface DayInterview {
  id: string;
  company: string | null;
  candidate: string | null;
  role: string;
  round: string;
  time_est: string | null;
  bd_name: string | null;
}

interface DayInterviews {
  date: string;
  count: number;
  interviews: DayInterview[];
}

interface HeatmapCalendarProps {
  days: DayInterviews[];
  onDayClick?: (date: string, count: number) => void;
}

const CELL_SIZE = 20;
const CELL_GAP = 4;

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getYearData(days: DayInterviews[]) {
  const dayMap = new Map();
  days.forEach(d => dayMap.set(d.date, d));
  const currentYear = new Date().getFullYear();

  const months: { month: string; days: { date: string; count: number; interviews: DayInterview[]; isWeekend: boolean }[] }[] = [];

  for (let month = 0; month < 12; month++) {
    const daysInMonth = new Date(currentYear, month + 1, 0).getDate();
    const monthDays: { date: string; count: number; interviews: DayInterview[]; isWeekend: boolean }[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const monthStr = String(month + 1).padStart(2, "0");
      const dayStr = String(day).padStart(2, "0");
      const dateStr = `${currentYear}-${monthStr}-${dayStr}`;
      const dayData = dayMap.get(dateStr);
      const count = dayData ? dayData.count : 0;
      const interviews = dayData && dayData.interviews ? dayData.interviews : [];
      
      const dateObj = new Date(currentYear, month, day);
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      monthDays.push({
        date: dateStr,
        count: count,
        interviews: interviews,
        isWeekend: isWeekend,
      });
    }

    months.push({ month: MONTH_LABELS[month], days: monthDays });
  }

  return months;
}

function getColor(count: number, isWeekend: boolean): string {
  if (isWeekend) {
    if (count === 0) return "bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700";
    if (count === 1) return "bg-emerald-200 dark:bg-emerald-800";
    if (count === 2) return "bg-emerald-300 dark:bg-emerald-700";
    if (count === 3) return "bg-emerald-400 dark:bg-emerald-600";
    return "bg-emerald-500 dark:bg-emerald-500";
  }
  if (count === 0) return "bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600";
  if (count === 1) return "bg-emerald-300 dark:bg-emerald-700";
  if (count === 2) return "bg-emerald-400 dark:bg-emerald-500";
  if (count === 3) return "bg-emerald-500 dark:bg-emerald-400";
  return "bg-emerald-600 dark:bg-emerald-300";
}

export default function HeatmapCalendar({ days, onDayClick }: HeatmapCalendarProps) {
  const [selectedDay, setSelectedDay] = useState<{
    x: number;
    y: number;
    date: string;
    count: number;
    interviews: DayInterview[];
  } | null>(null);

  const months = useMemo(() => getYearData(days), [days]);
  const totalInterviews = useMemo(() => days.reduce((sum, d) => sum + d.count, 0), [days]);
  const currentYear = new Date().getFullYear();
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (selectedDay && !(e.target as Element).closest('.interview-popup')) {
        setSelectedDay(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [selectedDay]);

  return (
    <div className="relative">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">
            {totalInterviews} interviews in {currentYear}
          </span>
          <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
            <span className="w-3 h-3 rounded-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"></span>
            <span>Weekend</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>Less</span>
          <div className="w-4 h-4 rounded-sm bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600" />
          <div className="w-4 h-4 rounded-sm bg-emerald-300 dark:bg-emerald-700" />
          <div className="w-4 h-4 rounded-sm bg-emerald-400 dark:bg-emerald-500" />
          <div className="w-4 h-4 rounded-sm bg-emerald-500 dark:bg-emerald-400" />
          <div className="w-4 h-4 rounded-sm bg-emerald-600 dark:bg-emerald-300" />
          <span>More</span>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="min-w-fit">
          <div className="flex">
            <div className="flex flex-col pr-3 pt-1 justify-between" style={{ height: 12 * (CELL_SIZE + CELL_GAP) }}>
              {months.map((m, i) => (
                <div
                  key={i}
                  className="text-xs text-slate-400 dark:text-slate-500 font-medium"
                  style={{ height: CELL_SIZE + CELL_GAP }}
                >
                  {m.month}
                </div>
              ))}
            </div>

            <div className="flex flex-col" style={{ gap: CELL_GAP }}>
              {months.map((month, monthIndex) => (
                <div
                  key={monthIndex}
                  className="flex"
                  style={{ gap: CELL_GAP }}
                >
                  {month.days.map((day, dayIndex) => {
                    const isToday = day.date === today;
                    const isSelected = selectedDay?.date === day.date;
                    const isWeekend = day.isWeekend;

                    return (
                      <div
                        key={dayIndex}
                        className={`w-[20px] h-[20px] rounded-[2px] transition-all cursor-pointer hover:scale-110 ${getColor(day.count, isWeekend)} ${
                          isToday ? "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-0" : ""
                        } ${isSelected ? "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-0" : ""}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (day.count > 0) {
                            setSelectedDay({
                              x: e.clientX,
                              y: e.clientY,
                              date: day.date,
                              count: day.count,
                              interviews: day.interviews || [],
                            });
                          }
                        }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {selectedDay && (
        <div
          className="fixed z-50 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden interview-popup"
          style={{
            left: Math.min(selectedDay.x + 10, window.innerWidth - 360),
            top: Math.min(selectedDay.y + 10, window.innerHeight - 420),
            width: 340,
            maxHeight: 400,
          }}
        >
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-700 border-b border-slate-200 dark:border-slate-600 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {new Date(selectedDay.date).toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {selectedDay.count} interview{selectedDay.count !== 1 ? "s" : ""}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedDay(null);
              }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xl leading-none"
            >
              ×
            </button>
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {(selectedDay.interviews && selectedDay.interviews.length > 0) ? (
              selectedDay.interviews.map((iv, i) => (
                <div
                  key={iv.id}
                  className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 last:border-b-0 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                >
                  <div className="text-sm font-medium text-slate-900 dark:text-white">
                    {iv.company || "—"}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {iv.candidate || "—"} · {iv.role}
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Round {iv.round}
                    {iv.time_est && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <Clock size={10} />
                        {iv.time_est}
                      </span>
                    )}
                    {iv.bd_name && <span className="ml-2 text-indigo-500">{iv.bd_name}</span>}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                No interviews
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}