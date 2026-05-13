"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useDepartmentContext } from "@/lib/DepartmentContext";
import { Plus, Pencil, Trash2, Loader2, Search, ExternalLink } from "lucide-react";
import { candidatesService, interviewsService, leadsService, departmentsService } from "@/lib/services";
import { formatDate, formatInterviewDateEst, getStatusStyle, getLeadOutcomeBadgeStyle } from "@/lib/utils";
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

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [allLeads, setAllLeads] = useState<LeadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<CandidateFormData>({ name: "", email: "", department_id: null });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<Candidate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const { departmentId } = useDepartmentContext();
  const role = getUserRole();
  const cannotCRUD = role === "bd" || role === "manager";
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

  const filteredCandidates = useMemo(() => {
    if (!search.trim()) return candidates;
    const q = search.toLowerCase();
    return candidates.filter(c => c.name.toLowerCase().includes(q));
  }, [candidates, search]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const deptParam = departmentId ? { department_id: departmentId } : {};
      const [data, interviewsData, leadsPage] = await Promise.all([
        candidatesService.list({ department_id: departmentId }),
        interviewsService.list(departmentId ? { department_id: departmentId } : undefined),
        leadsService.list({ page: 1, page_size: 5000, ...deptParam }),
      ]);
      setCandidates(data);
      setInterviews(interviewsData);
      setAllLeads(leadsPage.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candidates");
    } finally {
      setLoading(false);
    }
  }, [departmentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (isSuperadmin) {
      departmentsService.list().then(setDepartments).catch(() => {});
    }
  }, [isSuperadmin]);

  // Kanban modal data — derived from already-loaded state, no extra API call
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

  const openCreate = () => { setEditingId(null); setFormData({ name: "", email: "", department_id: departmentId ?? null }); setModalOpen(true); };
  const openEdit = (c: Candidate) => { setEditingId(c.id); setFormData({ name: c.name, email: c.email ?? "", department_id: c.department_id ?? null }); setModalOpen(true); };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const payload = { name: formData.name, email: formData.email?.trim() || null, department_id: formData.department_id || null };
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

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Candidates"
        subtitle={`${candidates.length} team members`}
        action={
          !cannotCRUD && (
            <button onClick={openCreate} className={buttonPrimary}>
              <Plus size={16} />
              Add Candidate
            </button>
          )
        }
      />

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
            const iBreakdown = interviewStatusBreakdown[candidate.id] || {};
            const lBreakdown = leadStatusBreakdown[candidate.id] || {};
            const iCols = sortedStatusColumns(iBreakdown, INTERVIEW_STATUS_ORDER);
            const lCols = sortedStatusColumns(lBreakdown, LEAD_STATUS_ORDER);

            return (
              <div
                key={candidate.id}
                onClick={() => setSelectedCandidateId(candidate.id)}
                className="group cursor-pointer relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-5 transition-all duration-300 hover:border-emerald-300/50 dark:hover:border-emerald-500/30 hover:shadow-lg hover:shadow-black/20"
              >
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-emerald-500/10 to-teal-500/10 blur-2xl transition-all group-hover:opacity-80" />
                <div className="relative">
                  {!cannotCRUD && (
                    <div className="flex justify-end gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 mb-2">
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

                  {/* Avatar + interview count */}
                  <div className="flex items-center justify-between">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-2xl font-bold text-emerald-300">
                      {candidate.name[0]}
                    </div>
                    <div className="text-right">
                      <p className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">{interviewCount}</p>
                      <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                        {interviewCount === 1 ? "Interview" : "Interviews"}
                      </p>
                    </div>
                  </div>

                  {/* Interview status breakdown */}
                  {iCols.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1">
                      {iCols.map(([status, count]) => {
                        const style = getStatusStyle(status);
                        return (
                          <span key={status} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
                            <span className={`h-1 w-1 rounded-full ${style.dot}`} />
                            {count} {status}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Leads count + status breakdown */}
                  <div className="mt-3 rounded-lg bg-slate-50 dark:bg-white/[0.03] px-3 py-2 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {leadCount === 1 ? "Lead" : "Leads"}
                      </span>
                      <span className="text-sm font-bold text-slate-800 dark:text-slate-200 tabular-nums">{leadCount}</span>
                    </div>
                    {lCols.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {lCols.map(([label, count]) => {
                          const style = getLeadOutcomeBadgeStyle(labelToOutcomeKey(label));
                          return (
                            <span key={label} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${style.bg} ${style.text}`}>
                              <span className={`h-1 w-1 rounded-full ${style.dot}`} />
                              {count} {label}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Candidate info */}
                  <div className="mt-3 border-t border-slate-100 dark:border-white/[0.04] pt-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{candidate.name}</p>
                      {candidate.department_name && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20">
                          {candidate.department_name}
                        </span>
                      )}
                    </div>
                    {candidate.email && (
                      <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{candidate.email}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-500">Added {formatDate(candidate.created_at)}</p>
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
          <FormField label="Department">
            <select
              value={formData.department_id ?? ""}
              onChange={e => setFormData({ ...formData, department_id: e.target.value || null })}
              className={inputClass}
            >
              <option value="">— Select department —</option>
              {departments.filter(d => d.is_active).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
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
                            <span className={`text-[10px] font-semibold uppercase tracking-wider ${style.text}`}>{status}</span>
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
