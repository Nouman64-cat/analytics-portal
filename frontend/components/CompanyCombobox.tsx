"use client";

import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
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
  /** If the user typed a new company name without clicking Create, creates it and returns its id. Returns existing id if already selected, null if input is empty. */
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
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync displayed text when selected company changes externally
  useEffect(() => {
    if (!open) setQuery(selected?.name ?? "");
  }, [value, selected?.name, open]);

  // Close on outside click, restoring displayed name
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
  const exactMatch = companies.some(
    (c) => c.name.toLowerCase() === trimmed.toLowerCase()
  );
  const showCreate = trimmed.length > 0 && !exactMatch;

  const handleCreate = async (): Promise<string | null> => {
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
  };

  useImperativeHandle(ref, () => ({
    createIfNeeded: async () => {
      if (value) return value;
      const match = companies.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
      if (match) {
        onChange(match.id);
        setQuery(match.name);
        return match.id;
      }
      if (trimmed) return handleCreate();
      return null;
    },
  }), [value, trimmed, companies]);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div className="relative">
        <input
          type="text"
          value={open ? query : (selected?.name ?? "")}
          placeholder={placeholder}
          disabled={disabled || creating}
          className={`${inputClass} pr-8`}
          onFocus={() => {
            setQuery(selected?.name ?? "");
            setOpen(true);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
        />
        <ChevronDown
          size={14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
      </div>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-[#1a1c28] border border-slate-200 dark:border-white/[0.08] rounded-xl shadow-xl overflow-hidden">
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 && !showCreate && (
              <p className="px-3 py-2.5 text-sm text-slate-400">No companies found</p>
            )}
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={() => {
                  onChange(c.id);
                  setQuery(c.name);
                  setOpen(false);
                }}
                className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
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
              onMouseDown={handleCreate}
              disabled={creating}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/[0.08] border-t border-slate-100 dark:border-white/[0.06] transition-colors disabled:opacity-60"
            >
              {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Create "{trimmed}"
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default CompanyCombobox;
