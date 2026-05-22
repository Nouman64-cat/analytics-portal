"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { inputClass } from "@/components/Modal";

interface Props {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export default function TypeableSelect({
  options,
  value,
  onChange,
  placeholder = "Type or select…",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

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
    ? options.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : options;

  const handleSelect = (val: string) => {
    onChange(val);
    setQuery(val);
    setOpen(false);
  };

  const handleInputChange = (val: string) => {
    setQuery(val);
    onChange(val);
    if (!open) setOpen(true);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={query}
          placeholder={placeholder}
          className={`${inputClass} pr-8`}
          onFocus={() => setOpen(true)}
          onChange={(e) => handleInputChange(e.target.value)}
        />
        <ChevronDown
          size={16}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-lg">
          {filtered.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleSelect(option)}
              className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
                query === option
                  ? "bg-indigo-500 text-white"
                  : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.05]"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
