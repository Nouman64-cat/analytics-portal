"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, ExternalLink, MapPin, Video } from "lucide-react";
import { engagementsService } from "@/lib/services";
import { parseUtcDatetime, formatTime } from "@/lib/utils";
import { getUserId } from "@/lib/auth";
import type { Engagement } from "@/lib/types";

const POLL_MS = 60_000;
const AUTO_DISMISS_MS = 20_000;
const LOOKAHEAD_MS = 2 * 60 * 60_000; // only fetch engagements starting within the next 2h

/** A single short chime when reminder arrives */
function playReminderChime(): void {
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.15);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    osc.start(now);
    osc.stop(now + 0.35);
    setTimeout(() => ctx.close().catch(() => {}), 500);
  } catch {
    // AudioContext unavailable — silent
  }
}

function alertKey(id: string, startMs: number, minutes: number): string {
  return `eng-alert-${id}-${startMs}-${minutes}`;
}

function wasDismissed(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markDismissed(key: string): void {
  try {
    sessionStorage.setItem(key, "1");
  } catch {}
}

interface AlertItem {
  engagement: Engagement;
  minutes: number;
  key: string;
}

export default function EngagementAlertMonitor() {
  const [queue, setQueue] = useState<AlertItem[]>([]);
  const prevQueueLenRef = useRef(0);
  const queuedThisLoad = useRef<Set<string>>(new Set());

  const checkEngagements = useCallback(async () => {
    const userId = getUserId();
    if (!userId) return;
    try {
      const now = Date.now();
      const engagements = await engagementsService.list({
        organizer_id: userId,
        start_date: new Date(now - 5 * 60_000).toISOString(),
        end_date: new Date(now + LOOKAHEAD_MS).toISOString(),
      });
      const newAlerts: AlertItem[] = [];

      for (const eng of engagements) {
        if (eng.is_all_day || eng.status === "cancelled") continue;
        if (eng.reminder_minutes === null || eng.reminder_minutes === undefined) continue;
        const startMs = parseUtcDatetime(eng.start_time).getTime();
        if (Number.isNaN(startMs)) continue;
        const minsLeft = Math.round((startMs - now) / 60_000);

        const thresholdTime = startMs - eng.reminder_minutes * 60_000;
        const key = alertKey(eng.id, startMs, eng.reminder_minutes);
        const alreadyHandled = queuedThisLoad.current.has(key) || wasDismissed(key);

        if (!alreadyHandled) {
          if (now >= thresholdTime) {
            // Threshold passed. Only alert if meeting hasn't started yet.
            if (minsLeft >= 0) {
              queuedThisLoad.current.add(key);
              const isCatchUp = now > thresholdTime + 60_000;
              const displayMins = isCatchUp ? Math.max(minsLeft, 1) : (eng.reminder_minutes ?? 0);
              newAlerts.push({ engagement: eng, minutes: displayMins, key });
            }
          } else {
            // Threshold is in the future. Will it happen before the next poll?
            const delay = thresholdTime - now;
            if (delay <= POLL_MS + 5000) {
              queuedThisLoad.current.add(key);
              setTimeout(() => {
                if (!wasDismissed(key)) {
                  setQueue((prev) => [...prev, { engagement: eng, minutes: eng.reminder_minutes ?? 0, key }]);
                }
              }, delay);
            }
          }
        }
      }

      if (newAlerts.length > 0) setQueue((prev) => [...prev, ...newAlerts]);
    } catch {
      // fetch failed silently
    }
  }, []);

  useEffect(() => {
    checkEngagements();
    const id = setInterval(checkEngagements, POLL_MS);
    return () => clearInterval(id);
  }, [checkEngagements]);

  useEffect(() => {
    const handler = () => checkEngagements();
    window.addEventListener("engagement-changed", handler);
    return () => window.removeEventListener("engagement-changed", handler);
  }, [checkEngagements]);

  useEffect(() => {
    if (queue.length > prevQueueLenRef.current) playReminderChime();
    prevQueueLenRef.current = queue.length;
  }, [queue.length]);

  const dismiss = useCallback(() => {
    setQueue((prev) => {
      if (prev[0]) markDismissed(prev[0].key);
      return prev.slice(1);
    });
  }, []);

  const dismissAll = useCallback(() => {
    setQueue((prev) => {
      prev.forEach((item) => markDismissed(item.key));
      return [];
    });
  }, []);

  if (queue.length === 0) return null;

  const visible = queue.slice(0, 3);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
      {/* Subtle backdrop overlay */}
      <div
        className="fixed inset-0 bg-slate-950/20 dark:bg-black/40 backdrop-blur-[2px] transition-opacity"
        onClick={dismissAll}
      />

      {/* Center card stack */}
      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-3">
        {visible.map((item, i) => (
          <ReminderToastCard
            key={item.key}
            item={item}
            isTop={i === 0}
            remaining={i === 0 ? queue.length : 0}
            onDismiss={dismiss}
            onDismissAll={dismissAll}
            style={{ opacity: 1 - i * 0.18, transform: `scale(${1 - i * 0.04})` }}
          />
        ))}
      </div>
    </div>
  );
}

/** 3D Golden Bell with Red Notification Badge */
function GoldenBell3DIcon({ count = 1 }: { count: number }) {
  return (
    <div className="relative inline-block select-none filter drop-shadow-[0_8px_16px_rgba(245,158,11,0.4)] animate-bell-swing">
      <style>{`
        @keyframes bell-swing {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(14deg); }
          40% { transform: rotate(-12deg); }
          60% { transform: rotate(8deg); }
          80% { transform: rotate(-4deg); }
        }
        .animate-bell-swing {
          transform-origin: 32px 8px;
          animation: bell-swing 1.8s ease-in-out infinite;
        }
      `}</style>
      <svg width="60" height="60" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          {/* Gold metallic gradient */}
          <linearGradient id="bellGold" x1="12" y1="12" x2="52" y2="52" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="30%" stopColor="#FBBF24" />
            <stop offset="70%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#D97706" />
          </linearGradient>

          {/* Curved lighting highlight */}
          <linearGradient id="bellLight" x1="20" y1="14" x2="34" y2="40" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#FEF08A" stopOpacity="0.05" />
          </linearGradient>

          {/* Clapper bottom sphere */}
          <linearGradient id="clapperGrad" x1="28" y1="48" x2="36" y2="56" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FDE047" />
            <stop offset="50%" stopColor="#D97706" />
            <stop offset="100%" stopColor="#78350F" />
          </linearGradient>

          {/* Red 3D glossy badge gradient */}
          <linearGradient id="redBadgeGrad" x1="42" y1="6" x2="58" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F87171" />
            <stop offset="40%" stopColor="#EF4444" />
            <stop offset="100%" stopColor="#991B1B" />
          </linearGradient>
        </defs>

        {/* Clapper */}
        <circle cx="32" cy="51" r="5.5" fill="url(#clapperGrad)" />
        <ellipse cx="32" cy="52" rx="3" ry="1.5" fill="#78350F" opacity="0.35" />

        {/* Main Bell Body */}
        <path
          d="M32 9C23 9 17 17 17 27C17 37 12 42 10 45C9.8 47 11.5 48.5 15 48.5H49C52.5 48.5 54.2 47 54 45C52 42 47 37 47 27C47 17 41 9 32 9Z"
          fill="url(#bellGold)"
        />

        {/* Bell Rim Base */}
        <ellipse cx="32" cy="46" rx="21" ry="3.5" fill="#D97706" />
        <ellipse cx="32" cy="45.5" rx="19.5" ry="2.5" fill="#FBBF24" />

        {/* Top Handle / Knob */}
        <ellipse cx="32" cy="9" rx="4" ry="2.5" fill="#FEF08A" />

        {/* Curved Glass Highlight */}
        <path
          d="M23 15C20.5 20 19.5 27 19.5 35C19.5 39 17.5 42 16.5 43C18.5 43 23.5 39 23.5 33C23.5 25 25.5 18 27.5 14C25.5 14.2 24.2 14.6 23 15Z"
          fill="url(#bellLight)"
        />

        {/* Red 3D Notification Badge on top right of the bell */}
        <g className="filter drop-shadow-[0_2px_4px_rgba(185,28,28,0.45)]">
          <circle cx="48" cy="14" r="9.5" fill="url(#redBadgeGrad)" />
          <circle cx="48" cy="14" r="9.5" stroke="#FFFFFF" strokeWidth="1.6" />
          <text
            x="48"
            y="17.5"
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize="10"
            fontWeight="900"
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {count}
          </text>
        </g>
      </svg>
    </div>
  );
}

function ReminderToastCard({
  item,
  isTop,
  remaining,
  onDismiss,
  onDismissAll,
  style,
}: {
  item: AlertItem;
  isTop: boolean;
  remaining: number;
  onDismiss: () => void;
  onDismissAll: () => void;
  style?: React.CSSProperties;
}) {
  const { engagement, minutes } = item;

  useEffect(() => {
    if (!isTop) return;
    const id = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  }, [isTop, item.key, onDismiss]);

  const timeLabel =
    minutes === 0
      ? "Starting now"
      : minutes < 60
      ? `Starting in ${minutes} min`
      : minutes < 1440
      ? `Starting in ${Math.round(minutes / 60)} hr`
      : `Starting in ${Math.round(minutes / 1440)} day`;

  return (
    <div
      style={style}
      className="relative w-full max-w-sm pt-6 transition-all duration-300 animate-in slide-in-from-top-3 fade-in duration-300"
    >
      {/* ── 3D Golden Bell Floating on the Top-Left ── */}
      <div className="absolute -top-1 left-4 z-20 pointer-events-none">
        <GoldenBell3DIcon count={remaining > 1 ? remaining : 1} />
      </div>

      {/* ── Main Toast Window / Card ── */}
      <div className="relative overflow-hidden rounded-[1.75rem] bg-white dark:bg-[#151826] shadow-[0_20px_50px_rgba(0,0,0,0.14)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.65)] border border-slate-100/90 dark:border-white/[0.08] backdrop-blur-xl">
        {/* Top-Right Red Circular Close Button */}
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-3.5 right-3.5 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-b from-rose-500 to-red-600 text-white shadow-md shadow-red-500/30 hover:scale-110 active:scale-95 transition-transform"
          title="Close reminder"
        >
          <X size={13} strokeWidth={2.8} />
        </button>

        {/* ── Card Content Body ── */}
        <div className="pt-5 pb-4 px-6 text-center">
          {/* Header Title */}
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Reminder
          </h3>

          {/* Time Badge */}
          <div className="mt-1 flex items-center justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 dark:bg-amber-400/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
              {timeLabel}
            </span>
          </div>

          {/* Meeting Title */}
          <p className="mt-2.5 text-sm font-bold text-slate-800 dark:text-slate-100 line-clamp-2 leading-snug">
            {engagement.title}
          </p>

          {/* Meeting Context / Location / Link */}
          <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            {engagement.start_time && (
              <span>
                {formatTime(parseUtcDatetime(engagement.start_time).toTimeString().slice(0, 5))}
              </span>
            )}
            {engagement.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={11} className="text-rose-500" />
                <span className="truncate max-w-[120px]">{engagement.location}</span>
              </span>
            )}
          </div>
        </div>

        {/* ── Split Action Buttons Footer (Got it / Close) ── */}
        <div className="grid grid-cols-2 border-t border-slate-100 dark:border-white/[0.08] divide-x divide-slate-100 dark:divide-white/[0.08] bg-slate-50/60 dark:bg-white/[0.02]">
          {/* Left Button: Got it or Join Meeting */}
          {engagement.meeting_link ? (
            <a
              href={engagement.meeting_link}
              target="_blank"
              rel="noreferrer"
              onClick={onDismiss}
              className="flex items-center justify-center gap-1.5 py-3 text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 active:bg-emerald-500/20 transition-colors"
            >
              <Video size={14} />
              <span>Join Meeting ↗</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={onDismiss}
              className="flex items-center justify-center py-3 text-xs sm:text-sm font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 active:bg-emerald-500/20 transition-colors"
            >
              Got it
            </button>
          )}

          {/* Right Button: Close */}
          <button
            type="button"
            onClick={remaining > 1 ? onDismiss : onDismissAll}
            className="flex items-center justify-center py-3 text-xs sm:text-sm font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 active:bg-rose-500/20 transition-colors"
          >
            {remaining > 1 ? "Next" : "Close"}
          </button>
        </div>

        {/* Auto-Dismiss Linear Progress Bar on Top Card */}
        {isTop && (
          <div className="h-1 w-full bg-slate-100 dark:bg-white/[0.05] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-rose-500 origin-left"
              style={{ animation: `reminder-toast-shrink ${AUTO_DISMISS_MS}ms linear forwards` }}
            />
          </div>
        )}
      </div>

      <style>{`
        @keyframes reminder-toast-shrink {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>
    </div>
  );
}
