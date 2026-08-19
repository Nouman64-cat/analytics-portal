"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Check, RefreshCw, ShieldCheck, TrendingUp, Users } from "lucide-react";
import { API_V1 } from "@/lib/constants";

interface PublicStats {
  generated_at: string;
  departments: { id: string; name: string }[];
  selected_departments: { id: string; name: string }[];
  interviews: {
    legit: number;
    total: number;
    dropped: number;
    by_status: Record<string, number>;
    by_department: { name: string; legit: number; total: number }[];
  };
  leads: {
    legit: number;
    total: number;
    dropped: number;
    conversion_rate_percent: number;
    by_status: Record<string, number>;
  };
  candidates: {
    active_count: number;
    closing_rate_percent: number;
    rejection_rate_percent: number;
    unresponsive_rate_percent: number;
  };
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: PublicStats };

const INTERVIEW_STATUS_META: Record<
  string,
  { label: string; emoji: string; text: string; bar: string }
> = {
  Upcoming: { label: "Upcoming", emoji: "🙂", text: "text-blue-700", bar: "bg-blue-500" },
  Progressed: { label: "Progressed", emoji: "😄", text: "text-violet-700", bar: "bg-violet-500" },
  Closed: { label: "Closed", emoji: "😌", text: "text-emerald-700", bar: "bg-emerald-500" },
  Unresponsed: { label: "Unresponsed", emoji: "😐", text: "text-amber-700", bar: "bg-amber-500" },
  Rejected: { label: "Rejected", emoji: "😞", text: "text-red-700", bar: "bg-red-500" },
  Dead: { label: "Dead", emoji: "💀", text: "text-stone-700", bar: "bg-stone-500" },
  Dropped: { label: "Dropped", emoji: "🙁", text: "text-orange-700", bar: "bg-orange-500" },
};

const LEAD_STATUS_META: Record<
  string,
  { label: string; emoji: string; text: string; bar: string }
> = {
  active: { label: "Active", emoji: "🟢", text: "text-blue-700", bar: "bg-blue-500" },
  in_pipeline: { label: "In pipeline", emoji: "🔄", text: "text-violet-700", bar: "bg-violet-500" },
  closed: { label: "Closed", emoji: "😌", text: "text-emerald-700", bar: "bg-emerald-500" },
  unresponsive: { label: "Unresponsive", emoji: "😐", text: "text-amber-700", bar: "bg-amber-500" },
  rejected: { label: "Rejected", emoji: "😞", text: "text-red-700", bar: "bg-red-500" },
  dead: { label: "Dead", emoji: "💀", text: "text-stone-700", bar: "bg-stone-500" },
  dropped: { label: "Dropped", emoji: "🙁", text: "text-orange-700", bar: "bg-orange-500" },
};

// Only the outcomes stakeholders care about at a glance — pending/dead-end statuses are omitted.
const VISIBLE_INTERVIEW_STATUSES = new Set(["Progressed", "Rejected", "Closed"]);
const VISIBLE_LEAD_STATUSES = new Set(["rejected", "closed"]);

function StatusBar({
  count,
  denom,
  meta,
}: {
  count: number;
  denom: number;
  meta: { label: string; emoji: string; text: string; bar: string };
}) {
  const pct = denom > 0 ? Math.round((count / denom) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-[38px] shrink-0 text-center text-base leading-none" aria-hidden="true">
        {meta.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className={`text-[13px] font-medium ${meta.text}`}>{meta.label}</span>
          <span className="text-[13px] tabular-nums text-slate-500">
            {count} <span className="text-slate-400">({pct}%)</span>
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${meta.bar}`}
            style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function HeroCard({
  title,
  value,
  sublabel,
  accent,
}: {
  title: string;
  value: number;
  sublabel: string;
  accent: string;
}) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl p-5 shadow-[0_2px_20px_rgba(0,0,0,0.05)]">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <p className={`mt-1.5 text-[40px] font-bold leading-none tabular-nums ${accent}`}>
        {value.toLocaleString()}
      </p>
      <p className="mt-2 text-xs text-slate-500">{sublabel}</p>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/70 backdrop-blur-xl p-5 shadow-[0_2px_20px_rgba(0,0,0,0.05)]">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-indigo-600">{icon}</span>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function MetricTile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-3 text-center">
      <p className={`text-xl font-bold tabular-nums ${accent}`}>{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-slate-500">{label}</p>
    </div>
  );
}

export default function PublicStatsPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token as string;
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDeptIds, setSelectedDeptIds] = useState<string[]>([]);

  const toggleDepartment = (id: string) => {
    setSelectedDeptIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const qs = selectedDeptIds.length
        ? "?" +
          selectedDeptIds.map((id) => `department_ids=${encodeURIComponent(id)}`).join("&")
        : "";
      const res = await fetch(`${API_V1}/public/stats/${encodeURIComponent(token)}${qs}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setState({
          status: "error",
          message:
            res.status === 404
              ? "This link is invalid or has been disabled. Ask for a fresh link."
              : `Couldn't load the snapshot (${res.status}). Try again shortly.`,
        });
        return;
      }
      const data = (await res.json()) as PublicStats;
      setState({ status: "ready", data });
    } catch {
      setState({
        status: "error",
        message: "Couldn't reach the server. Check your connection and try again.",
      });
    }
  }, [token, selectedDeptIds]);

  useEffect(() => {
    // Standard fetch-on-mount pattern used throughout this app (e.g. interviews/page.tsx
    // fetchData); the setState happens after an await inside `load`, not synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <div
      className="min-h-screen bg-slate-50 [color-scheme:light]"
      data-theme="light"
      style={{ colorScheme: "light" }}
    >
      <div className="mx-auto w-full max-w-md px-4 py-6 sm:max-w-lg sm:px-6 sm:py-8">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Recruiting Snapshot</h1>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
              <ShieldCheck size={12} />
              Read-only · No login required
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={state.status === "loading" || refreshing}
            className="mt-0.5 flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-600 disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            Refresh
          </button>
        </header>

        {state.status === "ready" && state.data.departments.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedDeptIds([])}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                selectedDeptIds.length === 0
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {selectedDeptIds.length === 0 && <Check size={12} />}
              All
            </button>
            {state.data.departments.map((d) => {
              const active = selectedDeptIds.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDepartment(d.id)}
                  className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "border-indigo-600 bg-indigo-600 text-white"
                      : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {active && <Check size={12} />}
                  {d.name}
                </button>
              );
            })}
          </div>
        )}

        {state.status === "loading" && (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/60" />
            ))}
          </div>
        )}

        {state.status === "error" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
            <p className="text-sm font-medium text-red-800">{state.message}</p>
          </div>
        )}

        {state.status === "ready" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <HeroCard
                title="Interviews"
                value={state.data.interviews.legit}
                sublabel={`of ${state.data.interviews.total} total · ${state.data.interviews.dropped} dropped`}
                accent="text-teal-600"
              />
              <HeroCard
                title="Leads"
                value={state.data.leads.legit}
                sublabel={`of ${state.data.leads.total} total · ${state.data.leads.dropped} dropped`}
                accent="text-indigo-600"
              />
            </div>

            <SectionCard title="Interview outcomes" icon={<TrendingUp size={16} />}>
              {Object.entries(state.data.interviews.by_status)
                .filter(([key, count]) => count > 0 && VISIBLE_INTERVIEW_STATUSES.has(key))
                .sort(([, a], [, b]) => b - a)
                .map(([key, count]) => (
                  <StatusBar
                    key={key}
                    count={count}
                    denom={state.data.interviews.total}
                    meta={
                      INTERVIEW_STATUS_META[key] ?? {
                        label: key,
                        emoji: "•",
                        text: "text-slate-600",
                        bar: "bg-slate-400",
                      }
                    }
                  />
                ))}
            </SectionCard>

            {state.data.interviews.by_department.length > 1 && (
              <SectionCard title="By department" icon={<Users size={16} />}>
                {state.data.interviews.by_department.map((d) => {
                  const pct =
                    state.data.interviews.total > 0
                      ? Math.round((d.total / state.data.interviews.total) * 100)
                      : 0;
                  return (
                    <div key={d.name}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-medium text-slate-700">{d.name}</span>
                        <span className="text-[13px] tabular-nums text-slate-500">
                          {d.legit} legit / {d.total} total
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-indigo-500"
                          style={{ width: `${Math.max(pct, d.total > 0 ? 2 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </SectionCard>
            )}

            <SectionCard title="Lead outcomes" icon={<TrendingUp size={16} />}>
              <div className="mb-1 flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2">
                <span className="text-[12px] font-medium text-indigo-700">Conversion rate</span>
                <span className="text-base font-bold text-indigo-700">
                  {state.data.leads.conversion_rate_percent}%
                </span>
              </div>
              {Object.entries(state.data.leads.by_status)
                .filter(([key, count]) => count > 0 && VISIBLE_LEAD_STATUSES.has(key))
                .sort(([, a], [, b]) => b - a)
                .map(([key, count]) => (
                  <StatusBar
                    key={key}
                    count={count}
                    denom={state.data.leads.total}
                    meta={
                      LEAD_STATUS_META[key] ?? {
                        label: key,
                        emoji: "•",
                        text: "text-slate-600",
                        bar: "bg-slate-400",
                      }
                    }
                  />
                ))}
            </SectionCard>

            <SectionCard title="Candidate performance" icon={<Users size={16} />}>
              <div className="grid grid-cols-2 gap-2.5">
                <MetricTile
                  label="Active candidates"
                  value={String(state.data.candidates.active_count)}
                  accent="text-slate-900"
                />
                <MetricTile
                  label="Closing rate"
                  value={`${state.data.candidates.closing_rate_percent}%`}
                  accent="text-emerald-600"
                />
                <MetricTile
                  label="Rejection rate"
                  value={`${state.data.candidates.rejection_rate_percent}%`}
                  accent="text-red-600"
                />
                <MetricTile
                  label="Unresponsive rate"
                  value={`${state.data.candidates.unresponsive_rate_percent}%`}
                  accent="text-amber-600"
                />
              </div>
              <p className="pt-1 text-[11px] leading-snug text-slate-400">
                Rates are of legit (non-dropped) leads.
              </p>
            </SectionCard>

            <p className="pt-1 text-center text-[11px] text-slate-400">
              Generated{" "}
              {new Date(state.data.generated_at).toLocaleString(undefined, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
