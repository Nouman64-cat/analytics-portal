"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Eye, Pencil, Trash2 } from "lucide-react";
import { interviewsService, companiesService, candidatesService, profilesService } from "@/lib/services";
import { formatDate, formatTime, truncate } from "@/lib/utils";
import type { Interview, Company, Candidate, ResumeProfile, InterviewFormData } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import { PageLoader, ErrorState, PageHeader, EmptyState } from "@/components/PageStates";
import Modal, { FormField, inputClass, selectClass, textareaClass, buttonPrimary, buttonSecondary, buttonDanger } from "@/components/Modal";

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<Interview | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<InterviewFormData>({
    company_id: "",
    candidate_id: "",
    resume_profile_id: "",
    role: "",
    round: "",
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [interviewsData, companiesData, candidatesData, profilesData] = await Promise.all([
        interviewsService.list(),
        companiesService.list(),
        candidatesService.list(),
        profilesService.list(),
      ]);
      setInterviews(interviewsData);
      setCompanies(companiesData);
      setCandidates(candidatesData);
      setProfiles(profilesData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load interviews");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({
      company_id: companies[0]?.id || "",
      candidate_id: candidates[0]?.id || "",
      resume_profile_id: profiles[0]?.id || "",
      role: "",
      round: "1st",
    });
    setModalOpen(true);
  };

  const openEditModal = (interview: Interview) => {
    setEditingId(interview.id);
    setFormData({
      company_id: interview.company_id,
      candidate_id: interview.candidate_id,
      resume_profile_id: interview.resume_profile_id,
      role: interview.role,
      salary_range: interview.salary_range || "",
      round: interview.round,
      interview_date: interview.interview_date || "",
      time_est: interview.time_est || "",
      time_pkt: interview.time_pkt || "",
      status: interview.status || "",
      feedback: interview.feedback || "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const payload = { ...formData };
      // Clean empty strings to undefined
      if (!payload.salary_range) delete payload.salary_range;
      if (!payload.interview_date) delete payload.interview_date;
      if (!payload.time_est) delete payload.time_est;
      if (!payload.time_pkt) delete payload.time_pkt;
      if (!payload.status) delete payload.status;
      if (!payload.feedback) delete payload.feedback;

      if (editingId) {
        await interviewsService.update(editingId, payload);
      } else {
        await interviewsService.create(payload);
      }
      setModalOpen(false);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this interview?")) return;
    try {
      await interviewsService.delete(id);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const filtered = interviews.filter((i) => {
    const q = search.toLowerCase();
    return (
      !q ||
      i.company_name?.toLowerCase().includes(q) ||
      i.candidate_name?.toLowerCase().includes(q) ||
      i.role.toLowerCase().includes(q) ||
      i.status?.toLowerCase().includes(q) ||
      i.resume_profile_name?.toLowerCase().includes(q)
    );
  });

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Interviews"
        subtitle={`${interviews.length} total interviews`}
        action={
          <button onClick={openCreateModal} className={buttonPrimary}>
            <Plus size={16} />
            Add Interview
          </button>
        }
      />

      {/* Search */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-500" />
        <input
          type="text"
          placeholder="Search interviews..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} pl-10`}
        />
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState message="No interviews found" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c]">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Company</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Role</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Candidate</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Profile</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Round</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Date</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Status</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {filtered.map((interview) => (
                  <tr
                    key={interview.id}
                    className="transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-3.5 text-sm font-medium text-slate-900 dark:text-white">
                      {interview.company_name}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-700 dark:text-slate-300 max-w-[200px]">
                      {truncate(interview.role, 40)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-700 dark:text-slate-300">
                      {interview.candidate_name}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-400">
                      {interview.resume_profile_name}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                        {interview.round}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-400">
                      {formatDate(interview.interview_date)}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={interview.status} dateStr={interview.interview_date} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setDetailModal(interview)}
                          className="rounded-lg p-2 text-slate-500 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:text-white transition-colors"
                          title="View details"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={() => openEditModal(interview)}
                          className="rounded-lg p-2 text-slate-500 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:text-white transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(interview.id)}
                          className="rounded-lg p-2 text-slate-500 dark:text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Interview" : "Add Interview"}
        size="lg"
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Company">
            <select
              value={formData.company_id}
              onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
              className={selectClass}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Candidate">
            <select
              value={formData.candidate_id}
              onChange={(e) => setFormData({ ...formData, candidate_id: e.target.value })}
              className={selectClass}
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Resume Profile">
            <select
              value={formData.resume_profile_id}
              onChange={(e) => setFormData({ ...formData, resume_profile_id: e.target.value })}
              className={selectClass}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Round">
            <input
              value={formData.round}
              onChange={(e) => setFormData({ ...formData, round: e.target.value })}
              placeholder="e.g., 1st, 2nd, Recruiter's Call"
              className={inputClass}
            />
          </FormField>
          <div className="col-span-2">
            <FormField label="Role">
              <input
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                placeholder="e.g., Senior ML Engineer"
                className={inputClass}
              />
            </FormField>
          </div>
          <FormField label="Salary Range">
            <input
              value={formData.salary_range || ""}
              onChange={(e) => setFormData({ ...formData, salary_range: e.target.value })}
              placeholder="e.g., $150k - $180k"
              className={inputClass}
            />
          </FormField>
          <FormField label="Interview Date">
            <input
              type="date"
              value={formData.interview_date || ""}
              onChange={(e) => setFormData({ ...formData, interview_date: e.target.value })}
              className={inputClass}
            />
          </FormField>
          <FormField label="Time (EST)">
            <input
              type="time"
              value={formData.time_est || ""}
              onChange={(e) => setFormData({ ...formData, time_est: e.target.value })}
              className={inputClass}
            />
          </FormField>
          <FormField label="Time (PKT)">
            <input
              type="time"
              value={formData.time_pkt || ""}
              onChange={(e) => setFormData({ ...formData, time_pkt: e.target.value })}
              className={inputClass}
            />
          </FormField>
          <div className="col-span-2">
            <FormField label="Status">
              <input
                value={formData.status || ""}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                placeholder="e.g., Converted to 2nd Round"
                className={inputClass}
              />
            </FormField>
          </div>
          <div className="col-span-2">
            <FormField label="Feedback">
              <textarea
                value={formData.feedback || ""}
                onChange={(e) => setFormData({ ...formData, feedback: e.target.value })}
                placeholder="Interview notes and feedback..."
                rows={4}
                className={textareaClass}
              />
            </FormField>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setModalOpen(false)} className={buttonSecondary}>
            Cancel
          </button>
          <button onClick={handleSubmit} className={buttonPrimary}>
            {editingId ? "Update" : "Create"}
          </button>
        </div>
      </Modal>

      {/* Detail Modal */}
      <Modal
        open={!!detailModal}
        onClose={() => setDetailModal(null)}
        title="Interview Details"
        size="lg"
      >
        {detailModal && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Company</p>
                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{detailModal.company_name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Role</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">{detailModal.role}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Candidate</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">{detailModal.candidate_name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Profile</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">{detailModal.resume_profile_name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Round</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">{detailModal.round}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Date</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">{formatDate(detailModal.interview_date)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Time (EST)</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">{formatTime(detailModal.time_est)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Time (PKT)</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">{formatTime(detailModal.time_pkt)}</p>
              </div>
              {detailModal.salary_range && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Salary Range</p>
                  <p className="mt-1 text-sm text-emerald-400">{detailModal.salary_range}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status</p>
                <div className="mt-1"><StatusBadge status={detailModal.status} dateStr={detailModal.interview_date} /></div>
              </div>
            </div>
            {detailModal.feedback && (
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Feedback</p>
                <p className="mt-2 whitespace-pre-wrap rounded-xl bg-white dark:bg-white/[0.03] p-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {detailModal.feedback}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
