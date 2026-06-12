"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Loader2, Search, Layers, Shield, Pencil, ToggleLeft, ToggleRight } from "lucide-react";
import { departmentsService } from "@/lib/services";
import { formatDate } from "@/lib/utils";
import type { Department, DepartmentFormData } from "@/lib/types";
import { PageLoader, ErrorState, PageHeader, EmptyState } from "@/components/PageStates";
import Modal, { FormField, inputClass, buttonPrimary, buttonSecondary } from "@/components/Modal";
import { getUserRole } from "@/lib/auth";

export default function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<DepartmentFormData>({ name: "", slug: "", is_active: true });
  const [search, setSearch] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const role = getUserRole();
  const isSuperadmin = role === "superadmin";
  const canView = isSuperadmin || role === "bd-manager" || role === "guest";

  const filteredDepartments = useMemo(() => {
    if (!search.trim()) return departments;
    const q = search.toLowerCase();
    return departments.filter(
      (d) => d.name.toLowerCase().includes(q) || d.slug.toLowerCase().includes(q)
    );
  }, [departments, search]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await departmentsService.list();
      setDepartments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load departments");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canView) {
      fetchData();
    } else {
      setLoading(false);
      setError("Access denied.");
    }
  }, [fetchData, canView]);

  const openCreate = () => {
    setEditingId(null);
    setFormData({ name: "", slug: "", is_active: true });
    setModalOpen(true);
  };

  const openEdit = (dept: Department) => {
    setEditingId(dept.id);
    setFormData({ name: dept.name, slug: dept.slug, is_active: dept.is_active });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!formData.name.trim() || !formData.slug.trim()) {
      alert("Please fill in all fields");
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingId) {
        const updated = await departmentsService.update(editingId, formData);
        setDepartments((prev) => prev.map((d) => (d.id === editingId ? updated : d)));
      } else {
        const created = await departmentsService.create(formData);
        setDepartments((prev) => [...prev, created]);
      }
      setModalOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${editingId ? "update" : "create"} department`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (dept: Department) => {
    setTogglingId(dept.id);
    try {
      const updated = await departmentsService.update(dept.id, { name: dept.name, slug: dept.slug, is_active: !dept.is_active });
      setDepartments((prev) => prev.map((d) => (d.id === dept.id ? updated : d)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update department");
    } finally {
      setTogglingId(null);
    }
  };

  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Shield size={48} className="text-red-500/50" />
        <h2 className="text-xl font-bold dark:text-white">Access Denied</h2>
        <p className="text-slate-500 dark:text-slate-400">This page is restricted to Superadmins only.</p>
      </div>
    );
  }

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Departments"
        subtitle={`${departments.length} department${departments.length !== 1 ? "s" : ""}`}
        action={
          isSuperadmin ? (
            <button onClick={openCreate} className={buttonPrimary}>
              <Plus size={16} />
              Add Department
            </button>
          ) : undefined
        }
      />

      <div className="relative sm:max-w-sm">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search departments..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} pl-10`}
        />
      </div>

      {departments.length === 0 ? (
        <EmptyState message="No departments found" />
      ) : filteredDepartments.length === 0 ? (
        <EmptyState message="No departments match your search" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Name</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Slug</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Status</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Users</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Created</th>
                  {isSuperadmin && <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredDepartments.map((dept) => (
                  <tr
                    key={dept.id}
                    className={`border-b border-slate-200 dark:border-white/[0.06] last:border-b-0 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.02] ${!dept.is_active ? "opacity-60" : ""}`}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md">
                          <Layers size={14} className="text-white" />
                        </div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          {dept.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <code className="text-[13px] font-mono text-slate-400 dark:text-slate-500">
                        /{dept.slug}
                      </code>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        dept.is_active
                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                      }`}>
                        {dept.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500 dark:text-slate-400">
                      {dept.user_count}
                    </td>
                    <td className="px-5 py-4 text-slate-500 dark:text-slate-400 text-[13px] whitespace-nowrap">
                      {formatDate(dept.created_at)}
                    </td>
                    {isSuperadmin && (
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(dept)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors"
                            title="Edit"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleToggleActive(dept)}
                            disabled={togglingId === dept.id}
                            className={`rounded-lg p-1.5 transition-colors disabled:opacity-50 ${
                              dept.is_active
                                ? "text-emerald-500 hover:bg-emerald-500/10"
                                : "text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.06]"
                            }`}
                            title={dept.is_active ? "Deactivate" : "Activate"}
                          >
                            {togglingId === dept.id ? (
                              <Loader2 className="animate-spin" size={14} />
                            ) : dept.is_active ? (
                              <ToggleRight size={14} />
                            ) : (
                              <ToggleLeft size={14} />
                            )}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Department" : "Add Department"}
        size="sm"
      >
        <div className="space-y-4">
          <FormField label="Name">
            <input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Engineering"
              className={inputClass}
              autoFocus
            />
          </FormField>
          <FormField label="Slug">
            <input
              value={formData.slug}
              onChange={(e) =>
                setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") })
              }
              placeholder="e.g., engineering"
              className={`${inputClass} font-mono`}
            />
          </FormField>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button onClick={() => setModalOpen(false)} className={buttonSecondary}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`${buttonPrimary} disabled:opacity-70 flex items-center gap-2`}
          >
            {isSubmitting && <Loader2 className="animate-spin" size={16} />}
            {isSubmitting ? (editingId ? "Updating..." : "Creating...") : (editingId ? "Update" : "Create")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
