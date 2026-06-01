"use client";

import { useState, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from "react";
import { ChevronDown, Plus, Loader2, Check } from "lucide-react";
import { Company } from "@/lib/types";
import { companiesService } from "@/lib/services";
import { inputClass } from "@/components/Modal";

interface Props {
  companies: Company[];
  value: string;
  onChange: (id: string) => void;
  onCompanyCreated: (company: Company) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export interface CompanyComboboxHandle {
  createIfNeeded(): Promise<string | null>;
}

const CompanyCombobox = forwardRef<CompanyComboboxHandle, Props>(function CompanyCombobox({
  companies,
  value,
  onChange,
  onCompanyCreated,
  placeholder = "Select or type company…",
  disabled = false,
  className,
}: Props, ref) {
  const selected = companies.find((c) => c.id === value);
  const [query, setQuery] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setQuery(selected?.name ?? "");
  }, [value, selected?.name, open]);

  // Reset highlight when filtered list changes
  useEffect(() => { setActiveIndex(-1); }, [query]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current || activeIndex < 0) return;
    const item = listRef.current.querySelectorAll<HTMLElement>("[data-item]")[activeIndex];
    item?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selected?.name ?? "");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [selected?.name]);

  const trimmed = query.trim();
  const filtered = trimmed
    ? companies.filter((c) => c.name.toLowerCase().includes(trimmed.toLowerCase()))
    : companies;
  const exactMatch = companies.some((c) => c.name.toLowerCase() === trimmed.toLowerCase());
  const showCreate = trimmed.length > 0 && !exactMatch;

  // Index of the "Create" row (always last when visible)
  const createIndex = filtered.length;

  const handleCreate = useCallback(async (): Promise<string | null> => {
    if (!trimmed) return null;
    setCreating(true);
    try {
      const newCompany = await companiesService.create({ name: trimmed, is_staffing_firm: false });
      onCompanyCreated(newCompany);
      onChange(newCompany.id);
      setQuery(newCompany.name);
      setOpen(false);
      return newCompany.id;
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create company");
      return null;
    } finally {
      setCreating(false);
    }
  }, [trimmed, onChange, onCompanyCreated]);

  useImperativeHandle(ref, () => ({
    createIfNeeded: async () => {
      if (value) return value;
      const match = companies.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
      if (match) { onChange(match.id); setQuery(match.name); return match.id; }
      if (trimmed) return handleCreate();
      return null;
    },
  }), [value, trimmed, companies, handleCreate, onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(0);
      }
      return;
    }
    const total = filtered.length + (showCreate ? 1 : 0);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, total - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < filtered.length) {
        onChange(filtered[activeIndex].id);
        setQuery(filtered[activeIndex].name);
        setOpen(false);
      } else if (showCreate && activeIndex === createIndex) {
        void handleCreate();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery(selected?.name ?? "");
    } else if (e.key === "Tab") {
      setOpen(false);
      setQuery(selected?.name ?? "");
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div className="relative">
        <input
          type="text"
          value={open ? query : (selected?.name ?? "")}
          placeholder={placeholder}
          disabled={disabled || creating}
          className={`${inputClass} pr-8`}
          onFocus={() => { setQuery(selected?.name ?? ""); setOpen(true); }}
          onChange={(e) => { setQuery(e.target.value); if (!open) setOpen(true); }}
          onKeyDown={handleKeyDown}
          aria-expanded={open}
          aria-autocomplete="list"
          role="combobox"
        />
        <ChevronDown
          size={14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
      </div>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-[#1a1c28] border border-slate-200 dark:border-white/[0.08] rounded-xl shadow-xl overflow-hidden">
          <div ref={listRef} className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && !showCreate && (
              <p className="px-3 py-2.5 text-sm text-slate-400">No companies found</p>
            )}
            {filtered.map((c, idx) => (
              <button
                key={c.id}
                type="button"
                data-item
                onMouseDown={() => { onChange(c.id); setQuery(c.name); setOpen(false); }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 transition-colors ${
                  idx === activeIndex
                    ? "bg-indigo-500/10 dark:bg-indigo-500/20"
                    : "hover:bg-slate-50 dark:hover:bg-white/[0.06]"
                }`}
              >
                <span className="w-4 shrink-0 flex items-center justify-center">
                  {value === c.id && <Check size={13} className="text-indigo-500" />}
                </span>
                <span className="flex-1 truncate">{c.name}</span>
                {c.is_staffing_firm && (
                  <span className="text-[10px] text-slate-400 shrink-0">Agency</span>
                )}
              </button>
            ))}
          </div>

          {showCreate && (
            <button
              type="button"
              data-item
              onMouseDown={handleCreate}
              onMouseEnter={() => setActiveIndex(createIndex)}
              disabled={creating}
              className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 border-t border-slate-100 dark:border-white/[0.06] transition-colors disabled:opacity-60 ${
                activeIndex === createIndex
                  ? "bg-indigo-50 dark:bg-indigo-500/[0.12]"
                  : "hover:bg-indigo-50 dark:hover:bg-indigo-500/[0.08]"
              }`}
            >
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Create &ldquo;{trimmed}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default CompanyCombobox;
