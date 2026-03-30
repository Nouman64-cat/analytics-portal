"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, Building2, Loader2 } from "lucide-react";
import { companiesService } from "@/lib/services";
import { formatDate } from "@/lib/utils";
import type { Company, CompanyFormData } from "@/lib/types";
import { PageLoader, ErrorState, PageHeader, EmptyState } from "@/components/PageStates";
import Modal, { FormField, inputClass, buttonPrimary, buttonSecondary } from "@/components/Modal";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<CompanyFormData>({ name: "" });
  const [deleteModal, setDeleteModal] = useState<Company | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await companiesService.list();
      setCompanies(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load companies");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    setFormData({ name: "", is_staffing_firm: false });
    setModalOpen(true);
  };

  const openEdit = (company: Company) => {
    setEditingId(company.id);
    setFormData({ name: company.name, is_staffing_firm: company.is_staffing_firm });
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
          <button onClick={openCreate} className={buttonPrimary}>
            <Plus size={16} />
            Add Company
          </button>
        }
      />

      {companies.length === 0 ? (
        <EmptyState message="No companies yet" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
          {companies.map((company) => (
            <div
              key={company.id}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-5 transition-all duration-300 hover:border-slate-300 dark:border-white/[0.1] hover:shadow-lg hover:shadow-black/20"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 text-sm font-bold text-cyan-300">
                    {company.name[0]}
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{company.name}</h3>
                    {company.is_staffing_firm && (
                      <span className="mt-1 inline-flex items-center rounded-md bg-indigo-50 dark:bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:text-indigo-400 ring-1 ring-inset ring-indigo-700/10 dark:ring-indigo-400/20">
                        Staffing Firm
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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
              </div>
              <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-500">
                Added {formatDate(company.created_at)}
              </p>
            </div>
          ))}
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
        size="sm"
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
