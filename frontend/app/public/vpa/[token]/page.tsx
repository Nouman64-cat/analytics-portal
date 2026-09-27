"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  Briefcase,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  ListOrdered,
  Phone,
  RefreshCw,
  Sun,
  User,
  UserCheck,
  Video,
} from "lucide-react";
import { API_V1 } from "@/lib/constants";
import { formatTime } from "@/lib/utils";

interface VpaInterview {
  id: string;
  date: string;
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

interface VpaSchedule {
  generated_at: string;
  date_pkt: string;
  start: string;
  end: string;
  department: string | null;
  interviews: VpaInterview[];
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: VpaSchedule };

type Tab = "today" | "upcoming" | "calendar";

const AUTO_REFRESH_MS = 2 * 60 * 1000;
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;
const UPCOMING_DAYS = 14;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Derived statuses that just mean "no outcome recorded yet" — not worth a badge.
const HIDDEN_STATUSES = new Set(["upcoming", "unresponsed"]);

// ---- Date helpers: every date is a PKT "YYYY-MM-DD" string, handled as UTC to dodge DST/offsets.

function pktNow(): Date {
  return new Date(Date.now() + PKT_OFFSET_MS);
}

function pktToday(): string {
  return pktNow().toISOString().slice(0, 10);
}

function pktMinutesNow(): number {
  const d = pktNow();
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatDay(day: string, opts: Intl.DateTimeFormatOptions): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

function relativeDayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  return formatDay(day, { weekday: "long" });
}

/** Mon-first grid covering the whole month: [gridStart, gridEnd]. */
function monthGrid(month: string): { start: string; end: string; days: string[] } {
  const first = `${month}-01`;
  const firstDate = new Date(`${first}T00:00:00Z`);
  const leading = (firstDate.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(
    Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const cells = Math.ceil((leading + daysInMonth) / 7) * 7;
  const start = addDays(first, -leading);
  const days = Array.from({ length: cells }, (_, i) => addDays(start, i));
  return { start, end: days[days.length - 1], days };
}

function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

function groupByDate(list: VpaInterview[]): Map<string, VpaInterview[]> {
  const map = new Map<string, VpaInterview[]>();
  for (const i of list) {
    const bucket = map.get(i.date);
    if (bucket) bucket.push(i);
    else map.set(i.date, [i]);
  }
  return map;
}

// ---- Interview phase (only meaningful for today's interviews)

type Phase = "upcoming" | "soon" | "live" | "done" | "untimed" | "future";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function phaseOf(
  i: VpaInterview,
  today: string,
  now: number,
): { phase: Phase; minsUntil: number } {
  if (i.date > today) return { phase: "future", minsUntil: 0 };
  if (i.date < today) return { phase: "done", minsUntil: 0 };
  if (!i.time_pkt) return { phase: "untimed", minsUntil: 0 };
  const start = toMinutes(i.time_pkt);
  const end = start + (i.duration_minutes || 30);
  if (now >= end) return { phase: "done", minsUntil: 0 };
  if (now >= start) return { phase: "live", minsUntil: 0 };
  const minsUntil = start - now;
  return { phase: minsUntil <= 60 ? "soon" : "upcoming", minsUntil };
}

function formatCountdown(mins: number): string {
  if (mins < 60) return `in ${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `in ${h}h ${m}m` : `in ${h}h`;
}

const PHASE_DOT: Record<Phase, string> = {
  live: "bg-emerald-500 ring-4 ring-emerald-100",
  soon: "bg-amber-500 ring-4 ring-amber-100",
  upcoming: "bg-indigo-500",
  future: "bg-indigo-500",
  untimed: "bg-slate-300",
  done: "bg-slate-300",
};

function PhaseChip({ phase, minsUntil }: { phase: Phase; minsUntil: number }) {
  switch (phase) {
    case "live":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-0.5 text-[11px] font-bold text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          Live
        </span>
      );
    case "soon":
      return (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
          {formatCountdown(minsUntil)}
        </span>
      );
    case "upcoming":
      return (
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
          {formatCountdown(minsUntil)}
        </span>
      );
    case "done":
      return (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
          Done
        </span>
      );
    case "untimed":
      return (
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
          Time TBD
        </span>
      );
    default:
      return null;
  }
}

// ---- Data

function useSchedule(token: string, start: string, end: string, reloadKey: number) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  // Keep showing the last good data for the same range while a background refresh runs.
  const lastRange = useRef("");

  useEffect(() => {
    if (!token) return;
    const range = `${start}_${end}`;
    let cancelled = false;
    if (lastRange.current !== range) {
      lastRange.current = range;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "loading" });
    }
    (async () => {
      try {
        const res = await fetch(
          `${API_V1}/public/vpa/${encodeURIComponent(token)}?start=${start}&end=${end}`,
          { cache: "no-store" },
        );
        if (cancelled) return;
        if (!res.ok) {
          setState({
            status: "error",
            message:
              res.status === 404
                ? "This link is invalid or has been disabled. Ask for a fresh link."
                : `Couldn't load interviews (${res.status}). Try again shortly.`,
          });
          return;
        }
        const data = (await res.json()) as VpaSchedule;
        if (!cancelled) setState({ status: "ready", data });
      } catch {
        if (!cancelled)
          setState({
            status: "error",
            message: "Couldn't reach the server. Check your connection and try again.",
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, start, end, reloadKey]);

  return state;
}

// ---- Pieces

function InterviewCard({
  interview,
  today,
  now,
}: {
  interview: VpaInterview;
  today: string;
  now: number;
}) {
  const [open, setOpen] = useState(false);
  const { phase, minsUntil } = phaseOf(interview, today, now);
  const done = phase === "done";
  const highlight = phase === "live" || phase === "soon";
  const showStatus = !HIDDEN_STATUSES.has(interview.status.toLowerCase());

  return (
    <div className="relative flex gap-3">
      {/* Timeline rail */}
      <div className="flex w-3 shrink-0 flex-col items-center pt-5">
        <span className={`h-2.5 w-2.5 rounded-full ${PHASE_DOT[phase]}`} />
        <span className="mt-1 w-px flex-1 bg-slate-200" />
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`mb-3 min-w-0 flex-1 rounded-2xl border bg-white p-3.5 text-left shadow-sm transition active:scale-[0.99] ${
          highlight ? "border-amber-300 ring-2 ring-amber-100" : "border-slate-200"
        } ${done ? "opacity-60" : ""}`}
      >
        <div className="flex items-start gap-3">
          <div className="w-[84px] shrink-0">
            <p className="whitespace-nowrap text-base font-bold leading-tight tabular-nums text-slate-900">
              {interview.time_pkt ? formatTime(interview.time_pkt) : "—"}
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">PKT</p>
            <p className="mt-1 whitespace-nowrap text-[11px] tabular-nums text-slate-500">
              {interview.time_est ? `${formatTime(interview.time_est)} EST` : "EST —"}
            </p>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-[15px] font-semibold text-slate-900">
                {interview.candidate || "No candidate yet"}
              </p>
              <ChevronDown
                size={16}
                className={`mt-0.5 shrink-0 text-slate-400 transition-transform ${
                  open ? "rotate-180" : ""
                }`}
              />
            </div>
            <p className="truncate text-[13px] text-slate-600">
              {interview.company?.trim() || "Unknown company"}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                {interview.round}
              </span>
              {interview.is_phone_call && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">
                  <Phone size={10} /> Call
                </span>
              )}
              <PhaseChip phase={phase} minsUntil={minsUntil} />
            </div>
          </div>
        </div>

        {open && (
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
            <Detail icon={<Briefcase size={13} />} label="Role" value={interview.role} />
            {interview.resume_profile && (
              <Detail icon={<User size={13} />} label="Profile" value={interview.resume_profile} />
            )}
            {interview.bd && <Detail icon={<UserCheck size={13} />} label="BD" value={interview.bd} />}
            {interview.interviewer && (
              <Detail icon={<User size={13} />} label="Interviewer" value={interview.interviewer} />
            )}
            <Detail
              icon={interview.is_phone_call ? <Phone size={13} /> : <Video size={13} />}
              label="Type"
              value={`${interview.is_phone_call ? "Phone call" : "Video call"}${
                interview.duration_minutes ? ` · ${interview.duration_minutes} min` : ""
              }`}
            />
            {showStatus && <Detail icon={<Clock size={13} />} label="Status" value={interview.status} />}
          </div>
        )}
      </button>
    </div>
  );
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-[13px]">
      <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
      <span className="w-[74px] shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 break-words font-medium text-slate-800">{value}</span>
    </div>
  );
}

function InterviewList({
  interviews,
  today,
  now,
}: {
  interviews: VpaInterview[];
  today: string;
  now: number;
}) {
  return (
    <div>
      {interviews.map((i) => (
        <InterviewCard key={i.id} interview={i} today={today} now={now} />
      ))}
    </div>
  );
}

function NextUpBanner({
  interviews,
  today,
  now,
}: {
  interviews: VpaInterview[];
  today: string;
  now: number;
}) {
  const live = interviews.filter((i) => phaseOf(i, today, now).phase === "live");
  const next = interviews.find((i) => {
    const p = phaseOf(i, today, now).phase;
    return p === "soon" || p === "upcoming";
  });
  const doneCount = interviews.filter((i) => phaseOf(i, today, now).phase === "done").length;

  let title: string;
  let body: React.ReactNode;
  if (live.length) {
    const i = live[0];
    title = live.length > 1 ? `${live.length} interviews happening now` : "Happening now";
    body = (
      <>
        <p className="text-xl font-bold">{i.candidate || "No candidate yet"}</p>
        <p className="text-sm text-white/80">
          {i.company?.trim()} · {i.round} · started {formatTime(i.time_pkt)} PKT
        </p>
      </>
    );
  } else if (next) {
    const { minsUntil } = phaseOf(next, today, now);
    title = `Next up · ${formatCountdown(minsUntil)}`;
    body = (
      <>
        <p className="text-xl font-bold">{next.candidate || "No candidate yet"}</p>
        <p className="text-sm text-white/80">
          {formatTime(next.time_pkt)} PKT
          {next.time_est ? ` · ${formatTime(next.time_est)} EST` : ""}
        </p>
        <p className="text-sm text-white/80">
          {next.company?.trim()} · {next.round}
        </p>
      </>
    );
  } else {
    title = "All done for today";
    body = <p className="text-sm text-white/85">No more timed interviews left today.</p>;
  }

  return (
    <div className="mb-4 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 p-4 text-white shadow-lg shadow-indigo-200">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/75">{title}</p>
      <div className="mt-1 space-y-0.5">{body}</div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Total" value={interviews.length} />
        <Stat label="Left" value={interviews.length - doneCount} />
        <Stat label="Done" value={doneCount} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/15 py-2">
      <p className="text-lg font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-white/75">{label}</p>
    </div>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
      <CalendarDays size={28} className="mx-auto text-slate-300" />
      <p className="mt-2 text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200/60" />
      ))}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
      <p className="text-sm font-medium text-red-800">{message}</p>
    </div>
  );
}

// ---- Views

function TodayView({ token, today, now, reloadKey }: ViewProps) {
  const state = useSchedule(token, today, today, reloadKey);
  if (state.status === "loading") return <Skeleton />;
  if (state.status === "error") return <ErrorBox message={state.message} />;
  const list = state.data.interviews;
  if (!list.length)
    return <EmptyState title="No interviews today" hint="Check Upcoming for the next few days." />;
  return (
    <>
      <NextUpBanner interviews={list} today={today} now={now} />
      <InterviewList interviews={list} today={today} now={now} />
    </>
  );
}

function UpcomingView({ token, today, now, reloadKey }: ViewProps) {
  const start = addDays(today, 1);
  const end = addDays(today, UPCOMING_DAYS);
  const state = useSchedule(token, start, end, reloadKey);
  if (state.status === "loading") return <Skeleton />;
  if (state.status === "error") return <ErrorBox message={state.message} />;
  const groups = [...groupByDate(state.data.interviews).entries()];
  if (!groups.length)
    return (
      <EmptyState
        title={`Nothing in the next ${UPCOMING_DAYS} days`}
        hint="Use the Calendar tab to look further ahead."
      />
    );
  return (
    <div className="space-y-5">
      <p className="text-xs text-slate-500">
        Next {UPCOMING_DAYS} days · {state.data.interviews.length} interview
        {state.data.interviews.length === 1 ? "" : "s"}
      </p>
      {groups.map(([day, list]) => (
        <section key={day}>
          <DayHeading day={day} today={today} count={list.length} />
          <InterviewList interviews={list} today={today} now={now} />
        </section>
      ))}
    </div>
  );
}

function DayHeading({ day, today, count }: { day: string; today: string; count: number }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="text-sm font-bold text-slate-900">
        {relativeDayLabel(day, today)}
        <span className="ml-1.5 font-medium text-slate-500">
          {formatDay(day, { day: "numeric", month: "short" })}
        </span>
      </h2>
      <span className="text-xs font-medium text-slate-500">
        {count} interview{count === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function CalendarView({ token, today, now, reloadKey }: ViewProps) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const grid = monthGrid(month);
  const state = useSchedule(token, grid.start, grid.end, reloadKey);
  const touchX = useRef<number | null>(null);

  const byDate = state.status === "ready" ? groupByDate(state.data.interviews) : new Map();
  const selectedList: VpaInterview[] = byDate.get(selected) ?? [];

  const goMonth = (n: number) => {
    const next = shiftMonth(month, n);
    setMonth(next);
    setSelected(next === today.slice(0, 7) ? today : `${next}-01`);
  };

  return (
    <div>
      <div
        className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 50) goMonth(dx < 0 ? 1 : -1);
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => goMonth(-1)}
            aria-label="Previous month"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <p className="text-[15px] font-bold text-slate-900">
              {formatDay(`${month}-01`, { month: "long", year: "numeric" })}
            </p>
            {month !== today.slice(0, 7) && (
              <button
                type="button"
                onClick={() => {
                  setMonth(today.slice(0, 7));
                  setSelected(today);
                }}
                className="text-[11px] font-semibold text-indigo-600"
              >
                Back to today
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => goMonth(1)}
            aria-label="Next month"
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 active:bg-slate-100"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="grid grid-cols-7 text-center">
          {WEEKDAYS.map((d) => (
            <p key={d} className="pb-1 text-[10px] font-semibold uppercase text-slate-400">
              {d}
            </p>
          ))}
          {grid.days.map((day) => {
            const inMonth = day.startsWith(month);
            const count = byDate.get(day)?.length ?? 0;
            const isToday = day === today;
            const isSelected = day === selected;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelected(day)}
                className="flex h-12 flex-col items-center justify-center"
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] tabular-nums transition ${
                    isSelected
                      ? "bg-indigo-600 font-bold text-white"
                      : isToday
                        ? "font-bold text-indigo-600 ring-1 ring-indigo-300"
                        : inMonth
                          ? "text-slate-800"
                          : "text-slate-300"
                  }`}
                >
                  {Number(day.slice(8))}
                </span>
                <span className="mt-0.5 flex h-1.5 gap-0.5">
                  {Array.from({ length: Math.min(count, 3) }, (_, k) => (
                    <span
                      key={k}
                      className={`h-1.5 w-1.5 rounded-full ${
                        day < today ? "bg-slate-300" : "bg-indigo-500"
                      }`}
                    />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <DayHeading day={selected} today={today} count={selectedList.length} />
        {state.status === "loading" && <Skeleton />}
        {state.status === "error" && <ErrorBox message={state.message} />}
        {state.status === "ready" &&
          (selectedList.length ? (
            <InterviewList interviews={selectedList} today={today} now={now} />
          ) : (
            <EmptyState title="No interviews" hint="Tap a day with dots to see its interviews." />
          ))}
      </div>
    </div>
  );
}

interface ViewProps {
  token: string;
  today: string;
  now: number;
  reloadKey: number;
}

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "today", label: "Today", icon: <Sun size={20} /> },
  { id: "upcoming", label: "Upcoming", icon: <ListOrdered size={20} /> },
  { id: "calendar", label: "Calendar", icon: <CalendarDays size={20} /> },
];

export default function PublicVpaPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token as string;
  const [tab, setTab] = useState<Tab>("today");
  const [today, setToday] = useState(pktToday);
  const [now, setNow] = useState(pktMinutesNow);
  const [reloadKey, setReloadKey] = useState(0);
  const [spinning, setSpinning] = useState(false);

  const refresh = useCallback(() => {
    setReloadKey((k) => k + 1);
    setToday(pktToday());
    setNow(pktMinutesNow());
  }, []);

  useEffect(() => {
    const tick = setInterval(() => {
      setNow(pktMinutesNow());
      setToday(pktToday());
    }, 30 * 1000);
    const reload = setInterval(refresh, AUTO_REFRESH_MS);
    return () => {
      clearInterval(tick);
      clearInterval(reload);
    };
  }, [refresh]);

  const handleRefresh = () => {
    setSpinning(true);
    refresh();
    setTimeout(() => setSpinning(false), 700);
  };

  const nowLabel = formatTime(
    `${String(Math.floor(now / 60)).padStart(2, "0")}:${String(now % 60).padStart(2, "0")}`,
  );
  const viewProps: ViewProps = { token, today, now, reloadKey };

  return (
    // w-full + flex-1: the root <body> is a flex row, so without these the page shrinks to a
    // narrow column and the app's tinted body background shows beside it.
    <div
      className="min-h-dvh w-full flex-1 bg-slate-50 text-slate-900 [color-scheme:light]"
      data-theme="light"
      style={{ colorScheme: "light" }}
    >
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
              AI/ML Interviews
            </p>
            <h1 className="truncate text-[17px] font-bold text-slate-900">
              {tab === "today"
                ? formatDay(today, { weekday: "long", day: "numeric", month: "long" })
                : tab === "upcoming"
                  ? "Upcoming schedule"
                  : "Calendar"}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold tabular-nums text-slate-600">
              <Clock size={11} />
              {nowLabel} PKT
            </span>
            <button
              type="button"
              onClick={handleRefresh}
              aria-label="Refresh"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 active:bg-slate-100"
            >
              <RefreshCw size={15} className={spinning ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 pb-28 pt-4">
        {tab === "today" && <TodayView {...viewProps} />}
        {tab === "upcoming" && <UpcomingView {...viewProps} />}
        {tab === "calendar" && <CalendarView {...viewProps} />}
        <p className="pt-4 text-center text-[11px] text-slate-400">
          Times in PKT, EST shown alongside · auto-refreshes every 2 min
        </p>
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-lg grid-cols-3">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  window.scrollTo({ top: 0 });
                }}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition ${
                  active ? "text-indigo-600" : "text-slate-400"
                }`}
              >
                <span
                  className={`flex h-7 w-12 items-center justify-center rounded-full transition ${
                    active ? "bg-indigo-50" : ""
                  }`}
                >
                  {t.icon}
                </span>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
