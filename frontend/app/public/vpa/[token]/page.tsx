"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Briefcase, Clock, Phone, RefreshCw, User, UserCheck, Video } from "lucide-react";
import { API_V1 } from "@/lib/constants";
import { formatTime } from "@/lib/utils";

interface VpaInterview {
  id: string;
  time_pkt: string | null;
  time_est: string | null;
  duration_minutes: number | null;
  candidate: string | null;
  resume_profile: string | null;
  company: string | null;
  role: string;
  round: string;
  bd: string | null;
  interviewer: string | null;
  is_phone_call: boolean;
  status: string;
}

interface VpaToday {
  generated_at: string;
  date_pkt: string;
  now_pkt: string;
  department: string | null;
  interviews: VpaInterview[];
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: VpaToday };

const AUTO_REFRESH_MS = 2 * 60 * 1000;
const PKT_OFFSET_MINUTES = 5 * 60;

// Derived statuses that just mean "no outcome recorded yet" — not worth a badge on today's list.
const HIDDEN_STATUSES = new Set(["upcoming", "unresponsed"]);

function nowPktMinutes(): number {
  const d = new Date();
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + PKT_OFFSET_MINUTES) % 1440;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatCountdown(mins: number): string {
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
}

type Phase = "upcoming" | "soon" | "live" | "done" | "untimed";

function phaseOf(i: VpaInterview, now: number): { phase: Phase; minsUntil: number } {
  if (!i.time_pkt) return { phase: "untimed", minsUntil: 0 };
  const start = toMinutes(i.time_pkt);
  const end = start + (i.duration_minutes || 30);
  if (now >= end) return { phase: "done", minsUntil: 0 };
  if (now >= start) return { phase: "live", minsUntil: 0 };
  const minsUntil = start - now;
  return { phase: minsUntil <= 60 ? "soon" : "upcoming", minsUntil };
}

function PhaseChip({ phase, minsUntil }: { phase: Phase; minsUntil: number }) {
  if (phase === "live")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
        In progress
      </span>
    );
  if (phase === "soon")
    return (
      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
        {formatCountdown(minsUntil)}
      </span>
    );
  if (phase === "upcoming")
    return (
      <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700">
        {formatCountdown(minsUntil)}
      </span>
    );
  if (phase === "done")
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
        Done
      </span>
    );
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
      Time TBD
    </span>
  );
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-[13px]">
      <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 break-words font-medium text-slate-800">{value}</span>
    </div>
  );
}

function InterviewCard({ interview, now }: { interview: VpaInterview; now: number }) {
  const { phase, minsUntil } = phaseOf(interview, now);
  const done = phase === "done";
  const highlight = phase === "live" || phase === "soon";
  const showStatus = !HIDDEN_STATUSES.has(interview.status.toLowerCase());

  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-[0_2px_16px_rgba(0,0,0,0.05)] ${
        highlight ? "border-amber-300 ring-2 ring-amber-100" : "border-slate-200"
      } ${done ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[26px] font-bold leading-none tabular-nums text-slate-900">
            {interview.time_pkt ? formatTime(interview.time_pkt) : "—"}
            <span className="ml-1.5 text-xs font-semibold text-slate-500">PKT</span>
          </p>
          <p className="mt-1.5 text-[13px] tabular-nums text-slate-500">
            {interview.time_est ? `${formatTime(interview.time_est)} EST` : "EST not set"}
            {interview.duration_minutes ? ` · ${interview.duration_minutes} min` : ""}
          </p>
        </div>
        <PhaseChip phase={phase} minsUntil={minsUntil} />
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="text-base font-semibold text-slate-900">
          {interview.candidate || "Candidate not assigned"}
        </p>
        <p className="mt-0.5 text-[13px] text-slate-600">
          {interview.company || "Unknown company"}
          <span className="text-slate-300"> · </span>
          {interview.round}
        </p>
      </div>

      <div className="mt-3 space-y-1.5">
        <Detail icon={<Briefcase size={13} />} label="Role" value={interview.role} />
        {interview.resume_profile && (
          <Detail icon={<User size={13} />} label="Profile" value={interview.resume_profile} />
        )}
        {interview.bd && (
          <Detail icon={<UserCheck size={13} />} label="BD" value={interview.bd} />
        )}
        {interview.interviewer && (
          <Detail icon={<User size={13} />} label="Interviewer" value={interview.interviewer} />
        )}
        <Detail
          icon={interview.is_phone_call ? <Phone size={13} /> : <Video size={13} />}
          label="Type"
          value={interview.is_phone_call ? "Phone call" : "Video call"}
        />
      </div>

      {showStatus && (
        <p className="mt-3 inline-block rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600">
          {interview.status}
        </p>
      )}
    </div>
  );
}

export default function PublicVpaPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token as string;
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(nowPktMinutes);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_V1}/public/vpa/${encodeURIComponent(token)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setState({
          status: "error",
          message:
            res.status === 404
              ? "This link is invalid or has been disabled. Ask for a fresh link."
              : `Couldn't load today's interviews (${res.status}). Try again shortly.`,
        });
        return;
      }
      const data = (await res.json()) as VpaToday;
      setState({ status: "ready", data });
    } catch {
      setState({
        status: "error",
        message: "Couldn't reach the server. Check your connection and try again.",
      });
    }
  }, [token]);

  useEffect(() => {
    // Same fetch-on-mount pattern as public/stats; setState happens after an await in `load`.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const refreshTimer = setInterval(load, AUTO_REFRESH_MS);
    return () => clearInterval(refreshTimer);
  }, [load]);

  useEffect(() => {
    const tick = setInterval(() => setNow(nowPktMinutes()), 30 * 1000);
    return () => clearInterval(tick);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setNow(nowPktMinutes());
    setRefreshing(false);
  };

  const interviews = state.status === "ready" ? state.data.interviews : [];
  const remaining = interviews.filter((i) => phaseOf(i, now).phase !== "done").length;
  const dateLabel =
    state.status === "ready"
      ? new Date(`${state.data.date_pkt}T00:00:00`).toLocaleDateString(undefined, {
          weekday: "long",
          day: "numeric",
          month: "long",
        })
      : "";
  const nowLabel = formatTime(
    `${String(Math.floor(now / 60)).padStart(2, "0")}:${String(now % 60).padStart(2, "0")}`,
  );

  return (
    <div
      className="min-h-screen bg-slate-50 [color-scheme:light]"
      data-theme="light"
      style={{ colorScheme: "light" }}
    >
      <div className="mx-auto w-full max-w-md px-4 py-5 sm:max-w-lg sm:px-6 sm:py-8">
        <header className="sticky top-0 z-10 -mx-4 mb-4 bg-slate-50/95 px-4 pb-3 pt-1 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
                {state.status === "ready" ? state.data.department ?? "AI/ML" : "AI/ML"} · Today
              </p>
              <h1 className="truncate text-lg font-bold text-slate-900">
                {dateLabel || "Today's interviews"}
              </h1>
            </div>
            <button
              onClick={handleRefresh}
              disabled={state.status === "loading" || refreshing}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[12px] text-slate-500">
            <Clock size={12} />
            Now {nowLabel} PKT
            {state.status === "ready" && interviews.length > 0 && (
              <>
                <span className="text-slate-300">·</span>
                {remaining} of {interviews.length} remaining
              </>
            )}
          </div>
        </header>

        {state.status === "loading" && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-44 animate-pulse rounded-2xl bg-white/70" />
            ))}
          </div>
        )}

        {state.status === "error" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
            <p className="text-sm font-medium text-red-800">{state.message}</p>
          </div>
        )}

        {state.status === "ready" && interviews.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
            <p className="text-3xl" aria-hidden="true">
              🗓️
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-800">No interviews today</p>
            <p className="mt-1 text-xs text-slate-500">This page refreshes on its own.</p>
          </div>
        )}

        {state.status === "ready" && interviews.length > 0 && (
          <div className="space-y-3">
            {interviews.map((i) => (
              <InterviewCard key={i.id} interview={i} now={now} />
            ))}
          </div>
        )}

        {state.status === "ready" && (
          <p className="pt-5 text-center text-[11px] text-slate-400">
            Updated{" "}
            {new Date(state.data.generated_at).toLocaleTimeString(undefined, {
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            · auto-refreshes every 2 min
          </p>
        )}
      </div>
    </div>
  );
}
