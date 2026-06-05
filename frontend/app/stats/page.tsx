"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  List,
  Activity,
  Ban,
  CircleSlash,
  Lock,
  Skull,
  Shield,
  Users,
  Search,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { leadsService, candidatesService, authService } from "@/lib/services";
import type { LeadListItem, Candidate } from "@/lib/types";
import { PageLoader, ErrorState, PageHeader } from "@/components/PageStates";
import StatsCard, { StatsGrid } from "@/components/StatsCard";
import Modal from "@/components/Modal";
import { LEAD_STAT_CARD_GRADIENT } from "@/lib/constants";
import { formatDate, getLeadOutcomeBadgeStyle } from "@/lib/utils";
import { getUserRole } from "@/lib/auth";
import { useDepartmentContext } from "@/lib/DepartmentContext";
import { inputClass } from "@/components/Modal";
import DateRangeFilter from "@/components/DateRangeFilter";

interface CandidateStats {
  candidate: Candidate;
  total: number;
  converted: number;
  active: number;
  rejected: number;
  dropped: number;
  closed: number;
  dead: number;
  leads: LeadListItem[];
}

interface ModalState {
  title: string;
  leads: LeadListItem[];
}

function filterLeads(leads: LeadListItem[], key: string): LeadListItem[] {
  if (key === "total") return leads;
  if (key === "converted") return leads.filter((l) => l.is_converted);
  return leads.filter((l) => l.lead_outcome === key);
}

function computeStats(leads: LeadListItem[]) {
  let converted = 0, active = 0, rejected = 0, dropped = 0, closed = 0, dead = 0;
  for (const l of leads) {
    if (l.is_converted) converted++;
    const o = l.lead_outcome;
    if (o === "active") active++;
    else if (o === "rejected") rejected++;
    else if (o === "dropped") dropped++;
    else if (o === "closed") closed++;
    else if (o === "dead") dead++;
  }
  return { total: leads.length, converted, active, rejected, dropped, closed, dead };
}

function LeadsBadge({ outcome, label }: { outcome: string; label: string }) {
  const s = getLeadOutcomeBadgeStyle(outcome);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.bg} ${s.text}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
      {label}
    </span>
  );
}

function ExpandableLeadRow({ lead }: { lead: LeadListItem }) {
  const [expanded, setExpanded] = useState(false);
  const hasNotes = !!(lead.lead_notes?.trim() || lead.bd_notes?.trim());

  return (
    <>
      <tr
        className={`hover:bg-slate-50/80 dark:hover:bg-white/[0.02] ${hasNotes ? "cursor-pointer" : ""}`}
        onClick={() => hasNotes && setExpanded((v) => !v)}
      >
        <td className="py-3 pr-4 w-6">
          {hasNotes ? (
            expanded
              ? <ChevronDown size={14} className="text-slate-400" />
              : <ChevronRight size={14} className="text-slate-400" />
          ) : (
            <span className="w-3.5 inline-block" />
          )}
        </td>
        <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
          {lead.company_name ?? "—"}
        </td>
        <td className="py-3 pr-4 text-slate-600 dark:text-slate-400 max-w-[140px] truncate">
          {lead.primary_role ?? "—"}
        </td>
        <td className="py-3 pr-4 text-slate-600 dark:text-slate-400">
          {lead.candidate_name ?? "—"}
        </td>
        <td className="py-3 pr-4">
          <LeadsBadge outcome={lead.lead_outcome} label={lead.lead_status_label} />
        </td>
        <td className="py-3 pr-4 text-slate-600 dark:text-slate-400">
          {lead.primary_bd_name ?? "—"}
        </td>
        <td className="py-3 pr-4 text-center tabular-nums text-slate-700 dark:text-slate-300">
          {lead.interview_count}
        </td>
        <td className="py-3 text-xs text-slate-500 dark:text-slate-500 whitespace-nowrap">
          {lead.last_interview_date ? formatDate(lead.last_interview_date) : "—"}
        </td>
      </tr>
      {expanded && hasNotes && (
        <tr className="bg-slate-50/60 dark:bg-white/[0.015]">
          <td />
          <td colSpan={7} className="pb-3 pt-1 pr-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {lead.lead_notes?.trim() && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                    Team Notes
                  </p>
                  <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {lead.lead_notes}
                  </p>
                </div>
              )}
              {lead.bd_notes?.trim() && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400 dark:text-indigo-500 mb-1">
                    BD Notes
                  </p>
                  <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {lead.bd_notes}
                  </p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function LeadsModal({ state, onClose }: { state: ModalState; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={state.title} size="xl">
      {state.leads.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-600">No leads in this category.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/[0.06] text-xs uppercase tracking-wider text-slate-500">
                <th className="pb-3 w-6" />
                <th className="pb-3 pr-4 font-medium">Company</th>
                <th className="pb-3 pr-4 font-medium">Role</th>
                <th className="pb-3 pr-4 font-medium">Candidate</th>
                <th className="pb-3 pr-4 font-medium">Status</th>
                <th className="pb-3 pr-4 font-medium">BD</th>
                <th className="pb-3 pr-4 font-medium text-center">Rounds</th>
                <th className="pb-3 font-medium whitespace-nowrap">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/[0.04]">
              {state.leads.map((l) => (
                <ExpandableLeadRow key={l.thread_id} lead={l} />
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[11px] text-slate-400 dark:text-slate-600">
            Rows with notes can be expanded by clicking them.
          </p>
        </div>
      )}
    </Modal>
  );
}

const CANDIDATE_COLORS = [
  { avatar: "bg-indigo-500",  border: "border-indigo-500" },
  { avatar: "bg-rose-500",    border: "border-rose-500"   },
  { avatar: "bg-emerald-500", border: "border-emerald-500"},
  { avatar: "bg-amber-500",   border: "border-amber-500"  },
  { avatar: "bg-sky-500",     border: "border-sky-500"    },
  { avatar: "bg-violet-500",  border: "border-violet-500" },
  { avatar: "bg-orange-500",  border: "border-orange-500" },
  { avatar: "bg-teal-500",    border: "border-teal-500"   },
] as const;

function CandidateSection({
  candidateName,
  leads,
  onOpen,
}: {
  candidateName: string;
  leads: LeadListItem[];
  onOpen: (title: string, leads: LeadListItem[]) => void;
}) {
  const s = computeStats(leads);
  const open = (key: string, label: string) =>
    onOpen(`${candidateName} — ${label}`, filterLeads(leads, key));

  return (
    <StatsGrid cols={6}>
      <StatsCard title="Total Leads" value={s.total} icon={List} gradient={LEAD_STAT_CARD_GRADIENT.total}
        onClick={() => open("total", "Total Leads")} />
      <StatsCard title="Converted" value={s.converted} icon={Activity} gradient={LEAD_STAT_CARD_GRADIENT.converted}
        onClick={() => open("converted", "Converted")} />
      <StatsCard title="Rejected" value={s.rejected} icon={Ban} gradient={LEAD_STAT_CARD_GRADIENT.rejected}
        onClick={() => open("rejected", "Rejected")} />
      <StatsCard title="Dropped" value={s.dropped} icon={CircleSlash} gradient={LEAD_STAT_CARD_GRADIENT.dropped}
        onClick={() => open("dropped", "Dropped")} />
      <StatsCard title="Closed" value={s.closed} icon={Lock} gradient={LEAD_STAT_CARD_GRADIENT.closed}
        onClick={() => open("closed", "Closed")} />
      <StatsCard title="Dead" value={s.dead} icon={Skull} gradient={LEAD_STAT_CARD_GRADIENT.dead}
        onClick={() => open("dead", "Dead")} />
    </StatsGrid>
  );
}

export default function StatsPage() {
  const role = getUserRole();
  const { departmentId } = useDepartmentContext();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [linkedToSuperadmin, setLinkedToSuperadmin] = useState<boolean | null>(role === "bd" ? null : false);

  useEffect(() => {
    if (role === "bd") {
      authService.getMe()
        .then((u) => setLinkedToSuperadmin(u.linked_to_superadmin === true))
        .catch(() => setLinkedToSuperadmin(false));
    }
  }, [role]);

  // null means still checking profile for BD users — treat as pending (show loader)
  const isAllowed = role === "superadmin" || role === "manager" || role === "dept-lead" || role === "bd-manager" || (role === "bd" && linkedToSuperadmin === true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [cands, leadPage] = await Promise.all([
        candidatesService.list(departmentId ? { department_id: departmentId } : {}),
        leadsService.list({ page_size: 5000, department_id: departmentId ?? undefined }),
      ]);
      setCandidates(cands);
      setLeads(leadPage.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    if (isAllowed) fetchData();
  }, [fetchData, isAllowed]);

  const filteredLeads = useMemo(() => {
    return leads.filter((l) => {
      if (dateFrom && (!l.first_interview_date || l.first_interview_date < dateFrom)) return false;
      if (dateTo && (!l.first_interview_date || l.first_interview_date > dateTo)) return false;
      return true;
    });
  }, [leads, dateFrom, dateTo]);

  const candidateStats = useMemo((): CandidateStats[] => {
    const byCandidate = new Map<string, LeadListItem[]>();
    for (const lead of filteredLeads) {
      const key = lead.candidate_id ?? "__none__";
      if (!byCandidate.has(key)) byCandidate.set(key, []);
      byCandidate.get(key)!.push(lead);
    }
    return candidates
      .map((c) => ({ candidate: c, leads: byCandidate.get(c.id) ?? [], ...computeStats(byCandidate.get(c.id) ?? []) }))
      .sort((a, b) => b.total - a.total);
  }, [candidates, filteredLeads]);

  const filteredStats = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidateStats;
    return candidateStats.filter((s) => s.candidate.name.toLowerCase().includes(q));
  }, [candidateStats, search]);

  const openModal = (title: string, filtered: LeadListItem[]) => setModal({ title, leads: filtered });

  const deptStats = useMemo(() => computeStats(filteredLeads), [filteredLeads]);
  const openDept = (key: string, label: string) =>
    openModal(`Department — ${label}`, filterLeads(filteredLeads, key));

  if (role === "bd" && linkedToSuperadmin === null) {
    return <PageLoader />;
  }

  if (!isAllowed) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Shield size={48} className="text-red-500/50" />
        <h2 className="text-xl font-bold dark:text-white">Access Denied</h2>
        <p className="text-slate-500 dark:text-slate-400">This page is restricted to Managers and Superadmins.</p>
      </div>
    );
  }

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <PageHeader
        title="Stats"
        subtitle="Lead performance breakdown by candidate."
        action={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-500" />
              <input
                type="text"
                placeholder="Search candidate…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${inputClass} pl-10 w-48`}
              />
            </div>
            <DateRangeFilter
              from={dateFrom}
              to={dateTo}
              onFromChange={setDateFrom}
              onToChange={setDateTo}
              onClear={() => { setDateFrom(""); setDateTo(""); }}
            />
          </div>
        }
      />

      {/* Department totals */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Department total · {candidates.length} candidate{candidates.length !== 1 ? "s" : ""}
        </h2>
        <StatsGrid cols={6}>
          <StatsCard title="Total Leads" value={deptStats.total} icon={List} gradient={LEAD_STAT_CARD_GRADIENT.total}
            onClick={() => openDept("total", "Total Leads")} />
          <StatsCard title="Converted" value={deptStats.converted} icon={Activity} gradient={LEAD_STAT_CARD_GRADIENT.converted}
            onClick={() => openDept("converted", "Converted")} />
          <StatsCard title="Rejected" value={deptStats.rejected} icon={Ban} gradient={LEAD_STAT_CARD_GRADIENT.rejected}
            onClick={() => openDept("rejected", "Rejected")} />
          <StatsCard title="Dropped" value={deptStats.dropped} icon={CircleSlash} gradient={LEAD_STAT_CARD_GRADIENT.dropped}
            onClick={() => openDept("dropped", "Dropped")} />
          <StatsCard title="Closed" value={deptStats.closed} icon={Lock} gradient={LEAD_STAT_CARD_GRADIENT.closed}
            onClick={() => openDept("closed", "Closed")} />
          <StatsCard title="Dead" value={deptStats.dead} icon={Skull} gradient={LEAD_STAT_CARD_GRADIENT.dead}
            onClick={() => openDept("dead", "Dead")} />
        </StatsGrid>
      </section>

      {/* Per-candidate breakdown */}
      {filteredStats.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-600 space-y-2">
          <Users size={40} className="opacity-40" />
          <p className="text-sm">
            {search.trim() ? "No candidates match your search." : "No candidates found for this department."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {filteredStats.map(({ candidate, leads: cLeads }, idx) => {
            const color = CANDIDATE_COLORS[idx % CANDIDATE_COLORS.length];
            return (
              <section key={candidate.id} className={`border-l-4 pl-4 ${color.border}`}>
                <div className="mb-3 flex items-center gap-2">
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${color.avatar} text-xs font-bold text-white`}>
                    {candidate.name[0].toUpperCase()}
                  </div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{candidate.name}</h2>
                  {cLeads.length === 0 && (
                    <span className="text-[11px] text-slate-400 dark:text-slate-600 italic">no leads yet</span>
                  )}
                </div>
                <CandidateSection candidateName={candidate.name} leads={cLeads} onOpen={openModal} />
              </section>
            );
          })}
        </div>
      )}

      {modal && <LeadsModal state={modal} onClose={() => setModal(null)} />}
    </div>
  );
}
