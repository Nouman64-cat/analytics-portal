"use client";

import { useState, useEffect, useRef } from "react";
import { MapPin, Loader2 } from "lucide-react";

interface GeoResult {
  id: number;
  name: string;
  country: string;
  admin1?: string; // state/region
  latitude: number;
  longitude: number;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export default function LocationAutocomplete({
  value,
  onChange,
  className = "",
  placeholder = "e.g., Karachi, Pakistan",
}: Props) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<GeoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Sync external value if parent resets it
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = (q: string) => {
    abortRef.current?.abort();
    if (!q.trim() || q.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    setOpen(true);
    fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q.trim())}&count=8&language=en&format=json`,
      { signal: ctrl.signal },
    )
      .then((r) => r.json())
      .then((data) => {
        if (!ctrl.signal.aborted) {
          setResults(data.results ?? []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    setActiveIndex(-1);
    // Don't call onChange yet — only call it when user picks or blurs
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 300);
  };

  const select = (r: GeoResult) => {
    const label = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
    setQuery(label);
    onChange(label);
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      select(results[activeIndex]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleBlur = () => {
    // Commit whatever is in the box to the parent on blur
    // (gives user freedom to type freeform too)
    setTimeout(() => {
      onChange(query);
    }, 150);
  };

  return (
    <div ref={containerRef} className="relative">
      <MapPin
        size={14}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-400 pointer-events-none z-10"
      />
      <input
        type="text"
        value={query}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        className={`${className} pl-8 pr-8`}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {loading && (
        <Loader2
          size={13}
          className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400"
        />
      )}

      {open && (results.length > 0 || loading) && (
        <ul
          role="listbox"
          className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1a1d2a] shadow-xl overflow-hidden"
        >
          {loading && results.length === 0 && (
            <li className="px-3 py-2.5 text-xs text-slate-400 flex items-center gap-2">
              <Loader2 size={12} className="animate-spin" />
              Searching…
            </li>
          )}
          {results.map((r, i) => {
            const label = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
            return (
              <li
                key={r.id}
                role="option"
                aria-selected={i === activeIndex}
                onMouseDown={() => select(r)}
                onMouseEnter={() => setActiveIndex(i)}
                className={`flex items-center gap-2.5 px-3 py-2.5 cursor-pointer text-sm transition-colors ${
                  i === activeIndex
                    ? "bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-300"
                    : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                } ${i !== 0 ? "border-t border-slate-100 dark:border-white/[0.04]" : ""}`}
              >
                <MapPin
                  size={12}
                  className={`shrink-0 ${i === activeIndex ? "text-rose-500" : "text-slate-400 dark:text-slate-500"}`}
                />
                <span className="truncate">{label}</span>
              </li>
            );
          })}
          {!loading && results.length === 0 && (
            <li className="px-3 py-2.5 text-xs text-slate-400">No locations found</li>
          )}
        </ul>
      )}
    </div>
  );
}
