"use client";

import { useEffect, useRef, useState } from "react";
import {
  X,
  Megaphone, Bell, BellRing, AlertTriangle, AlertCircle,
  Info, Star, Trophy, Zap, Heart, Sparkles, Flame, Rocket, ShieldAlert,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { broadcastModalService } from "@/lib/services";
import { getUserRole } from "@/lib/auth";
import type {
  BroadcastModal,
  BroadcastTheme,
  BroadcastTitleSize,
  BroadcastModalSize,
  BroadcastTextAlign,
  BroadcastAnimation,
  BroadcastImageFit,
  BroadcastEffect,
} from "@/lib/types";

const DISMISSED_KEY = "dismissed_broadcast_modals";
const POLL_INTERVAL_MS = 8_000;

// Key by "id:published_at" so a re-published (or updated+republished) modal
// shows again to users who already dismissed the previous version.
function dismissedKey(modal: BroadcastModal): string {
  return `${modal.id}:${modal.published_at ?? ""}`;
}

function getDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function addDismissed(key: string): void {
  const existing = getDismissed();
  existing.add(key);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...existing].slice(-100)));
}

// ─── Confetti effects ─────────────────────────────────────────

// zIndex must exceed the modal overlay (z-[9999]) so confetti renders on top
const CONFETTI_Z = 10000;

async function fireEffect(effect: BroadcastEffect, themeHex: string) {
  if (effect === "none") return;
  const confetti = (await import("canvas-confetti")).default;

  if (effect === "confetti") {
    confetti({ particleCount: 160, spread: 80, origin: { y: 0.6 }, zIndex: CONFETTI_Z });
  } else if (effect === "fireworks") {
    const burst = (x: number, angle: number) =>
      confetti({ particleCount: 70, angle, spread: 55, origin: { x, y: 0.85 }, zIndex: CONFETTI_Z });
    burst(0, 60);
    burst(1, 120);
    setTimeout(() => { burst(0.25, 75); burst(0.75, 105); }, 350);
    setTimeout(() => confetti({ particleCount: 80, spread: 100, origin: { x: 0.5, y: 0.5 }, zIndex: CONFETTI_Z }), 700);
  } else if (effect === "snow") {
    let ticks = 0;
    const frame = () => {
      confetti({
        particleCount: 8, startVelocity: 0, spread: 360,
        origin: { x: Math.random(), y: -0.05 },
        gravity: 0.25, scalar: 0.75, drift: 0.5,
        colors: ["#ffffff", "#e0e7ff", "#c7d2fe", "#bfdbfe"],
        zIndex: CONFETTI_Z,
      });
      if (++ticks < 30) setTimeout(frame, 200);
    };
    frame();
  } else if (effect === "stars") {
    const starColors = [themeHex, "#FFD700", "#FFA500", "#ffffff", "#FFEC00"];
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.65 }, colors: starColors, shapes: ["star"], zIndex: CONFETTI_Z });
    setTimeout(() =>
      confetti({ particleCount: 60, spread: 90, origin: { y: 0.55 }, colors: starColors, shapes: ["star"], zIndex: CONFETTI_Z }),
      350);
  }
}

// ─── Theme config ─────────────────────────────────────────────

export const BROADCAST_THEMES: Record<BroadcastTheme, {
  label: string; hex: string; iconGradient: string; bar: string;
  border: string; badgeText: string; badgeBg: string;
  btnGradient: string; btnShadow: string;
}> = {
  indigo: {
    label: "Indigo", hex: "#6366f1",
    iconGradient: "from-indigo-500 to-purple-600",
    bar: "from-indigo-500 via-purple-500 to-pink-500",
    border: "border-indigo-500/30", badgeText: "text-indigo-500 dark:text-indigo-400", badgeBg: "",
    btnGradient: "from-indigo-500 to-purple-600", btnShadow: "shadow-indigo-500/25",
  },
  emerald: {
    label: "Emerald", hex: "#10b981",
    iconGradient: "from-emerald-500 to-teal-600",
    bar: "from-emerald-500 via-teal-500 to-cyan-500",
    border: "border-emerald-500/30", badgeText: "text-emerald-600 dark:text-emerald-400", badgeBg: "",
    btnGradient: "from-emerald-500 to-teal-600", btnShadow: "shadow-emerald-500/25",
  },
  rose: {
    label: "Rose", hex: "#f43f5e",
    iconGradient: "from-rose-500 to-pink-600",
    bar: "from-rose-500 via-pink-500 to-fuchsia-500",
    border: "border-rose-500/30", badgeText: "text-rose-600 dark:text-rose-400", badgeBg: "",
    btnGradient: "from-rose-500 to-pink-600", btnShadow: "shadow-rose-500/25",
  },
  amber: {
    label: "Amber", hex: "#f59e0b",
    iconGradient: "from-amber-500 to-orange-600",
    bar: "from-amber-500 via-orange-500 to-red-400",
    border: "border-amber-500/30", badgeText: "text-amber-600 dark:text-amber-400", badgeBg: "",
    btnGradient: "from-amber-500 to-orange-600", btnShadow: "shadow-amber-500/25",
  },
  sky: {
    label: "Sky", hex: "#0ea5e9",
    iconGradient: "from-sky-500 to-blue-600",
    bar: "from-sky-500 via-blue-500 to-indigo-500",
    border: "border-sky-500/30", badgeText: "text-sky-600 dark:text-sky-400", badgeBg: "",
    btnGradient: "from-sky-500 to-blue-600", btnShadow: "shadow-sky-500/25",
  },
  violet: {
    label: "Violet", hex: "#8b5cf6",
    iconGradient: "from-violet-500 to-fuchsia-600",
    bar: "from-violet-500 via-fuchsia-500 to-pink-500",
    border: "border-violet-500/30", badgeText: "text-violet-600 dark:text-violet-400", badgeBg: "",
    btnGradient: "from-violet-500 to-fuchsia-600", btnShadow: "shadow-violet-500/25",
  },
};

// ─── Icon registry ─────────────────────────────────────────────

export const BROADCAST_ICONS: Record<string, React.ElementType> = {
  Megaphone, Bell, BellRing, AlertTriangle, AlertCircle,
  Info, Star, Trophy, Zap, Heart, Sparkles, Flame, Rocket, ShieldAlert,
};

export const BROADCAST_ICON_LIST = [
  { key: "Megaphone",     Icon: Megaphone },
  { key: "Bell",          Icon: Bell },
  { key: "BellRing",      Icon: BellRing },
  { key: "AlertTriangle", Icon: AlertTriangle },
  { key: "AlertCircle",   Icon: AlertCircle },
  { key: "Info",          Icon: Info },
  { key: "Star",          Icon: Star },
  { key: "Trophy",        Icon: Trophy },
  { key: "Zap",           Icon: Zap },
  { key: "Heart",         Icon: Heart },
  { key: "Sparkles",      Icon: Sparkles },
  { key: "Flame",         Icon: Flame },
  { key: "Rocket",        Icon: Rocket },
  { key: "ShieldAlert",   Icon: ShieldAlert },
];

// ─── Layout maps ───────────────────────────────────────────────

export const BROADCAST_MODAL_SIZES: Record<BroadcastModalSize, { label: string; maxW: string }> = {
  sm: { label: "Narrow", maxW: "max-w-sm"  },
  md: { label: "Normal", maxW: "max-w-lg"  },
  lg: { label: "Wide",   maxW: "max-w-2xl" },
};

const TITLE_SIZE_CLASS: Record<BroadcastTitleSize, string> = {
  sm: "text-sm", md: "text-base", lg: "text-xl", xl: "text-2xl",
};

export const BROADCAST_ANIMATIONS: Record<BroadcastAnimation, { label: string; wrapperClass: string }> = {
  zoom:  { label: "Zoom",  wrapperClass: "entrance-zoom"  },
  slide: { label: "Slide", wrapperClass: "entrance-slide" },
  fade:  { label: "Fade",  wrapperClass: "entrance-fade"  },
};

export const BROADCAST_IMAGE_FITS: Record<BroadcastImageFit, { label: string; description: string }> = {
  contain: { label: "Fit",  description: "Show full image, no cropping" },
  cover:   { label: "Fill", description: "Fill banner area, may crop"   },
};

export const BROADCAST_EFFECTS: Record<BroadcastEffect, { label: string; emoji: string; description: string }> = {
  none:      { label: "None",      emoji: "✕",  description: "No effect" },
  confetti:  { label: "Confetti",  emoji: "🎊", description: "Colorful burst" },
  fireworks: { label: "Fireworks", emoji: "🎆", description: "Multi-burst rockets" },
  snow:      { label: "Snow",      emoji: "❄️", description: "Gentle snowfall" },
  stars:     { label: "Stars",     emoji: "⭐", description: "Golden star shower" },
};

// ─── BroadcastCard ─────────────────────────────────────────────

interface BroadcastCardProps {
  modal: BroadcastModal;
  onClose: () => void;
}

export function BroadcastCard({ modal, onClose }: BroadcastCardProps) {
  const t         = BROADCAST_THEMES[(modal.theme as BroadcastTheme)] ?? BROADCAST_THEMES.indigo;
  const titleCls  = TITLE_SIZE_CLASS[(modal.title_size as BroadcastTitleSize)] ?? "text-base";
  const align     = (modal.text_align as BroadcastTextAlign) ?? "left";
  const imageFit  = (modal.image_fit as BroadcastImageFit) ?? "contain";
  const IconEl    = BROADCAST_ICONS[modal.icon] ?? Megaphone;

  const glowStyle = modal.show_glow
    ? { boxShadow: `0 0 0 1px ${t.hex}50, 0 8px 40px -4px ${t.hex}60, 0 0 80px -10px ${t.hex}35` }
    : undefined;

  return (
    <div
      className={`relative flex flex-col max-h-[min(90dvh,calc(100vh-2rem))] w-full overflow-hidden rounded-2xl border ${t.border} bg-white dark:bg-[#0f1117] shadow-2xl shadow-black/60`}
      style={glowStyle}
    >
      {/* Top gradient bar */}
      <div className={`shrink-0 h-1 w-full bg-gradient-to-r ${t.bar}`} />

      {/* Banner image */}
      {modal.image_url && (
        imageFit === "cover" ? (
          <div className="relative shrink-0 h-44 w-full overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={modal.image_url} alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/40" />
          </div>
        ) : (
          <div className="shrink-0 w-full overflow-hidden bg-slate-50 dark:bg-slate-900/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={modal.image_url}
              alt=""
              className="w-full h-auto object-contain"
              style={{ maxHeight: "260px" }}
            />
          </div>
        )
      )}

      {/* Header */}
      <div className={`shrink-0 flex items-start gap-3 border-b border-slate-200 dark:border-white/[0.06] px-5 py-4 ${align === "center" ? "flex-col items-center text-center" : ""}`}>
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${t.iconGradient} text-white`}
          style={{ boxShadow: `0 4px 14px 0 ${t.hex}50` }}
        >
          <IconEl size={18} />
        </div>
        <div className={`flex-1 min-w-0 ${align === "center" ? "text-center" : ""}`}>
          <p className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-1 ${t.badgeText}`}>{modal.badge_label}</p>
          <h2 className={`${titleCls} font-bold text-slate-900 dark:text-white leading-snug`}>{modal.title}</h2>
        </div>
        {align !== "center" ? (
          <button onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-800 dark:hover:text-white transition-colors"
            aria-label="Close">
            <X size={16} />
          </button>
        ) : (
          <button onClick={onClose}
            className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
            aria-label="Close">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Body */}
      {modal.body && (
        <div className={`flex-1 min-h-0 overflow-y-auto px-5 py-5 ${align === "center" ? "text-center" : ""}`}>
          <div className="prose prose-sm dark:prose-invert max-w-none prose-p:text-slate-700 dark:prose-p:text-slate-300 prose-headings:text-slate-900 dark:prose-headings:text-white prose-a:text-indigo-500 prose-strong:text-slate-900 dark:prose-strong:text-white prose-code:text-indigo-600 dark:prose-code:text-indigo-300">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{modal.body}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className={`shrink-0 border-t border-slate-200 dark:border-white/[0.06] px-5 py-3.5 flex ${align === "center" ? "justify-center" : "justify-end"}`}>
        <button
          onClick={onClose}
          className={`inline-flex items-center gap-2 rounded-xl bg-gradient-to-r ${t.btnGradient} px-6 py-2.5 text-sm font-semibold text-white shadow-lg ${t.btnShadow} transition-all hover:brightness-110 hover:shadow-xl active:scale-[0.98]`}
        >
          {modal.close_button_label}
        </button>
      </div>
    </div>
  );
}

// ─── Viewer ───────────────────────────────────────────────────

export default function BroadcastModalViewer() {
  const [modal, setModal] = useState<BroadcastModal | null>(null);
  const [visible, setVisible] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const role = getUserRole();

  async function fetchActive() {
    if (role === "manager") return;
    try {
      const data = await broadcastModalService.getActive();
      if (!data || getDismissed().has(dismissedKey(data))) {
        setModal(null);
        setVisible(false);
        return;
      }
      setModal(data);
      setVisible(true);
    } catch { /* never break the app */ }
  }

  useEffect(() => {
    fetchActive();
    intervalRef.current = setInterval(fetchActive, POLL_INTERVAL_MS);

    // Poll immediately when the user returns to the tab
    const onFocus = () => fetchActive();
    document.addEventListener("visibilitychange", onFocus);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener("visibilitychange", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fire celebration effect when modal first becomes visible
  useEffect(() => {
    if (!visible || !modal) return;
    const t = BROADCAST_THEMES[(modal.theme as BroadcastTheme)] ?? BROADCAST_THEMES.indigo;
    fireEffect((modal.effect as BroadcastEffect) ?? "none", t.hex);
  }, [visible, modal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose() {
    if (modal) addDismissed(dismissedKey(modal));
    setVisible(false);
    setModal(null);
  }

  if (!visible || !modal) return null;

  const sizeMaxW  = BROADCAST_MODAL_SIZES[(modal.modal_size as BroadcastModalSize)]?.maxW ?? "max-w-lg";
  const animClass = BROADCAST_ANIMATIONS[(modal.animation as BroadcastAnimation)]?.wrapperClass ?? BROADCAST_ANIMATIONS.zoom.wrapperClass;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm entrance-fade" />
      <div className={`relative w-full ${sizeMaxW} ${animClass}`}>
        <BroadcastCard modal={modal} onClose={handleClose} />
      </div>
    </div>
  );
}
