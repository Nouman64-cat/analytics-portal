"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Pencil, Trash2, Building2, Loader2, Search } from "lucide-react";
import { companiesService, interviewsService } from "@/lib/services";
import { formatDate } from "@/lib/utils";
import type { Company, CompanyFormData, Interview } from "@/lib/types";
import { PageLoader, ErrorState, PageHeader, EmptyState } from "@/components/PageStates";
import Modal, { FormField, inputClass, textareaClass, buttonPrimary, buttonSecondary } from "@/components/Modal";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import { getUserRole } from "@/lib/auth";

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<CompanyFormData>({ name: "" });
  const [deleteModal, setDeleteModal] = useState<Company | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const role = getUserRole();
  const cannotCRUD = role === "bd" || role === "manager";

  const interviewCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    interviews.forEach((i) => {
      counts[i.company_id] = (counts[i.company_id] || 0) + 1;
    });
    return counts;
  }, [interviews]);

  const filteredCompanies = useMemo(() => {
    if (!search.trim()) return companies;
    const q = search.toLowerCase();
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, search]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [data, interviewsData] = await Promise.all([
        companiesService.list(),
        interviewsService.list(),
      ]);
      setCompanies(data);
      setInterviews(interviewsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load companies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    setFormData({ name: "", is_staffing_firm: false, detail: "" });
    setModalOpen(true);
  };

  const openEdit = (company: Company) => {
    setEditingId(company.id);
    setFormData({ name: company.name, is_staffing_firm: company.is_staffing_firm, detail: company.detail || "" });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const payload = { ...formData };
      if (editingId) {
        await companiesService.update(editingId, payload);
      } else {
        await companiesService.create(payload);
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
      await companiesService.delete(deleteModal.id);
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
        title="Companies"
        subtitle={`${companies.length} companies tracked`}
        action={
          !cannotCRUD && (
            <button onClick={openCreate} className={buttonPrimary}>
              <Plus size={16} />
              Add Company
            </button>
          )
        }
      />

      {/* Search */}
      <div className="relative sm:max-w-sm">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-500" />
        <input
          type="text"
          placeholder="Search companies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} pl-10`}
        />
      </div>

      {companies.length === 0 ? (
        <EmptyState message="No companies yet" />
      ) : filteredCompanies.length === 0 ? (
        <EmptyState message="No companies match your search" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
          {filteredCompanies.map((company) => {
            const count = interviewCounts[company.id] || 0;
            return (
              <div
                key={company.id}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-5 transition-all duration-300 hover:border-cyan-300/50 dark:hover:border-cyan-500/30 hover:shadow-lg hover:shadow-black/20"
              >
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-cyan-500/10 to-blue-500/10 blur-2xl transition-all group-hover:opacity-80" />
                <div className="relative">
                  {!cannotCRUD && (
                    <div className="flex justify-end gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 mb-2">
                      <button
                        onClick={() => openEdit(company)}
                        className="rounded-lg p-1.5 text-slate-500 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:text-white transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteModal(company)}
                        className="rounded-lg p-1.5 text-slate-500 dark:text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col items-start gap-1.5">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-2xl font-bold text-cyan-300">
                        {company.name[0]}
                      </div>
                      {company.is_staffing_firm && (
                        <span className="inline-flex items-center rounded-md bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-400 ring-1 ring-inset ring-indigo-700/10 dark:ring-indigo-400/20">
                          Staffing Firm
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">{count}</p>
                      <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                        {count === 1 ? "Interview" : "Interviews"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-slate-100 dark:border-white/[0.04] pt-3">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{company.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-500">
                      Added {formatDate(company.created_at)}
                    </p>
                    {company.detail && (
                      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">
                        {company.detail}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
        title="Delete Company"
        description="This action cannot be undone. Associated interviews may also be affected."
        itemName={deleteModal?.name ?? ""}
        itemDetail={deleteModal?.is_staffing_firm ? "Staffing Firm" : undefined}
      />

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Company" : "Add Company"}
        size="md"
      >
        <div className="space-y-4">
          <FormField label="Company Name">
            <input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Cisco"
              className={inputClass}
              autoFocus
            />
          </FormField>
          <FormField label="">
            <label className="flex items-center gap-3 cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300 mt-2">
              <input
                type="checkbox"
                checked={!!formData.is_staffing_firm}
                onChange={(e) => setFormData({ ...formData, is_staffing_firm: e.target.checked })}
                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 focus:ring-offset-0 dark:border-white/[0.1] dark:bg-white/[0.04] dark:checked:bg-indigo-500 w-4 h-4 cursor-pointer"
              />
              Is this a Staffing Firm?
            </label>
          </FormField>
          <FormField label="Company Detail">
            <textarea
              value={formData.detail || ""}
              onChange={(e) => setFormData({ ...formData, detail: e.target.value })}
              placeholder="e.g., Notes about the company, recruiter contact, specialization..."
              rows={4}
              className={textareaClass}
            />
          </FormField>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setModalOpen(false)} className={buttonSecondary}>Cancel</button>
          <button onClick={handleSubmit} disabled={isSubmitting} className={`${buttonPrimary} disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2`}>
            {isSubmitting && <Loader2 className="animate-spin" size={16} />}
            {editingId ? (isSubmitting ? "Updating..." : "Update") : (isSubmitting ? "Creating..." : "Create")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
