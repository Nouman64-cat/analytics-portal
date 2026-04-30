"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fromZonedTime } from "date-fns-tz";
import { interviewsService } from "@/lib/services";
import { INTERVIEW_SCHEDULE_TZ, formatTime, getTodayEst, getTomorrowEst } from "@/lib/utils";
import type { Interview } from "@/lib/types";

const THRESHOLDS_MIN = [60, 30, 15];
const POLL_MS = 60_000;
// How wide a window around each threshold time to trigger the alert
// (wider than poll interval so we never miss a threshold)
const WINDOW_MS = 90_000;

function alertKey(id: string, date: string, mins: number) {
  return `iv-alert-${id}-${date}-${mins}`;
}

function wasTriggered(id: string, date: string, mins: number): boolean {
  try {
    return localStorage.getItem(alertKey(id, date, mins)) === "1";
  } catch {
    return false;
  }
}

function markTriggered(id: string, date: string, mins: number): void {
  try {
    localStorage.setItem(alertKey(id, date, mins), "1");
  } catch {}
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

function startAlarm(): () => void {
  let stopped = false;
  let ctx: AudioContext | null = null;

  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new AC();
    const ac = ctx;

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
      // Three ascending beeps: low → mid → high
      beep(now, 660, 0.15);
      beep(now + 0.22, 880, 0.15);
      beep(now + 0.44, 1100, 0.22);
      setTimeout(schedule, 1300);
    }

    schedule();
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
}

export default function InterviewAlertMonitor() {
  const [queue, setQueue] = useState<AlertItem[]>([]);
  const stopAlarmRef = useRef<(() => void) | null>(null);

  const checkInterviews = useCallback(async () => {
    try {
      // Fetch today + tomorrow in EST so users in timezones ahead of EST
      // (e.g. PKT, UTC+5) don't miss alerts for interviews whose EST date
      // is still "today" while their local calendar date is already "tomorrow".
      const today = getTodayEst();
      const tomorrow = getTomorrowEst();
      const interviews = await interviewsService.list({
        date_from: today,
        date_to: tomorrow,
      });
      const now = Date.now();
      const newAlerts: AlertItem[] = [];

      for (const iv of interviews) {
        const ivMs = interviewUtcMs(iv);
        if (ivMs === null) continue;
        const dateStr = iv.interview_date!.split("T")[0]!;

        for (const threshold of THRESHOLDS_MIN) {
          const thresholdTime = ivMs - threshold * 60_000;
          if (
            now >= thresholdTime - WINDOW_MS &&
            now <= thresholdTime + WINDOW_MS &&
            !wasTriggered(iv.id, dateStr, threshold)
          ) {
            markTriggered(iv.id, dateStr, threshold);
            newAlerts.push({ interview: iv, threshold });
          }
        }
      }

      if (newAlerts.length > 0) {
        setQueue((prev) => [...prev, ...newAlerts]);
      }
    } catch (err) {
      console.error("[InterviewAlertMonitor] fetch failed:", err);
    }
  }, []);

  useEffect(() => {
    checkInterviews();
    const id = setInterval(checkInterviews, POLL_MS);
    return () => clearInterval(id);
  }, [checkInterviews]);

  // Start / stop the alarm based on queue presence
  useEffect(() => {
    if (queue.length > 0 && !stopAlarmRef.current) {
      stopAlarmRef.current = startAlarm();
    } else if (queue.length === 0 && stopAlarmRef.current) {
      stopAlarmRef.current();
      stopAlarmRef.current = null;
    }
  }, [queue.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAlarmRef.current?.();
    };
  }, []);

  const dismissCurrent = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  const dismissAll = useCallback(() => {
    setQueue([]);
  }, []);

  if (queue.length === 0) return null;

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

      {/* Full-screen flashing backdrop */}
      <div className="iv-bg fixed inset-0 z-[9999] flex items-center justify-center p-4">
        {/* Alert card */}
        <div className="iv-card-shake bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border-4 border-red-600 w-full max-w-md overflow-hidden">

          {/* Top bar */}
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
            {/* Icon */}
            <div className="text-center mb-4">
              <span className="iv-icon inline-block text-7xl select-none">🚨</span>
            </div>

            {/* Countdown */}
            <div className="text-center mb-5">
              <p className="iv-blink text-6xl font-black text-red-600 dark:text-red-400 tabular-nums leading-none">
                {threshold} MIN
              </p>
              <p className="text-lg font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-widest mt-2">
                Until Interview
              </p>
            </div>

            <hr className="border-gray-200 dark:border-zinc-700 my-5" />

            {/* Interview details */}
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

            {/* Action buttons */}
            <div className="flex gap-3">
              <button
                onClick={dismissAll}
                className="flex-1 py-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-black text-lg rounded-xl uppercase tracking-wider transition-colors shadow-lg shadow-red-500/30"
              >
                Stop Alarm
              </button>
              {queue.length > 1 && (
                <button
                  onClick={dismissCurrent}
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
