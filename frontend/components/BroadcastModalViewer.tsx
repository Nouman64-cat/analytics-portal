"use client";

import { useEffect, useRef, useState } from "react";
import { X, Megaphone } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { broadcastModalService } from "@/lib/services";
import { getUserRole } from "@/lib/auth";
import type { BroadcastModal, BroadcastTheme, BroadcastTitleSize } from "@/lib/types";

const DISMISSED_KEY = "dismissed_broadcast_modals";
const POLL_INTERVAL_MS = 30_000;

function getDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function addDismissed(id: string): void {
  const existing = getDismissed();
  existing.add(id);
  const trimmed = [...existing].slice(-50);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(trimmed));
}

// ─── Theme config ─────────────────────────────────────────────

export const BROADCAST_THEMES: Record<BroadcastTheme, {
  label: string;
  hex: string;
  iconGradient: string;
  bar: string;
  border: string;
  badgeText: string;
  badgeBg: string;
  btnGradient: string;
  btnShadow: string;
}> = {
  indigo: {
    label: "Indigo",
    hex: "#6366f1",
    iconGradient: "from-indigo-500 to-purple-600",
    bar: "from-indigo-500 via-purple-500 to-pink-500",
    border: "border-indigo-500/30",
    badgeText: "text-indigo-500 dark:text-indigo-400",
    badgeBg: "",
    btnGradient: "from-indigo-500 to-purple-600",
    btnShadow: "shadow-indigo-500/25",
  },
  emerald: {
    label: "Emerald",
    hex: "#10b981",
    iconGradient: "from-emerald-500 to-teal-600",
    bar: "from-emerald-500 via-teal-500 to-cyan-500",
    border: "border-emerald-500/30",
    badgeText: "text-emerald-600 dark:text-emerald-400",
    badgeBg: "",
    btnGradient: "from-emerald-500 to-teal-600",
    btnShadow: "shadow-emerald-500/25",
  },
  rose: {
    label: "Rose",
    hex: "#f43f5e",
    iconGradient: "from-rose-500 to-pink-600",
    bar: "from-rose-500 via-pink-500 to-fuchsia-500",
    border: "border-rose-500/30",
    badgeText: "text-rose-600 dark:text-rose-400",
    badgeBg: "",
    btnGradient: "from-rose-500 to-pink-600",
    btnShadow: "shadow-rose-500/25",
  },
  amber: {
    label: "Amber",
    hex: "#f59e0b",
    iconGradient: "from-amber-500 to-orange-600",
    bar: "from-amber-500 via-orange-500 to-red-400",
    border: "border-amber-500/30",
    badgeText: "text-amber-600 dark:text-amber-400",
    badgeBg: "",
    btnGradient: "from-amber-500 to-orange-600",
    btnShadow: "shadow-amber-500/25",
  },
  sky: {
    label: "Sky",
    hex: "#0ea5e9",
    iconGradient: "from-sky-500 to-blue-600",
    bar: "from-sky-500 via-blue-500 to-indigo-500",
    border: "border-sky-500/30",
    badgeText: "text-sky-600 dark:text-sky-400",
    badgeBg: "",
    btnGradient: "from-sky-500 to-blue-600",
    btnShadow: "shadow-sky-500/25",
  },
  violet: {
    label: "Violet",
    hex: "#8b5cf6",
    iconGradient: "from-violet-500 to-fuchsia-600",
    bar: "from-violet-500 via-fuchsia-500 to-pink-500",
    border: "border-violet-500/30",
    badgeText: "text-violet-600 dark:text-violet-400",
    badgeBg: "",
    btnGradient: "from-violet-500 to-fuchsia-600",
    btnShadow: "shadow-violet-500/25",
  },
};

const TITLE_SIZE_CLASS: Record<BroadcastTitleSize, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
  xl: "text-2xl",
};

// ─── The actual rendered modal card (shared by viewer + preview) ──

interface BroadcastCardProps {
  modal: BroadcastModal;
  onClose: () => void;
  closeLabel?: string;
}

export function BroadcastCard({ modal, onClose }: BroadcastCardProps) {
  const t = BROADCAST_THEMES[modal.theme as BroadcastTheme] ?? BROADCAST_THEMES.indigo;
  const titleClass = TITLE_SIZE_CLASS[modal.title_size as BroadcastTitleSize] ?? "text-base";

  return (
    <div
      className={`relative flex flex-col max-h-[min(90dvh,calc(100vh-2rem))] w-full overflow-hidden rounded-2xl border ${t.border} bg-white dark:bg-[#0f1117] shadow-2xl shadow-black/60`}
    >
      {/* Top gradient bar */}
      <div className={`shrink-0 h-1 w-full bg-gradient-to-r ${t.bar}`} />

      {/* Optional banner image */}
      {modal.image_url && (
        <div className="relative shrink-0 h-40 w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={modal.image_url}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/40" />
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 flex items-start gap-3 border-b border-slate-200 dark:border-white/[0.06] px-5 py-4">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${t.iconGradient} text-white shadow-lg`}
          style={{ boxShadow: `0 4px 14px 0 ${t.hex}40` }}
        >
          <Megaphone size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[11px] font-semibold uppercase tracking-widest mb-0.5 ${t.badgeText}`}>
            {modal.badge_label}
          </p>
          <h2 className={`${titleClass} font-bold text-slate-900 dark:text-white leading-snug line-clamp-3`}>
            {modal.title}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-800 dark:hover:text-white transition-colors"
          aria-label="Close announcement"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      {modal.body && (
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-headings:text-slate-900 dark:prose-headings:text-white prose-a:text-indigo-500 prose-strong:text-slate-900 dark:prose-strong:text-white prose-code:text-indigo-600 dark:prose-code:text-indigo-300 prose-ul:text-slate-700 dark:prose-ul:text-slate-300">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{modal.body}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="shrink-0 border-t border-slate-200 dark:border-white/[0.06] px-5 py-3 flex justify-end">
        <button
          onClick={onClose}
          className={`inline-flex items-center gap-2 rounded-xl bg-gradient-to-r ${t.btnGradient} px-5 py-2.5 text-sm font-semibold text-white shadow-lg ${t.btnShadow} transition-all hover:brightness-110 hover:shadow-xl active:scale-[0.98]`}
        >
          {modal.close_button_label}
        </button>
      </div>
    </div>
  );
}

// ─── Viewer (polls + shows to users) ─────────────────────────

export default function BroadcastModalViewer() {
  const [modal, setModal] = useState<BroadcastModal | null>(null);
  const [visible, setVisible] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const role = getUserRole();

  async function fetchActive() {
    if (role === "manager") return;
    try {
      const data = await broadcastModalService.getActive();
      if (!data) { setModal(null); setVisible(false); return; }
      if (getDismissed().has(data.id)) { setModal(null); setVisible(false); return; }
      setModal(data);
      setVisible(true);
    } catch {
      // never break the app for a failed poll
    }
  }

  useEffect(() => {
    fetchActive();
    intervalRef.current = setInterval(fetchActive, POLL_INTERVAL_MS);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    if (modal) addDismissed(modal.id);
    setVisible(false);
    setModal(null);
  }

  if (!visible || !modal) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300" />
      <div className="relative w-full max-w-lg animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <BroadcastCard modal={modal} onClose={handleClose} />
      </div>
    </div>
  );
}
