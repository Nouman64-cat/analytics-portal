"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";
import { inputClass } from "@/components/Modal";

interface Option {
  id: string;
  label: string;
  sublabel?: string;
}

interface Props {
  options: Option[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  emptyPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  required?: boolean;
  /** If true, the empty-value option is included (optional field) */
  optional?: boolean;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  emptyPlaceholder = "No results",
  disabled = false,
  className,
  required = false,
  optional = false,
}: Props) {
  const selected = options.find((o) => o.id === value);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = query.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.toLowerCase()) ||
          (o.sublabel?.toLowerCase().includes(query.toLowerCase()) ?? false),
      )
    : options;

  const displayText = open ? query : (selected?.label ?? "");

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div className="relative">
        <input
          type="text"
          value={displayText}
          placeholder={placeholder}
          disabled={disabled}
          required={required && !value}
          className={`${inputClass} pr-8`}
          onFocus={() => setOpen(true)}
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
            {optional && (
              <button
                type="button"
                onMouseDown={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
              >
                <span className="w-4 shrink-0 flex items-center justify-center">
                  {!value && <Check size={13} className="text-indigo-500" />}
                </span>
                <span className="italic">None</span>
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-slate-400">{emptyPlaceholder}</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onMouseDown={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors"
                >
                  <span className="w-4 shrink-0 flex items-center justify-center">
                    {value === o.id && <Check size={13} className="text-indigo-500" />}
                  </span>
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.sublabel && (
                    <span className="text-[10px] text-slate-400 shrink-0">{o.sublabel}</span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
