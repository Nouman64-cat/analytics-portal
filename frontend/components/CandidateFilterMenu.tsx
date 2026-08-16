"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check, Search, X } from "lucide-react";
import type { Candidate } from "@/lib/types";
import { getCandidateColor } from "@/lib/candidateColor";

interface Props {
  candidates: Candidate[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

/** Multi-select popover filter — empty `selected` means "no filter, show all". */
export default function CandidateFilterMenu({ candidates, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setQuery("");
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const sorted = useMemo(
    () => [...candidates].sort((a, b) => a.name.localeCompare(b.name)),
    [candidates],
  );

  const filtered = query.trim()
    ? sorted.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()))
    : sorted;

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-all ${
          selected.length > 0
            ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
            : "border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] text-slate-700 dark:text-slate-300"
        }`}
      >
        Candidates
        {selected.length > 0 && (
          <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
            {selected.length}
          </span>
        )}
        <ChevronDown size={14} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>

      {open && (
        <div className="absolute z-50 left-0 mt-1.5 w-64 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1a1c28] shadow-xl overflow-hidden">
          <div className="relative border-b border-slate-100 dark:border-white/[0.06] p-2">
            <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search candidates…"
              className="w-full rounded-lg border-none bg-slate-50 dark:bg-white/[0.04] pl-7 pr-2 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none"
            />
          </div>

          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-slate-400">No candidates found</p>
            ) : (
              filtered.map((c) => {
                const isSelected = selected.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
                  >
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${
                        isSelected
                          ? "border-indigo-500 bg-indigo-500"
                          : "border-slate-300 dark:border-white/20"
                      }`}
                    >
                      {isSelected && <Check size={10} className="text-white" />}
                    </span>
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: getCandidateColor(c) }}
                    />
                    <span className="flex-1 truncate text-slate-700 dark:text-slate-200">{c.name}</span>
                  </button>
                );
              })
            )}
          </div>

          {selected.length > 0 && (
            <div className="border-t border-slate-100 dark:border-white/[0.06] p-1.5">
              <button
                type="button"
                onClick={() => onChange([])}
                className="flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/[0.06]"
              >
                <X size={12} />
                Clear ({selected.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
