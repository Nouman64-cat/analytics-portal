"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useDepartmentContext } from "@/lib/DepartmentContext";
import { Plus, Pencil, Trash2, Loader2, Search, ExternalLink, UserCheck, UserX, X, Building2 } from "lucide-react";
import { candidatesService, interviewsService, leadsService, departmentsService } from "@/lib/services";
import { formatDate, formatInterviewDateEst, getStatusStyle, getStatusLabel, getLeadOutcomeBadgeStyle } from "@/lib/utils";
import type { Candidate, CandidateFormData, Interview, LeadListItem, Department } from "@/lib/types";
import { PageLoader, ErrorState, PageHeader, EmptyState } from "@/components/PageStates";
import Modal, { FormField, inputClass, buttonPrimary, buttonSecondary } from "@/components/Modal";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import { getUserRole } from "@/lib/auth";

function formatMonthLabel(ym: string) {
  const [year, month] = ym.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("default", { month: "long", year: "numeric" });
}

const INTERVIEW_STATUS_ORDER = ["Upcoming", "Unresponsed", "Converted", "Rejected", "Dropped", "Closed", "Dead"];
const LEAD_STATUS_ORDER = ["Active", "In pipeline", "Unresponsive", "Rejected", "Dropped", "Closed", "Dead"];

function sortedStatusColumns(breakdown: Record<string, number>, order: string[]): [string, number][] {
  const result: [string, number][] = [];
  const seen = new Set<string>();
  for (const s of order) {
    if (breakdown[s] !== undefined) {
      result.push([s, breakdown[s]]);
      seen.add(s);
    }
  }
  for (const [s, count] of Object.entries(breakdown)) {
    if (!seen.has(s)) result.push([s, count]);
  }
  return result;
}

function labelToOutcomeKey(label: string): string {
  return label.toLowerCase().replace(/\s+/g, "_");
}

// ─── Department Badge Picker ──────────────────────────────────────────────────

const DEPT_BADGE_COLORS = [
  { bg: "bg-indigo-500/15 hover:bg-indigo-500/25", text: "text-indigo-600 dark:text-indigo-400", border: "border-indigo-500/30", selectedBg: "bg-indigo-500", selectedText: "text-white" },
  { bg: "bg-emerald-500/15 hover:bg-emerald-500/25", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/30", selectedBg: "bg-emerald-500", selectedText: "text-white" },
  { bg: "bg-violet-500/15 hover:bg-violet-500/25", text: "text-violet-600 dark:text-violet-400", border: "border-violet-500/30", selectedBg: "bg-violet-500", selectedText: "text-white" },
  { bg: "bg-amber-500/15 hover:bg-amber-500/25", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/30", selectedBg: "bg-amber-500", selectedText: "text-white" },
  { bg: "bg-sky-500/15 hover:bg-sky-500/25", text: "text-sky-600 dark:text-sky-400", border: "border-sky-500/30", selectedBg: "bg-sky-500", selectedText: "text-white" },
  { bg: "bg-rose-500/15 hover:bg-rose-500/25", text: "text-rose-600 dark:text-rose-400", border: "border-rose-500/30", selectedBg: "bg-rose-500", selectedText: "text-white" },
  { bg: "bg-teal-500/15 hover:bg-teal-500/25", text: "text-teal-600 dark:text-teal-400", border: "border-teal-500/30", selectedBg: "bg-teal-500", selectedText: "text-white" },
  { bg: "bg-orange-500/15 hover:bg-orange-500/25", text: "text-orange-600 dark:text-orange-400", border: "border-orange-500/30", selectedBg: "bg-orange-500", selectedText: "text-white" },
];

function getDeptColor(index: number) {
  return DEPT_BADGE_COLORS[index % DEPT_BADGE_COLORS.length];
}

interface DeptBadgePickerProps {
  departments: Department[];
  selected: string[];
  onChange: (ids: string[]) => void;
}

function DeptBadgePicker({ departments, selected, onChange }: DeptBadgePickerProps) {
  const active = departments.filter(d => d.is_active);

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter(s => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  if (active.length === 0) {
    return (
      <p className="text-sm text-slate-400 dark:text-slate-500 py-2">No departments available.</p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Selected count indicator */}
      {selected.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {selected.length} selected
          </span>
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-xs text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Badge grid */}
      <div className="flex flex-wrap gap-2">
        {active.map((dept, idx) => {
          const color = getDeptColor(idx);
          const isSelected = selected.includes(dept.id);

          return (
            <button
              key={dept.id}
              type="button"
              onClick={() => toggle(dept.id)}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border
                transition-all duration-150 cursor-pointer select-none
                ${isSelected
                  ? `${color.selectedBg} ${color.selectedText} border-transparent shadow-sm`
                  : `${color.bg} ${color.text} ${color.border}`
                }
              `}
            >
              <Building2 size={10} className="shrink-0" />
              {dept.name}
              {isSelected && (
                <X size={10} className="shrink-0 ml-0.5 opacity-80" />
              )}
            </button>
          );
        })}
      </div>

      {selected.length === 0 && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Click departments above to assign this candidate.
        </p>
      )}
    </div>
  );
}

// ─── Candidate Department Badges (card display) ───────────────────────────────

function CandidateDeptBadges({ names, max = 2 }: { names: string[] | null | undefined; max?: number }) {
  if (!names || names.length === 0) return null;
  const visible = names.slice(0, max);
  const overflow = names.length - max;

  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {visible.map((name, idx) => {
        const color = getDeptColor(idx);
        return (
          <span
            key={name}
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${color.bg} ${color.text} ${color.border}`}
          >
            {name}
          </span>
        );
      })}
      {overflow > 0 && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/[0.08]">
          +{overflow} more
        </span>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [allLeads, setAllLeads] = useState<LeadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "inactive">("active");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<CandidateFormData>({ name: "", email: "", department_ids: [] });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<Candidate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const { departmentId } = useDepartmentContext();
  const fetchGenRef = useRef(0);
  const role = getUserRole();
  const cannotCRUD = role === "bd" || role === "manager" || role === "bd-manager" || role === "guest";
  const isSuperadmin = role === "superadmin";

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    interviews.forEach(i => { if (i.interview_date) months.add(i.interview_date.slice(0, 7)); });
    return [...months].sort().reverse();
  }, [interviews]);

  const monthFilteredInterviews = useMemo(() => {
    if (selectedMonth === "all") return interviews;
    return interviews.filter(i => i.interview_date?.startsWith(selectedMonth));
  }, [interviews, selectedMonth]);

  const interviewCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    monthFilteredInterviews.forEach(i => {
      if (!i.candidate_id) return;
      counts[i.candidate_id] = (counts[i.candidate_id] || 0) + 1;
    });
    return counts;
  }, [monthFilteredInterviews]);

  const interviewStatusBreakdown = useMemo(() => {
    const bd: Record<string, Record<string, number>> = {};
    monthFilteredInterviews.forEach(i => {
      if (!i.candidate_id) return;
      const s = i.computed_status || "Unresponsed";
      if (!bd[i.candidate_id]) bd[i.candidate_id] = {};
      bd[i.candidate_id][s] = (bd[i.candidate_id][s] || 0) + 1;
    });
    return bd;
  }, [monthFilteredInterviews]);

  const leadStatusBreakdown = useMemo(() => {
    const bd: Record<string, Record<string, number>> = {};
    const activeThreadIds = selectedMonth === "all"
      ? null
      : new Set(monthFilteredInterviews.filter(i => i.thread_id).map(i => i.thread_id!));

    allLeads.forEach(l => {
      if (!l.candidate_id) return;
      if (activeThreadIds && !activeThreadIds.has(l.thread_id)) return;
      const label = l.lead_status_label || l.lead_outcome || "Unknown";
      if (!bd[l.candidate_id]) bd[l.candidate_id] = {};
      bd[l.candidate_id][label] = (bd[l.candidate_id][label] || 0) + 1;
    });
    return bd;
  }, [allLeads, selectedMonth, monthFilteredInterviews]);

  const leadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [id, statusMap] of Object.entries(leadStatusBreakdown)) {
      counts[id] = Object.values(statusMap).reduce((a, b) => a + b, 0);
    }
    return counts;
  }, [leadStatusBreakdown]);

  const convertedLeadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const activeThreadIds = selectedMonth === "all"
      ? null
      : new Set(monthFilteredInterviews.filter(i => i.thread_id).map(i => i.thread_id!));
    allLeads.forEach(l => {
      if (!l.candidate_id) return;
      if (activeThreadIds && !activeThreadIds.has(l.thread_id)) return;
      if (l.is_converted) {
        counts[l.candidate_id] = (counts[l.candidate_id] || 0) + 1;
      }
    });
    return counts;
  }, [allLeads, selectedMonth, monthFilteredInterviews]);

  const legitLeadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const activeThreadIds = selectedMonth === "all"
      ? null
      : new Set(monthFilteredInterviews.filter(i => i.thread_id).map(i => i.thread_id!));
    allLeads.forEach(l => {
      if (!l.candidate_id) return;
      if (activeThreadIds && !activeThreadIds.has(l.thread_id)) return;
      if (l.lead_outcome !== "dropped") {
        counts[l.candidate_id] = (counts[l.candidate_id] || 0) + 1;
      }
    });
    return counts;
  }, [allLeads, selectedMonth, monthFilteredInterviews]);

  const filteredCandidates = useMemo(() => {
    if (!search.trim()) return candidates;
    const q = search.toLowerCase();
    return candidates.filter(c => c.name.toLowerCase().includes(q));
  }, [candidates, search]);

  const fetchData = useCallback(async () => {
    const gen = ++fetchGenRef.current;
    try {
      setLoading(true);
      setError(null);
      const deptParam = departmentId ? { department_id: departmentId } : {};
      const [data, interviewsData, leadsPage] = await Promise.all([
        candidatesService.list({ department_id: departmentId, is_active: activeTab === "active" }),
        interviewsService.list(departmentId ? { department_id: departmentId } : undefined),
        leadsService.list({ page: 1, page_size: 5000, ...deptParam }),
      ]);
      if (gen !== fetchGenRef.current) return;
      setCandidates(data);
      setInterviews(interviewsData);
      setAllLeads(leadsPage.items);
    } catch (err) {
      if (gen !== fetchGenRef.current) return;
      setError(err instanceof Error ? err.message : "Failed to load candidates");
    } finally {
      if (gen === fetchGenRef.current) setLoading(false);
    }
  }, [departmentId, activeTab]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (isSuperadmin) {
      departmentsService.list().then(setDepartments).catch(() => {});
    }
  }, [isSuperadmin]);

  // Kanban modal data
  const selectedCandidate = useMemo(
    () => candidates.find(c => c.id === selectedCandidateId) ?? null,
    [selectedCandidateId, candidates],
  );

  const candidateInterviews = useMemo(
    () => (selectedCandidateId ? interviews.filter(i => i.candidate_id === selectedCandidateId) : []),
    [selectedCandidateId, interviews],
  );

  const candidateLeads = useMemo(
    () => (selectedCandidateId ? allLeads.filter(l => l.candidate_id === selectedCandidateId) : []),
    [selectedCandidateId, allLeads],
  );

  const interviewKanbanColumns = useMemo(() => {
    const groups: Record<string, Interview[]> = {};
    candidateInterviews.forEach(i => {
      const s = i.computed_status || "Unresponsed";
      if (!groups[s]) groups[s] = [];
      groups[s].push(i);
    });
    return sortedStatusColumns(
      Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])),
      INTERVIEW_STATUS_ORDER,
    ).map(([status]) => ({ status, items: groups[status] || [] }));
  }, [candidateInterviews]);

  const leadKanbanColumns = useMemo(() => {
    const groups: Record<string, LeadListItem[]> = {};
    candidateLeads.forEach(l => {
      const label = l.lead_status_label || l.lead_outcome || "Unknown";
      if (!groups[label]) groups[label] = [];
      groups[label].push(l);
    });
    return sortedStatusColumns(
      Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])),
      LEAD_STATUS_ORDER,
    ).map(([label]) => ({ label, items: groups[label] || [] }));
  }, [candidateLeads]);

  const openCreate = () => {
    setEditingId(null);
    // Pre-select current dept scope when available
    const preSelected = departmentId ? [departmentId] : [];
    setFormData({ name: "", email: "", department_ids: preSelected });
    setModalOpen(true);
  };

  const openEdit = (c: Candidate) => {
    setEditingId(c.id);
    // Use multi-dept list if available, fall back to legacy single dept
    const ids = c.department_ids && c.department_ids.length > 0
      ? c.department_ids
      : (c.department_id ? [c.department_id] : []);
    setFormData({ name: c.name, email: c.email ?? "", department_ids: ids });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name,
        email: formData.email?.trim() || null,
        department_ids: formData.department_ids && formData.department_ids.length > 0
          ? formData.department_ids
          : null,
      };
      if (editingId) await candidatesService.update(editingId, payload);
      else await candidatesService.create(payload);
      setModalOpen(false);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    setIsDeleting(true);
    try {
      await candidatesService.delete(deleteModal.id);
      setDeleteModal(null);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleStatus = async (candidate: Candidate, e: React.MouseEvent) => {
    e.stopPropagation();
    if (togglingId) return;
    setTogglingId(candidate.id);
    try {
      await candidatesService.toggleStatus(candidate.id);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setTogglingId(null);
    }
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Candidates"
        subtitle={`${candidates.length} ${activeTab === "active" ? "active" : "inactive"} team member${candidates.length !== 1 ? "s" : ""}`}
        action={
          !cannotCRUD && (
            <button onClick={openCreate} className={buttonPrimary}>
              <Plus size={16} />
              Add Candidate
            </button>
          )
        }
      />

      {/* Active / Inactive Tab */}
      {!cannotCRUD && (
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.06] w-fit">
          <button
            onClick={() => { setActiveTab("active"); setSelectedMonth("all"); }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === "active"
                ? "bg-white dark:bg-[#1a1d2b] text-emerald-600 dark:text-emerald-400 shadow-sm border border-slate-200 dark:border-white/[0.08]"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <UserCheck size={14} />
            Active
          </button>
          <button
            onClick={() => { setActiveTab("inactive"); setSelectedMonth("all"); }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              activeTab === "inactive"
                ? "bg-white dark:bg-[#1a1d2b] text-rose-600 dark:text-rose-400 shadow-sm border border-slate-200 dark:border-white/[0.08]"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            <UserX size={14} />
            Inactive
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative sm:max-w-sm">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-500" />
        <input
          type="text"
          placeholder="Search candidates..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={`${inputClass} pl-10`}
        />
      </div>

      {/* Month Filter */}
      {availableMonths.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">Filter by month:</span>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedMonth("all")}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${selectedMonth === "all" ? "bg-emerald-500 text-white" : "bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.10]"}`}
            >
              All Time
            </button>
            {availableMonths.map(ym => (
              <button
                key={ym}
                onClick={() => setSelectedMonth(ym)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${selectedMonth === ym ? "bg-emerald-500 text-white" : "bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.10]"}`}
              >
                {formatMonthLabel(ym)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Candidate Grid */}
      {candidates.length === 0 ? (
        <EmptyState message="No candidates yet" />
      ) : filteredCandidates.length === 0 ? (
        <EmptyState message="No candidates match your search" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
          {filteredCandidates.map(candidate => {
            const interviewCount = interviewCounts[candidate.id] || 0;
            const leadCount = leadCounts[candidate.id] || 0;
            const legitLeadCount = legitLeadCounts[candidate.id] || 0;
            const breakdown = leadStatusBreakdown[candidate.id] || {};
            const converted = convertedLeadCounts[candidate.id] || 0;
            const rejected  = (breakdown["Rejected"]  || 0) + (breakdown["rejected"] || 0) + (breakdown["Dead"] || 0) + (breakdown["dead"] || 0);
            const dropped   = (breakdown["Dropped"]   || 0) + (breakdown["dropped"] || 0);
            const isInactive = !candidate.is_active;

            // Department display: prefer multi-dept names, fall back to legacy
            const deptNames = candidate.department_names && candidate.department_names.length > 0
              ? candidate.department_names
              : (candidate.department_name ? [candidate.department_name] : []);

            return (
              <div
                key={candidate.id}
                onClick={() => setSelectedCandidateId(candidate.id)}
                className={`group cursor-pointer relative overflow-hidden rounded-2xl border bg-white dark:bg-[#12141c] p-5 transition-all duration-300 hover:shadow-lg hover:shadow-black/20 ${
                  isInactive
                    ? "border-slate-200/60 dark:border-white/[0.04] opacity-70 hover:opacity-90 hover:border-slate-300 dark:hover:border-white/[0.08]"
                    : "border-slate-200 dark:border-white/[0.06] hover:border-emerald-300/50 dark:hover:border-emerald-500/30"
                }`}
              >
                <div className={`absolute -right-6 -top-6 h-24 w-24 rounded-full blur-2xl transition-all group-hover:opacity-80 ${
                  isInactive ? "bg-slate-400/10" : "bg-gradient-to-br from-emerald-500/10 to-teal-500/10"
                }`} />
                <div className="relative">
                  {!cannotCRUD && (
                    <div className="flex justify-end gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 mb-2">
                      <button
                        onClick={(e) => handleToggleStatus(candidate, e)}
                        disabled={togglingId === candidate.id}
                        title={isInactive ? "Mark as Active" : "Mark as Inactive"}
                        className={`rounded-lg p-1.5 transition-colors ${
                          isInactive
                            ? "text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-600"
                            : "text-slate-500 dark:text-slate-500 hover:bg-amber-500/10 hover:text-amber-500"
                        }`}
                      >
                        {togglingId === candidate.id
                          ? <Loader2 size={13} className="animate-spin" />
                          : isInactive ? <UserCheck size={13} /> : <UserX size={13} />}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); openEdit(candidate); }}
                        className="rounded-lg p-1.5 text-slate-500 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:text-white transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteModal(candidate); }}
                        className="rounded-lg p-1.5 text-slate-500 dark:text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}

                  {/* Avatar + interview/lead count */}
                  <div className="flex items-center justify-between">
                    <div className={`flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold ${
                      isInactive
                        ? "bg-slate-200/50 dark:bg-white/[0.05] text-slate-400 dark:text-slate-500"
                        : "bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-300"
                    }`}>
                      {candidate.name[0]}
                    </div>
                    <div className="text-right">
                      <p className="text-4xl font-bold tracking-tight tabular-nums">
                        <span className="text-slate-900 dark:text-white">{interviewCount}</span>
                        <span className="mx-1 text-slate-300 dark:text-slate-600 font-light">/</span>
                        <span className="text-slate-500 dark:text-slate-400">{leadCount}</span>
                        <span className="mx-1 text-slate-300 dark:text-slate-600 font-light">/</span>
                        <span className="text-teal-600 dark:text-teal-400">{legitLeadCount}</span>
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                        Interviews / Leads / Legit
                      </p>
                    </div>
                  </div>

                  {/* Candidate info */}
                  <div className="mt-3 border-t border-slate-100 dark:border-white/[0.04] pt-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{candidate.name}</p>
                      {isInactive && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200/80 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400 border border-slate-300/50 dark:border-white/[0.08]">
                          Inactive
                        </span>
                      )}
                    </div>
                    {/* Multi-department badges */}
                    <CandidateDeptBadges names={deptNames} max={2} />
                    {candidate.email && (
                      <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{candidate.email}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-500">Added {formatDate(candidate.created_at)}</p>
                  </div>

                  {/* Lead outcome badges */}
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 dark:border-white/[0.04] pt-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      converted > 0
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                        : "bg-slate-100 dark:bg-white/[0.04] text-slate-400 dark:text-slate-500 border-slate-200 dark:border-white/[0.06]"
                    }`}>
                      ✅ {converted} Progressed
                    </span>
                    {rejected > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20">
                        ❌ {rejected} Rejected
                      </span>
                    )}
                    {dropped > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        🚫 {dropped} Dropped
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit Candidate" : "Add Candidate"} size="sm">
        <FormField label="Full Name">
          <input
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Nouman Ejaz"
            className={inputClass}
            autoFocus
          />
        </FormField>
        <FormField label="Email (for interview notifications)">
          <input
            type="email"
            value={formData.email ?? ""}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
            placeholder="candidate@example.com"
            className={inputClass}
            autoComplete="email"
          />
        </FormField>
        {isSuperadmin && (
          <FormField label="Departments">
            <div className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.02] p-3">
              <DeptBadgePicker
                departments={departments}
                selected={formData.department_ids ?? []}
                onChange={ids => setFormData({ ...formData, department_ids: ids })}
              />
            </div>
          </FormField>
        )}
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setModalOpen(false)} className={buttonSecondary}>Cancel</button>
          <button onClick={handleSubmit} disabled={isSubmitting} className={`${buttonPrimary} disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2`}>
            {isSubmitting && <Loader2 className="animate-spin" size={16} />}
            {editingId ? (isSubmitting ? "Updating..." : "Update") : (isSubmitting ? "Creating..." : "Create")}
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
        title="Delete Candidate"
        itemName={deleteModal?.name ?? ""}
      />

      {/* Kanban Detail Modal */}
      <Modal
        open={!!selectedCandidateId}
        onClose={() => setSelectedCandidateId(null)}
        title={selectedCandidate?.name ?? ""}
        size="xl"
      >
        {selectedCandidate && (
          <div className="space-y-8">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] px-4 py-3 text-center">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{candidateInterviews.length}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-0.5">Total Interviews</p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] px-4 py-3 text-center">
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{candidateLeads.length}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mt-0.5">Total Leads</p>
              </div>
            </div>

            {/* Interviews Kanban */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
                Interviews by Status
              </p>
              {candidateInterviews.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 py-6 text-center">No interviews yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="flex gap-3 min-w-max pb-2">
                    {interviewKanbanColumns.map(({ status, items }) => {
                      const style = getStatusStyle(status);
                      return (
                        <div key={status} className="w-48 flex-shrink-0 flex flex-col">
                          <div className={`flex items-center justify-between rounded-t-lg px-3 py-2 ${style.bg}`}>
                            <span className={`text-[10px] font-semibold uppercase tracking-wider ${style.text}`}>{getStatusLabel(status)}</span>
                            <span className={`text-xs font-bold tabular-nums ${style.text}`}>{items.length}</span>
                          </div>
                          <div className="flex-1 space-y-2 rounded-b-lg border border-t-0 border-slate-100 dark:border-white/[0.05] bg-slate-50 dark:bg-white/[0.02] p-2">
                            {items.map(iv => (
                              <div
                                key={iv.id}
                                onClick={() => { setSelectedCandidateId(null); router.push(`/interviews?id=${iv.id}`); }}
                                className="group/card cursor-pointer rounded-lg border border-slate-100 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-2.5 transition-all hover:border-emerald-300/50 dark:hover:border-emerald-500/30 hover:shadow-sm"
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <p className="text-xs font-semibold text-slate-900 dark:text-white leading-snug truncate">{iv.company_name || "—"}</p>
                                  <ExternalLink size={10} className="shrink-0 mt-0.5 text-slate-400 opacity-0 group-hover/card:opacity-100 transition-opacity" />
                                </div>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{iv.role}</p>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                                  Round {iv.round} · {formatInterviewDateEst(iv.interview_date, iv.time_est)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Leads Kanban */}
            <div>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-3">
                Leads by Status
              </p>
              {candidateLeads.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 py-6 text-center">No leads yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <div className="flex gap-3 min-w-max pb-2">
                    {leadKanbanColumns.map(({ label, items }) => {
                      const style = getLeadOutcomeBadgeStyle(labelToOutcomeKey(label));
                      return (
                        <div key={label} className="w-48 flex-shrink-0 flex flex-col">
                          <div className={`flex items-center justify-between rounded-t-lg px-3 py-2 ${style.bg}`}>
                            <span className={`text-[10px] font-semibold uppercase tracking-wider ${style.text}`}>{label}</span>
                            <span className={`text-xs font-bold tabular-nums ${style.text}`}>{items.length}</span>
                          </div>
                          <div className="flex-1 space-y-2 rounded-b-lg border border-t-0 border-slate-100 dark:border-white/[0.05] bg-slate-50 dark:bg-white/[0.02] p-2">
                            {items.map(lead => (
                              <div
                                key={lead.thread_id}
                                onClick={lead.first_interview_id ? () => { setSelectedCandidateId(null); router.push(`/interviews?id=${lead.first_interview_id}`); } : undefined}
                                className={`group/card rounded-lg border border-slate-100 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-2.5 transition-all ${lead.first_interview_id ? "cursor-pointer hover:border-emerald-300/50 dark:hover:border-emerald-500/30 hover:shadow-sm" : ""}`}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <p className="text-xs font-semibold text-slate-900 dark:text-white leading-snug truncate">{lead.company_name || "—"}</p>
                                  {lead.first_interview_id && (
                                    <ExternalLink size={10} className="shrink-0 mt-0.5 text-slate-400 opacity-0 group-hover/card:opacity-100 transition-opacity" />
                                  )}
                                </div>
                                {lead.primary_role && (
                                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">{lead.primary_role}</p>
                                )}
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                                  {lead.interview_count} {lead.interview_count === 1 ? "round" : "rounds"}
                                  {lead.primary_bd_name ? ` · ${lead.primary_bd_name}` : ""}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
