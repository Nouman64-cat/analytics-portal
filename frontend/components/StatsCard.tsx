"use client";

import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  trend?: string;
  gradient: string;
}

export default function StatsCard({ title, value, icon: Icon, trend, gradient }: StatsCardProps) {
  return (
    <div className="group relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-4 transition-all duration-300 hover:border-slate-300 dark:hover:border-white/[0.1] hover:shadow-lg hover:shadow-black/20 sm:p-5">
      {/* Background glow */}
      <div
        className={`absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-20 blur-2xl transition-all duration-500 group-hover:opacity-30 ${gradient}`}
      />

      <div className="relative flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400 sm:text-xs">
            {title}
          </p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900 dark:text-white sm:mt-2 sm:text-3xl">
            {value}
          </p>
          {trend && (
            <p className="mt-1 text-xs text-emerald-400">{trend}</p>
          )}
        </div>
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10 ${gradient} bg-opacity-10`}
        >
          <Icon size={20} className="text-slate-900 dark:text-white/80" />
        </div>
      </div>
    </div>
  );
}

// ─── Wrapper for Stats Row ──────────────────────────────────

interface StatsGridProps {
  children: ReactNode;
  cols?: 3 | 4 | 5 | 6 | 7;
}

/** Progressive columns so cards don’t squeeze into one tiny row on laptop-sized viewports. */
const STATS_GRID_COLS: Record<3 | 4 | 5 | 6 | 7, string> = {
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
  6: "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6",
  7: "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7",
};

export function StatsGrid({ children, cols = 4 }: StatsGridProps) {
  return (
    <div
      className={`grid grid-cols-1 gap-3 sm:gap-4 ${STATS_GRID_COLS[cols]}`}
    >
      {children}
    </div>
  );
}
