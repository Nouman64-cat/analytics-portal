"use client";

import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  trend?: string;
  gradient: string;
  onClick?: () => void;
}

export default function StatsCard({
  title,
  value,
  icon: Icon,
  trend,
  gradient,
  onClick,
}: StatsCardProps) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`group relative min-w-0 w-full overflow-hidden rounded-[26px] border border-white/60 dark:border-white/[0.08] bg-white/40 dark:bg-white/[0.12] backdrop-blur-3xl p-4 text-left transition-all duration-200 shadow-[0_2px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.3)] ${onClick ? "cursor-pointer hover:bg-white/75 dark:hover:bg-white/[0.07]" : ""}`}
    >
      <div className="relative pr-12">
        <div
          className={`absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm ${gradient}`}
        >
          <Icon size={18} />
        </div>

        <p className="truncate text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400 leading-none">
          {title}
        </p>
        <p className="mt-1.5 text-[1.55rem] font-semibold leading-tight text-slate-900 dark:text-white sm:text-[1.7rem]">
          {value}
        </p>
        {trend && (
          <p className="mt-1 text-[10px] text-emerald-600 dark:text-emerald-400">
            {trend}
          </p>
        )}
      </div>
    </Tag>
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
    <div className={`grid grid-cols-1 gap-2 sm:gap-3 ${STATS_GRID_COLS[cols]}`}>
      {children}
    </div>
  );
}
