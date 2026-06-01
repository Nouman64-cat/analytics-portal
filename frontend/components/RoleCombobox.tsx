"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Plus, Loader2, Check } from "lucide-react";
import type { JobRole } from "@/lib/types";
import { jobRolesService } from "@/lib/services";
import { inputClass } from "@/components/Modal";

interface Props {
  roles: JobRole[];
  value: string;
  onChange: (name: string) => void;
  onRoleCreated: (role: JobRole) => void;
  placeholder?: string;
  required?: boolean;
}

export default function RoleCombobox({
  roles,
  value,
  onChange,
  onRoleCreated,
  placeholder = "Type or select role…",
  required,
}: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) setQuery(value);
  }, [value, open]);

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
        setQuery(value);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [value]);

  const trimmed = query.trim();
  const filtered = trimmed
    ? roles.filter((r) => r.name.toLowerCase().includes(trimmed.toLowerCase()))
    : roles;
  const exactMatch = roles.some((r) => r.name.toLowerCase() === trimmed.toLowerCase());
  const showCreate = trimmed.length > 0 && !exactMatch;

  const createIndex = filtered.length;

  const handleCreate = useCallback(async () => {
    if (!trimmed) return;
    setCreating(true);
    try {
      const created = await jobRolesService.create(trimmed);
      onRoleCreated(created);
      onChange(created.name);
      setQuery(created.name);
      setOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create role");
    } finally {
      setCreating(false);
    }
  }, [trimmed, onChange, onRoleCreated]);

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
        onChange(filtered[activeIndex].name);
        setQuery(filtered[activeIndex].name);
        setOpen(false);
      } else if (showCreate && activeIndex === createIndex) {
        void handleCreate();
      } else if (trimmed) {
        // Confirm typed value as-is (no save to DB)
        onChange(trimmed);
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery(value);
    } else if (e.key === "Tab") {
      setOpen(false);
      setQuery(value);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={open ? query : value}
          placeholder={placeholder}
          required={required}
          disabled={creating}
          className={`${inputClass} pr-8`}
          onFocus={() => { setQuery(value); setOpen(true); }}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
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
            {filtered.length === 0 && !showCreate && (
              <p className="px-3 py-2.5 text-sm text-slate-400">No roles found</p>
            )}
            {filtered.map((r, idx) => (
              <button
                key={r.id}
                type="button"
                data-item
                onMouseDown={() => { onChange(r.name); setQuery(r.name); setOpen(false); }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 transition-colors ${
                  idx === activeIndex
                    ? "bg-indigo-500/10 dark:bg-indigo-500/20"
                    : "hover:bg-slate-50 dark:hover:bg-white/[0.06]"
                }`}
              >
                <span className="w-4 shrink-0 flex items-center justify-center">
                  {value === r.name && <Check size={13} className="text-indigo-500" />}
                </span>
                <span className="flex-1 truncate">{r.name}</span>
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
              Save &amp; use &ldquo;{trimmed}&rdquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
