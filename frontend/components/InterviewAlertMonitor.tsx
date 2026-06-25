"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fromZonedTime } from "date-fns-tz";
import { interviewsService } from "@/lib/services";
import { INTERVIEW_SCHEDULE_TZ, formatTime, getTodayEst, getTomorrowEst } from "@/lib/utils";
import { isAlarmEnabled, getCachedAlarmSound, getCachedAlarmStyle, type AlarmSound } from "@/lib/settings";
import type { Interview } from "@/lib/types";

const THRESHOLDS_MIN = [60, 30, 15];
const POLL_MS = 60_000;
const WINDOW_MS = 90_000;
const TOAST_AUTO_DISMISS_MS = 15_000;

function alertKey(id: string, ivMs: number, mins: number) {
  return `iv-alert-${id}-${ivMs}-${mins}`;
}

function wasDismissed(key: string): boolean {
  try { return sessionStorage.getItem(key) === "1"; } catch { return false; }
}
function markDismissed(key: string): void {
  try { sessionStorage.setItem(key, "1"); } catch {}
}

function interviewUtcMs(iv: Interview): number | null {
  if (!iv.interview_date || !iv.time_est) return null;
  const ymd = iv.interview_date.split("T")[0]!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const parts = iv.time_est.trim().split(":");
  const h = (parts[0] ?? "0").padStart(2, "0");
  const m = (parts[1] ?? "0").padStart(2, "0");
  const s = (parts[2] ?? "0").padStart(2, "0");
  const utc = fromZonedTime(`${ymd} ${h}:${m}:${s}`, INTERVIEW_SCHEDULE_TZ);
  return isNaN(utc.getTime()) ? null : utc.getTime();
}

// ─── Sound profiles ────────────────────────────────────────────────────────

type StopFn = () => void;

export function playAlarmSound(sound: AlarmSound): StopFn {
  let stopped = false;
  let ctx: AudioContext | null = null;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    const ac = ctx;

    if (sound === "beep") {
      // Urgent ascending square-wave triple beep
      function beep(t: number, freq: number, dur: number) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.type = "square";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.start(t);
        osc.stop(t + dur);
      }
      function schedule() {
        if (stopped) return;
        const now = ac.currentTime;
        beep(now, 660, 0.15);
        beep(now + 0.22, 880, 0.15);
        beep(now + 0.44, 1100, 0.22);
        setTimeout(schedule, 1300);
      }
      schedule();

    } else if (sound === "chime") {
      // Gentle descending sine chime
      function chime(t: number, freq: number, dur: number) {
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.12, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.start(t);
        osc.stop(t + dur);
      }
      function schedule() {
        if (stopped) return;
        const now = ac.currentTime;
        chime(now,        1047, 0.4);
        chime(now + 0.55, 784,  0.4);
        chime(now + 1.1,  523,  0.6);
        setTimeout(schedule, 2600);
      }
      schedule();

    } else if (sound === "ping") {
      // Short clean sine ping
      function ping() {
        if (stopped) return;
        const now = ac.currentTime;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.type = "sine";
        osc.frequency.setValueAtTime(1760, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
        setTimeout(ping, 1800);
      }
      ping();

    } else if (sound === "pulse") {
      // Low rhythmic triangle pulse
      function pulse() {
        if (stopped) return;
        const now = ac.currentTime;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.type = "triangle";
        osc.frequency.value = 330;
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
        gain.gain.linearRampToValueAtTime(0, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.3);
        setTimeout(pulse, 700);
      }
      pulse();

    } else if (sound === "siren") {
      // Two-tone alternating sawtooth siren
      function siren() {
        if (stopped) return;
        const now = ac.currentTime;
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        osc.connect(gain);
        gain.connect(ac.destination);
        osc.type = "sawtooth";
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.setValueAtTime(0.08, now + 1.0);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.05);
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.linearRampToValueAtTime(880, now + 0.5);
        osc.frequency.linearRampToValueAtTime(660, now + 1.0);
        osc.start(now);
        osc.stop(now + 1.05);
        setTimeout(siren, 1200);
      }
      siren();
    }
  } catch {
    // AudioContext unavailable — silent mode
  }
  return () => {
    stopped = true;
    ctx?.close().catch(() => {});
  };
}

interface AlertItem {
  interview: Interview;
  threshold: number;
  key: string;
}

export default function InterviewAlertMonitor() {
  const [queue, setQueue] = useState<AlertItem[]>([]);
  const stopAlarmRef = useRef<StopFn | null>(null);
  const queuedThisLoad = useRef<Set<string>>(new Set());

  const checkInterviews = useCallback(async () => {
    if (!isAlarmEnabled()) {
      setQueue([]);
      return;
    }
    try {
      const today = getTodayEst();
      const tomorrow = getTomorrowEst();
      const interviews = await interviewsService.list({ date_from: today, date_to: tomorrow });
      const now = Date.now();
      const newAlerts: AlertItem[] = [];

      for (const iv of interviews) {
        const ivMs = interviewUtcMs(iv);
        if (ivMs === null) continue;
        const minsLeft = Math.round((ivMs - now) / 60_000);

        for (const threshold of THRESHOLDS_MIN) {
          const thresholdTime = ivMs - threshold * 60_000;
          const inWindow = now >= thresholdTime - WINDOW_MS && now <= thresholdTime + WINDOW_MS;
          const key = alertKey(iv.id, ivMs, threshold);
          if (inWindow && !queuedThisLoad.current.has(key) && !wasDismissed(key)) {
            queuedThisLoad.current.add(key);
            newAlerts.push({ interview: iv, threshold, key });
          }
        }

        if (minsLeft >= 0 && minsLeft <= 60) {
          const catchUpKey = alertKey(iv.id, ivMs, 0);
          const anyThresholdQueued = THRESHOLDS_MIN.some((t) =>
            queuedThisLoad.current.has(alertKey(iv.id, ivMs, t)),
          );
          if (!anyThresholdQueued && !queuedThisLoad.current.has(catchUpKey) && !wasDismissed(catchUpKey)) {
            queuedThisLoad.current.add(catchUpKey);
            newAlerts.push({ interview: iv, threshold: Math.max(minsLeft, 1), key: catchUpKey });
          }
        }
      }

      if (newAlerts.length > 0) {
        setQueue((prev) => [...prev, ...newAlerts]);
      }
    } catch {
      // fetch failed silently
    }
  }, []);

  useEffect(() => {
    checkInterviews();
    const id = setInterval(checkInterviews, POLL_MS);
    return () => clearInterval(id);
  }, [checkInterviews]);

  useEffect(() => {
    const handler = () => checkInterviews();
    window.addEventListener("user-settings-changed", handler);
    return () => window.removeEventListener("user-settings-changed", handler);
  }, [checkInterviews]);

  // Start / stop the sound based on queue presence
  useEffect(() => {
    if (queue.length > 0 && !stopAlarmRef.current) {
      stopAlarmRef.current = playAlarmSound(getCachedAlarmSound());
    } else if (queue.length === 0 && stopAlarmRef.current) {
      stopAlarmRef.current();
      stopAlarmRef.current = null;
    }
  }, [queue.length]);

  useEffect(() => {
    return () => { stopAlarmRef.current?.(); };
  }, []);

  const dismissCurrent = useCallback(() => {
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

  const style = getCachedAlarmStyle();

  if (style === "toast") {
    return <ToastAlerts queue={queue} onDismiss={dismissCurrent} onDismissAll={dismissAll} />;
  }

  return <FullScreenAlert queue={queue} onDismiss={dismissCurrent} onDismissAll={dismissAll} />;
}

// ─── Full-screen alarm overlay ────────────────────────────────────────────

function FullScreenAlert({
  queue,
  onDismiss,
  onDismissAll,
}: {
  queue: AlertItem[];
  onDismiss: () => void;
  onDismissAll: () => void;
}) {
  const { interview, threshold } = queue[0]!;

  return (
    <>
      <style>{`
        @keyframes iv-bg {
          0%, 100% { background-color: rgba(185, 28, 28, 0.97); }
          50%       { background-color: rgba(127, 29, 29, 0.99); }
        }
        @keyframes iv-card-shake {
          0%, 88%, 100% { transform: translateX(0) rotate(0deg); }
          90%           { transform: translateX(-6px) rotate(-0.4deg); }
          92%           { transform: translateX( 6px) rotate( 0.4deg); }
          94%           { transform: translateX(-5px) rotate(-0.3deg); }
          96%           { transform: translateX( 5px) rotate( 0.3deg); }
          98%           { transform: translateX(-2px) rotate(-0.1deg); }
        }
        @keyframes iv-icon {
          0%, 100% { transform: scale(1)    rotate(  0deg); }
          25%      { transform: scale(1.18) rotate( -8deg); }
          75%      { transform: scale(1.18) rotate(  8deg); }
        }
        @keyframes iv-blink {
          0%, 100% { opacity: 1;   }
          50%      { opacity: 0.55; }
        }
        .iv-bg         { animation: iv-bg         1.2s ease-in-out infinite; }
        .iv-card-shake { animation: iv-card-shake 2.5s ease-in-out infinite; }
        .iv-icon       { animation: iv-icon        0.6s ease-in-out infinite; }
        .iv-blink      { animation: iv-blink       0.85s ease-in-out infinite; }
      `}</style>

      <div className="iv-bg fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="iv-card-shake bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border-4 border-red-600 w-full max-w-md overflow-hidden">
          <div className="bg-red-600 py-3 px-5 flex items-center justify-between">
            <span className="text-white font-black text-sm uppercase tracking-widest">
              Interview Alarm
            </span>
            {queue.length > 1 && (
              <span className="bg-white text-red-600 text-xs font-black px-2.5 py-0.5 rounded-full">
                {queue.length} alerts
              </span>
            )}
          </div>

          <div className="p-8">
            <div className="text-center mb-4">
              <span className="iv-icon inline-block text-7xl select-none">🚨</span>
            </div>

            <div className="text-center mb-5">
              <p className="iv-blink text-6xl font-black text-red-600 dark:text-red-400 tabular-nums leading-none">
                {threshold} MIN
              </p>
              <p className="text-lg font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-2">
                Until Interview
              </p>
            </div>

            <hr className="border-gray-200 dark:border-zinc-700 my-5" />

            <div className="text-center space-y-1.5 mb-7">
              <p className="text-2xl font-black text-gray-900 dark:text-white leading-tight">
                {interview.company_name ?? "Unknown Company"}
              </p>
              <p className="text-base text-gray-600 dark:text-gray-300">
                {interview.role}
                {interview.round ? ` · ${interview.round}` : ""}
              </p>
              {interview.time_est && (
                <p className="text-lg font-bold text-red-600 dark:text-red-400">
                  {formatTime(interview.time_est)} EST
                </p>
              )}
              {interview.candidate_name && (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {interview.candidate_name}
                </p>
              )}
              {interview.interview_link && (
                <a
                  href={interview.interview_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  Open Interview Link ↗
                </a>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={onDismissAll}
                className="flex-1 py-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-black text-lg rounded-xl uppercase tracking-wider transition-colors shadow-lg shadow-red-500/30"
              >
                Stop Alarm
              </button>
              {queue.length > 1 && (
                <button
                  onClick={onDismiss}
                  className="px-5 py-4 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-gray-700 dark:text-gray-300 font-bold text-sm rounded-xl transition-colors"
                >
                  Next →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Toast notification stack ────────────────────────────────────────────

function ToastAlerts({
  queue,
  onDismiss,
  onDismissAll,
}: {
  queue: AlertItem[];
  onDismiss: () => void;
  onDismissAll: () => void;
}) {
  // Auto-dismiss the front-of-queue toast after TOAST_AUTO_DISMISS_MS
  useEffect(() => {
    const id = setTimeout(() => {
      onDismiss();
    }, TOAST_AUTO_DISMISS_MS);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue[0]?.key]);

  // Show at most 3 toasts stacked
  const visible = queue.slice(0, 3);

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 w-full max-w-sm px-4">
      {visible.map((item, i) => (
        <ToastCard
          key={item.key}
          item={item}
          isTop={i === 0}
          remaining={i === 0 ? queue.length : 0}
          onDismiss={onDismiss}
          onDismissAll={onDismissAll}
          style={{ opacity: 1 - i * 0.2, transform: `scale(${1 - i * 0.04})` }}
        />
      ))}
    </div>
  );
}

function ToastCard({
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
  const { interview, threshold } = item;

  return (
    <div
      style={style}
      className="w-full bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-red-300 dark:border-red-700 overflow-hidden transition-all duration-300"
    >
      {/* Colored top strip */}
      <div className="bg-red-600 h-1 w-full" />

      <div className="px-4 py-3 flex items-start gap-3">
        {/* Icon */}
        <div className="shrink-0 mt-0.5 text-2xl select-none">🚨</div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-black text-red-600 dark:text-red-400 uppercase tracking-widest">
              {threshold} min
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">until interview</span>
            {remaining > 1 && (
              <span className="ml-auto text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full">
                +{remaining - 1} more
              </span>
            )}
          </div>
          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
            {interview.company_name ?? "Unknown Company"}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {interview.role}
            {interview.round ? ` · ${interview.round}` : ""}
            {interview.time_est ? ` · ${formatTime(interview.time_est)} EST` : ""}
          </p>
          {interview.candidate_name && (
            <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
              {interview.candidate_name}
            </p>
          )}
        </div>

        {/* Actions */}
        {isTop && (
          <div className="shrink-0 flex flex-col gap-1 ml-1">
            {interview.interview_link && (
              <a
                href={interview.interview_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 whitespace-nowrap"
              >
                Join ↗
              </a>
            )}
            <button
              onClick={onDismissAll}
              className="text-[10px] font-semibold text-red-600 hover:text-red-700 dark:text-red-400 whitespace-nowrap"
            >
              Dismiss
            </button>
            {remaining > 1 && (
              <button
                onClick={onDismiss}
                className="text-[10px] font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 whitespace-nowrap"
              >
                Next
              </button>
            )}
          </div>
        )}
      </div>

      {/* Auto-dismiss progress bar (only on top toast) */}
      {isTop && (
        <div className="h-0.5 bg-red-100 dark:bg-red-900/30">
          <div
            className="h-full bg-red-500 origin-left"
            style={{ animation: `iv-toast-shrink ${TOAST_AUTO_DISMISS_MS}ms linear forwards` }}
          />
        </div>
      )}

      <style>{`
        @keyframes iv-toast-shrink {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </div>
  );
}
