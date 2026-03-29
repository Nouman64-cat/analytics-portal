"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, CalendarCheck } from "lucide-react";
import { candidatesService } from "@/lib/services";
import { formatDate } from "@/lib/utils";
import type { Candidate, CandidateWithInterviews, CandidateFormData } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import { PageLoader, ErrorState, PageHeader, EmptyState } from "@/components/PageStates";
import Modal, { FormField, inputClass, buttonPrimary, buttonSecondary } from "@/components/Modal";

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CandidateFormData>({ name: "" });
  const [detailData, setDetailData] = useState<CandidateWithInterviews | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await candidatesService.list();
      setCandidates(data);
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
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this candidate?")) return;
    try {
      await candidatesService.delete(id);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
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
          <button onClick={openCreate} className={buttonPrimary}>
            <Plus size={16} />
            Add Candidate
          </button>
        }
      />

      {candidates.length === 0 ? (
        <EmptyState message="No candidates yet" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
          {candidates.map((candidate) => (
            <div
              key={candidate.id}
              onClick={() => viewDetail(candidate.id)}
              className="group cursor-pointer relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#12141c] p-5 transition-all duration-300 hover:border-white/[0.1] hover:shadow-lg hover:shadow-black/20"
            >
              <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br from-emerald-500/10 to-teal-500/10 blur-2xl transition-all group-hover:opacity-60" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-lg font-bold text-emerald-300">
                    {candidate.name[0]}
                  </div>
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEdit(candidate); }}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-white transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(candidate.id); }}
                      className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-white">{candidate.name}</h3>
                <p className="mt-1 text-[11px] text-slate-500">
                  Added {formatDate(candidate.created_at)}
                </p>
              </div>
            </div>
          ))}
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
          <button onClick={handleSubmit} className={buttonPrimary}>
            {editingId ? "Update" : "Create"}
          </button>
        </div>
      </Modal>

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
              <p className="py-8 text-center text-sm text-slate-500">No interviews yet</p>
            ) : (
              detailData.interviews.map((interview) => (
                <div
                  key={interview.id}
                  className="flex items-center gap-4 rounded-xl bg-white/[0.02] p-3.5"
                >
                  <CalendarCheck size={16} className="shrink-0 text-indigo-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {interview.company_name} — {interview.role}
                    </p>
                    <p className="text-xs text-slate-500">
                      Round {interview.round} · {formatDate(interview.interview_date)}
                    </p>
                  </div>
                  <StatusBadge status={interview.status} />
                </div>
              ))
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
