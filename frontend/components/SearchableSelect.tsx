"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) { setQuery(""); setActiveIndex(-1); }
  }, [open]);

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
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
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

  // Virtual flat list: optional "None" at index 0, then filtered items
  const allItems: { id: string; label: string; sublabel?: string }[] = [
    ...(optional ? [{ id: "", label: "None" }] : []),
    ...filtered,
  ];

  const commit = useCallback((id: string) => {
    onChange(id);
    setOpen(false);
  }, [onChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(0);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIndex >= 0 && activeIndex < allItems.length) {
        commit(allItems[activeIndex].id);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
    // Tab: let browser handle focus movement, just close
    else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div className="relative">
        <input
          type="text"
          value={open ? query : (selected?.label ?? "")}
          placeholder={placeholder}
          disabled={disabled}
          required={required && !value}
          className={`${inputClass} pr-8`}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
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
            {allItems.length === 0 ? (
              <p className="px-3 py-2.5 text-sm text-slate-400">{emptyPlaceholder}</p>
            ) : (
              allItems.map((o, idx) => (
                <button
                  key={o.id + idx}
                  type="button"
                  data-item
                  onMouseDown={() => commit(o.id)}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    idx === activeIndex
                      ? "bg-indigo-500/10 dark:bg-indigo-500/20"
                      : "hover:bg-slate-50 dark:hover:bg-white/[0.06]"
                  } ${o.id === "" ? "text-slate-400 dark:text-slate-500 italic" : "text-slate-700 dark:text-slate-200"}`}
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
