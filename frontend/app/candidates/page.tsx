"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Pencil, Trash2, CalendarCheck, Loader2, Search } from "lucide-react";
import { candidatesService, interviewsService } from "@/lib/services";
import { formatDate } from "@/lib/utils";
import type { Candidate, CandidateWithInterviews, CandidateFormData, Interview } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import { PageLoader, ErrorState, PageHeader, EmptyState } from "@/components/PageStates";
import Modal, { FormField, inputClass, buttonPrimary, buttonSecondary } from "@/components/Modal";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import { getUserRole } from "@/lib/auth";

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<CandidateFormData>({ name: "" });
  const [detailData, setDetailData] = useState<CandidateWithInterviews | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deleteModal, setDeleteModal] = useState<Candidate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const role = getUserRole();
  const cannotCRUD = role === "bd" || role === "manager";

  const [search, setSearch] = useState("");

  const interviewCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    interviews.forEach((i) => {
      counts[i.candidate_id] = (counts[i.candidate_id] || 0) + 1;
    });
    return counts;
  }, [interviews]);

  const filteredCandidates = useMemo(() => {
    if (!search.trim()) return candidates;
    const q = search.toLowerCase();
    return candidates.filter((c) => c.name.toLowerCase().includes(q));
  }, [candidates, search]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, interviewsData] = await Promise.all([
        candidatesService.list(),
        interviewsService.list(),
      ]);
      setCandidates(data);
      setInterviews(interviewsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candidates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const viewDetail = async (id: string) => {
    try {
      setDetailLoading(true);
      setDetailOpen(true);
      const data = await candidatesService.get(id);
      setDetailData(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load details");
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setFormData({ name: "" });
    setModalOpen(true);
  };

  const openEdit = (c: Candidate) => {
    setEditingId(c.id);
    setFormData({ name: c.name });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (editingId) {
        await candidatesService.update(editingId, formData);
      } else {
        await candidatesService.create(formData);
      }
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
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} pl-10`}
        />
      </div>

      {candidates.length === 0 ? (
        <EmptyState message="No candidates yet" />
      ) : filteredCandidates.length === 0 ? (
        <EmptyState message="No candidates match your search" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
          {filteredCandidates.map((candidate) => {
            const count = interviewCounts[candidate.id] || 0;
            return (
              <div
                key={candidate.id}
                onClick={() => viewDetail(candidate.id)}
                className="group cursor-pointer relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-5 transition-all duration-300 hover:border-emerald-300/50 dark:hover:border-emerald-500/30 hover:shadow-lg hover:shadow-black/20"
              >
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-emerald-500/10 to-teal-500/10 blur-2xl transition-all group-hover:opacity-80" />
                <div className="relative">
                  {!cannotCRUD && (
                    <div className="flex justify-end gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 mb-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(candidate); }}
                        className="rounded-lg p-1.5 text-slate-500 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:text-white transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteModal(candidate); }}
                        className="rounded-lg p-1.5 text-slate-500 dark:text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-2xl font-bold text-emerald-300">
                      {candidate.name[0]}
                    </div>
                    <div className="text-right">
                      <p className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">{count}</p>
                      <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                        {count === 1 ? "Interview" : "Interviews"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-slate-100 dark:border-white/[0.04] pt-3">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{candidate.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-500">
                      Added {formatDate(candidate.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Candidate" : "Add Candidate"}
        size="sm"
      >
        <FormField label="Full Name">
          <input
            value={formData.name}
            onChange={(e) => setFormData({ name: e.target.value })}
            placeholder="e.g., Nouman Ejaz"
            className={inputClass}
            autoFocus
          />
        </FormField>
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

      {/* Detail Modal */}
      <Modal
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setDetailData(null); }}
        title={detailData?.name ? `${detailData.name} — Interview History` : "Loading..."}
        size="lg"
      >
        {detailLoading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          </div>
        ) : detailData ? (
          <div className="space-y-3">
            {detailData.interviews.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-500">No interviews yet</p>
            ) : (
              detailData.interviews.map((interview) => (
                <div
                  key={interview.id}
                  className="flex items-center gap-4 rounded-xl bg-slate-100 dark:bg-white/[0.02] p-3.5"
                >
                  <CalendarCheck size={16} className="shrink-0 text-indigo-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {interview.company_name} — {interview.role}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-500">
                      Round {interview.round} · {formatDate(interview.interview_date)}
                    </p>
                  </div>
                  <StatusBadge status={interview.status} dateStr={interview.interview_date} />
                </div>
              ))
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
