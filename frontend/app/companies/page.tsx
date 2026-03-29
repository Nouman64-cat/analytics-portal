"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { companiesService } from "@/lib/services";
import { formatDate } from "@/lib/utils";
import type { Company, CompanyFormData } from "@/lib/types";
import { PageLoader, ErrorState, PageHeader, EmptyState } from "@/components/PageStates";
import Modal, { FormField, inputClass, buttonPrimary, buttonSecondary } from "@/components/Modal";

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CompanyFormData>({ name: "" });

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
    setFormData({ name: "", staffing_firm: "" });
    setModalOpen(true);
  };

  const openEdit = (company: Company) => {
    setEditingId(company.id);
    setFormData({ name: company.name, staffing_firm: company.staffing_firm || "" });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      const payload = { ...formData };
      if (!payload.staffing_firm) delete payload.staffing_firm;
      if (editingId) {
        await companiesService.update(editingId, payload);
      } else {
        await companiesService.create(payload);
      }
      setModalOpen(false);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this company? Associated interviews will also fail.")) return;
    try {
      await companiesService.delete(id);
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
                    {company.staffing_firm && (
                      <p className="text-xs text-slate-500 dark:text-slate-500">via {company.staffing_firm}</p>
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
                    onClick={() => handleDelete(company.id)}
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
          <FormField label="Staffing Firm (optional)">
            <input
              value={formData.staffing_firm || ""}
              onChange={(e) => setFormData({ ...formData, staffing_firm: e.target.value })}
              placeholder="e.g., Recruiting Agency"
              className={inputClass}
            />
          </FormField>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setModalOpen(false)} className={buttonSecondary}>Cancel</button>
          <button onClick={handleSubmit} className={buttonPrimary}>
            {editingId ? "Update" : "Create"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
