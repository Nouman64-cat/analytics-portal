"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

const SIZE_MAP = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export default function Modal({ open, onClose, title, children, size = "md" }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className={`relative flex max-h-[min(92dvh,calc(100vh-1.5rem))] w-full flex-col ${SIZE_MAP[size]} overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#14161f] shadow-2xl shadow-black/50 animate-in zoom-in-95 duration-200`}
      >
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200 dark:border-white/[0.06] px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="min-w-0 flex-1 text-sm font-semibold leading-snug text-slate-900 dark:text-white sm:text-base">
            <span className="line-clamp-3">{title}</span>
          </h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Form helpers ───────────────────────────────────────────

export function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wider">
        {label}
      </label>
      {children}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-500 outline-none transition-all focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20";

export const selectClass =
  "w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none transition-all focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 appearance-none";

export const textareaClass =
  "w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white placeholder-slate-500 outline-none transition-all focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 resize-none";

export const buttonPrimary =
  "inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 transition-all hover:shadow-xl hover:shadow-indigo-500/30 hover:brightness-110 active:scale-[0.98]";

export const buttonSecondary =
  "inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 transition-all hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white";

export const buttonDanger =
  "inline-flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-2.5 text-sm font-medium text-red-400 transition-all hover:bg-red-500/20";
