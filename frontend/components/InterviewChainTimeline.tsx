"use client";

import type { Interview } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import StatusBadge from "@/components/StatusBadge";
import { Link2 } from "lucide-react";

export function InterviewChainTimeline({
  chain,
  highlightId,
}: {
  chain: Interview[];
  highlightId?: string;
}) {
  if (chain.length === 0) return null;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/80 dark:bg-white/[0.02] p-4">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <Link2 size={14} className="text-indigo-500" aria-hidden />
        Round journey
      </p>
      <div className="relative space-y-0 pl-1">
        <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-indigo-400/80 via-indigo-300/60 to-indigo-400/40 dark:from-indigo-500/50 dark:via-indigo-500/30 dark:to-indigo-600/40" />
        <ul className="space-y-3">
          {chain.map((step) => {
            const active = step.id === highlightId;
            return (
              <li key={step.id} className="relative flex gap-3 pl-7">
                <span
                  className={`absolute left-0 top-2 z-[1] h-3 w-3 shrink-0 rounded-full border-2 border-white dark:border-[#12141c] ${
                    active
                      ? "bg-indigo-500 ring-2 ring-indigo-400/50"
                      : "bg-indigo-300 dark:bg-indigo-600"
                  }`}
                  aria-hidden
                />
                <div
                  className={`min-w-0 flex-1 rounded-lg border px-3 py-2.5 transition-colors ${
                    active
                      ? "border-indigo-400/70 bg-indigo-50 dark:border-indigo-500/40 dark:bg-indigo-500/10"
                      : "border-slate-200/90 bg-white dark:border-white/[0.06] dark:bg-[#151821]"
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-2 gap-y-1">
                    <span className="font-medium text-slate-900 dark:text-white">
                      {step.round}
                    </span>
                    <StatusBadge status={step.computed_status} />
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {step.interview_date
                        ? formatDate(step.interview_date)
                        : "Date TBD"}
                    </span>
                  </div>
                  {step.company_name && (
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-500">
                      {step.company_name} · {step.role}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
