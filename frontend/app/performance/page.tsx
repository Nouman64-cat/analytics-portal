"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Search, X, Shield, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { candidatesService, leadsService, interviewsService } from "@/lib/services";
import { PageLoader, ErrorState, EmptyState } from "@/components/PageStates";
import { inputClass } from "@/components/Modal";
import { getUserRole } from "@/lib/auth";
import CandidateAvatar from "@/components/CandidateAvatar";
import { isNewFeature } from "@/lib/newBadge";
import { useDepartmentContext } from "@/lib/DepartmentContext";
import type { Candidate, LeadListItem, Interview } from "@/lib/types";

type Mode = "leads" | "interviews";

interface CandidateMetrics {
  candidate: Candidate;
  total: number;
  legit: number;
  closed: number;
  rejected: number;
  progressed: number;
  unresponsive: number;
  dropped: number;
  finalRounds: number;
  closingPct: number;
  rejectionPct: number;
  progressedPct: number;
  unresponsedPct: number;
  droppedPct: number;
}

// This app's own established status colors (same as the "Closed/Progressed/Rejected/
// Unresponsed" stat tiles on Leads & Interviews) — kept consistent with the rest of the
// app rather than a foreign palette. Each metric always carries a text label alongside
// its color, so identity never relies on hue alone.
const METRIC_STYLE = {
  closed: { label: "Closing", fill: "bg-emerald-500 dark:bg-emerald-600", text: "text-emerald-600 dark:text-emerald-400" },
  progressed: { label: "Progressed", fill: "bg-violet-500 dark:bg-violet-600", text: "text-violet-600 dark:text-violet-400" },
  rejected: { label: "Rejection", fill: "bg-red-500 dark:bg-red-600", text: "text-red-600 dark:text-red-400" },
  unresponsive: { label: "Unresponsed", fill: "bg-amber-500 dark:bg-amber-600", text: "text-amber-600 dark:text-amber-400" },
} as const;

// Kept separate from METRIC_STYLE — dropped has a different denominator (% of all,
// not legit) and needed a color clearly distinct from Rejection's red.
const DROPPED_STYLE = { label: "Dropped", fill: "bg-blue-500 dark:bg-blue-600", text: "text-blue-600 dark:text-blue-400" };

const METRIC_ORDER = ["closed", "progressed", "rejected", "unresponsive"] as const;

function pct(count: number, denom: number): number {
  return denom > 0 ? Math.round((count / denom) * 1000) / 10 : 0;
}

export default function PerformancePage() {
  const { departmentId } = useDepartmentContext();
  const router = useRouter();
  const role = getUserRole();
  const isSuperadmin = role === "superadmin";
  const isDeptLead = role === "dept-lead";
  const isBdTeamLead = role === "bd-team-lead";
  const hasAccess = isSuperadmin || isDeptLead || isBdTeamLead;

  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("interviews");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const fetchGenRef = useRef(0);

  const fetchData = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    try {
      setLoading(true);
      setError(null);
      const deptParam = departmentId ? { department_id: departmentId } : {};
      const [candidatesData, leadsPage, interviewsData] = await Promise.all([
        candidatesService.list({ department_id: departmentId }),
        leadsService.list({ page: 1, page_size: 5000, ...deptParam }),
        interviewsService.list(departmentId ? { department_id: departmentId } : undefined),
      ]);
      if (gen !== fetchGenRef.current) return;
      setCandidates(candidatesData);
      setLeads(leadsPage.items);
      setInterviews(interviewsData);
    } catch (err) {
      if (gen !== fetchGenRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load candidate analysis");
    } finally {
      if (gen === fetchGenRef.current) setLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    if (hasAccess) fetchData();
    else setLoading(false);
  }, [fetchData, hasAccess]);

  const leadsMetrics = useMemo<CandidateMetrics[]>(() => {
    const byCandidate = new Map<string, LeadListItem[]>();
    leads.forEach((l) => {
      if (!l.candidate_id) return;
      const arr = byCandidate.get(l.candidate_id) ?? [];
      arr.push(l);
      byCandidate.set(l.candidate_id, arr);
    });
    return candidates
      .filter((c) => byCandidate.has(c.id))
      .map((candidate) => {
        const rows = byCandidate.get(candidate.id)!;
        const total = rows.length;
        const dropped = rows.filter((l) => l.lead_outcome === "dropped").length;
        const legit = total - dropped;
        const closed = rows.filter((l) => l.lead_outcome === "closed").length;
        const rejected = rows.filter((l) => l.lead_outcome === "rejected" || l.lead_outcome === "dead").length;
        const unresponsive = rows.filter((l) => l.lead_outcome === "unresponsive").length;
        const progressed = rows.filter((l) => l.lead_outcome === "active").length;
        const finalRounds = rows.filter((l) => l.last_round?.toLowerCase().includes("final")).length;
        return {
          candidate,
          total,
          legit,
          closed,
          rejected,
          progressed,
          unresponsive,
          dropped,
          finalRounds,
          closingPct: pct(closed, legit),
          rejectionPct: pct(rejected, legit),
          progressedPct: pct(progressed, legit),
          unresponsedPct: pct(unresponsive, legit),
          droppedPct: pct(dropped, total),
        };
      });
  }, [candidates, leads]);

  const interviewsMetrics = useMemo<CandidateMetrics[]>(() => {
    const byCandidate = new Map<string, Interview[]>();
    interviews.forEach((i) => {
      if (!i.candidate_id) return;
      const arr = byCandidate.get(i.candidate_id) ?? [];
      arr.push(i);
      byCandidate.set(i.candidate_id, arr);
    });
    return candidates
      .filter((c) => byCandidate.has(c.id))
      .map((candidate) => {
        const rows = byCandidate.get(candidate.id)!;
        const total = rows.length;
        const dropped = rows.filter((i) => i.lead_outcome === "dropped").length;
        const legit = total - dropped;
        let closed = 0, rejected = 0, unresponsive = 0, progressed = 0;
        rows.forEach((i) => {
          const label = i.computed_status.toLowerCase();
          if (label === "upcoming") return;
          else if (label === "unresponsed") unresponsive++;
          else if (label.includes("converted") || label.includes("progressed")) progressed++;
          else if (label.includes("rejected")) rejected++;
          else if (label === "dead") rejected++;
          else if (label.includes("closed")) closed++;
          // "dropped" computed_status rows are already captured via lead_outcome above
        });
        const finalRounds = rows.filter((i) => i.round?.toLowerCase().includes("final")).length;
        return {
          candidate,
          total,
          legit,
          closed,
          rejected,
          progressed,
          unresponsive,
          dropped,
          finalRounds,
          closingPct: pct(closed, legit),
          rejectionPct: pct(rejected, legit),
          progressedPct: pct(progressed, legit),
          unresponsedPct: pct(unresponsive, legit),
          droppedPct: pct(dropped, total),
        };
      });
  }, [candidates, interviews]);

  const activeMetrics = mode === "leads" ? leadsMetrics : interviewsMetrics;

  const filteredMetrics = useMemo(() => {
    let base = activeMetrics;
    if (statusFilter !== "all") {
      base = base.filter((m) => (statusFilter === "active" ? m.candidate.is_active !== false : m.candidate.is_active === false));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      base = base.filter((m) => m.candidate.name.toLowerCase().includes(q));
    }
    return [...base].sort((a, b) => b.legit - a.legit);
  }, [activeMetrics, statusFilter, search]);

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Shield size={48} className="text-red-500/50" />
        <h2 className="text-xl font-bold dark:text-white">Access Denied</h2>
        <p className="text-slate-500 dark:text-slate-400">This page is restricted to Superadmins, Dept Leads, and BD Team Leads.</p>
      </div>
    );
  }

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Performance</h1>
            {isNewFeature("/performance") && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                New
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {filteredMetrics.length} candidate{filteredMetrics.length !== 1 ? "s" : ""} with {mode} data
          </p>
        </div>
        {/* Commented out to restrict page to interviews only:
        <div className="flex gap-1.5 rounded-full bg-slate-100 dark:bg-white/[0.06] p-1 shrink-0">
          {(["leads", "interviews"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                mode === m
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        */}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-xs flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search candidates..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} pl-10 pr-9`}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex gap-1.5 rounded-full bg-slate-100 dark:bg-white/[0.06] p-1 shrink-0">
          {(["active", "inactive", "all"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                statusFilter === s
                  ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {filteredMetrics.length === 0 ? (
        <EmptyState message={`No candidates with ${mode} data in this scope yet`} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/[0.06] text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-500">
                  <th className="px-4 py-3 font-semibold">Candidate</th>
                  <th className="px-4 py-3 font-semibold text-right">Legit / Total</th>
                  <th className="px-4 py-3 font-semibold w-32">Breakdown</th>
                  <th className={`px-4 py-3 font-semibold text-right ${METRIC_STYLE.closed.text}`}>Closing</th>
                  <th className={`px-4 py-3 font-semibold text-right ${METRIC_STYLE.progressed.text}`}>Progressed</th>
                  <th className={`px-4 py-3 font-semibold text-right ${METRIC_STYLE.rejected.text}`}>Rejection</th>
                  <th className={`px-4 py-3 font-semibold text-right ${METRIC_STYLE.unresponsive.text}`}>Unresponsed</th>
                  <th className={`px-4 py-3 font-semibold text-right ${DROPPED_STYLE.text}`} title="% of all leads/interviews, not just legit">Dropped</th>
                  <th className="px-4 py-3 font-semibold text-right text-teal-600 dark:text-teal-400" title="Interviews/leads that reached a round containing 'Final'">Final Rounds</th>
                </tr>
              </thead>
              <tbody>
                {filteredMetrics.map((m) => {
                  const pctByKey: Record<(typeof METRIC_ORDER)[number], number> = {
                    closed: m.closingPct,
                    progressed: m.progressedPct,
                    rejected: m.rejectionPct,
                    unresponsive: m.unresponsedPct,
                  };
                  return (
                    <tr
                      key={m.candidate.id}
                      onClick={() => router.push(`/performance/${m.candidate.id}`)}
                      className="border-b border-slate-100 dark:border-white/[0.04] last:border-b-0 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <CandidateAvatar candidate={m.candidate} size={20} />
                          <span className="font-medium text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{m.candidate.name}</span>
                          <ChevronRight size={14} className="text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {m.legit} / {m.total}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
                          {METRIC_ORDER.map((key) => {
                            const pctValue = pctByKey[key];
                            if (pctValue <= 0) return null;
                            return (
                              <div
                                key={key}
                                title={`${METRIC_STYLE[key].label}: ${pctValue}%`}
                                className={`h-full first:rounded-l-full last:rounded-r-full ${METRIC_STYLE[key].fill}`}
                                style={{ width: `${pctValue}%` }}
                              />
                            );
                          })}
                        </div>
                      </td>
                      {METRIC_ORDER.map((key) => (
                        <td key={key} className={`px-4 py-3 text-right font-semibold tabular-nums ${METRIC_STYLE[key].text}`}>
                          {pctByKey[key]}%
                        </td>
                      ))}
                      <td className={`px-4 py-3 text-right font-semibold tabular-nums ${DROPPED_STYLE.text}`}>
                        {m.droppedPct}%
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-teal-600 dark:text-teal-400">
                        {m.finalRounds > 0 ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500" />
                            {m.finalRounds}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600 font-normal">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
