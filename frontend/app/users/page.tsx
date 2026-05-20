"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Loader2, Search, UserCog, Mail, Shield, Calendar, Pencil, Trash2 } from "lucide-react";
import { usersService, departmentsService, candidatesService, authService } from "@/lib/services";
import { formatDate } from "@/lib/utils";
import type { User, UserFormData, Department } from "@/lib/types";
import { PageLoader, ErrorState, PageHeader, EmptyState } from "@/components/PageStates";
import Modal, { FormField, inputClass, buttonPrimary, buttonSecondary } from "@/components/Modal";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import { getUserRole, getUserDeptId } from "@/lib/auth";

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<UserFormData>({
    full_name: "",
    email: "",
    role: "team-member",
    department_id: null,
    allowed_dept_ids: null,
  });
  const [search, setSearch] = useState("");
  const [deleteModal, setDeleteModal] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [alsoCandidate, setAlsoCandidate] = useState(false);

  const role = getUserRole();
  const isSuperadmin = role === "superadmin";
  const isDeptLead = role === "dept-lead";
  const isBdTeamLead = role === "bd-team-lead";
  const myDeptId = getUserDeptId();
  const hasAccess = isSuperadmin || isDeptLead || isBdTeamLead;

  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);

  // Departments the current bd-team-lead is allowed to operate in
  const myAllowedDepts = useMemo(() => {
    if (!isBdTeamLead) return departments.filter((d) => d.is_active);
    const allowed = currentUserProfile?.allowed_dept_ids;
    if (allowed === null || allowed === undefined) return [];
    if (allowed.length === 0) return departments.filter((d) => d.is_active);
    return departments.filter((d) => d.is_active && allowed.includes(d.id));
  }, [isBdTeamLead, currentUserProfile, departments]);

  const isMultiDeptBdLead = isBdTeamLead && myAllowedDepts.length > 1;

  const deptMap = useMemo(() => {
    const m: Record<string, string> = {};
    departments.forEach((d) => { m[d.id] = d.name; });
    return m;
  }, [departments]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [users, search]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await usersService.list();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasAccess) {
      fetchData();
      if (isSuperadmin || isBdTeamLead || isDeptLead) {
        departmentsService.list().then(setDepartments).catch(() => {});
      }
      if (isBdTeamLead) {
        authService.getMe().then(setCurrentUserProfile).catch(() => {});
      }
    } else {
      setLoading(false);
      setError("Access denied.");
    }
  }, [fetchData, hasAccess, isSuperadmin]);

  const openCreate = () => {
    setEditingId(null);
    setFormData({ full_name: "", email: "", role: "team-member", department_id: null, allowed_dept_ids: null });
    setAlsoCandidate(false);
    setModalOpen(true);
  };

  const openEdit = (user: User) => {
    setEditingId(user.id);
    setFormData({
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      department_id: user.department_id ?? null,
      allowed_dept_ids: user.allowed_dept_ids ?? null,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!formData.full_name || !formData.email || !formData.role) {
      alert("Please fill in all fields");
      return;
    }
    if (isMultiDeptBdLead && formData.role !== "bd" && formData.role !== "bd-team-lead" && !formData.department_id) {
      alert("Please select a department for this user");
      return;
    }
    
    setIsSubmitting(true);
    try {
      if (editingId) {
        await usersService.update(editingId, formData);
      } else {
        await usersService.create(formData);
        if (alsoCandidate) {
          await candidatesService.create({
            name: formData.full_name,
            email: formData.email,
            department_id: formData.department_id,
          });
        }
      }
      setModalOpen(false);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${editingId ? 'update' : 'create'} user`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    setIsDeleting(true);
    try {
      await usersService.delete(deleteModal.id);
      setDeleteModal(null);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Shield size={48} className="text-red-500/50" />
        <h2 className="text-xl font-bold dark:text-white">Access Denied</h2>
        <p className="text-slate-500 dark:text-slate-400">This page is restricted to Superadmins, Dept Leads, and BD Team Leads.</p>
      </div>
    );
  }

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="User Management"
        subtitle={(isDeptLead || isBdTeamLead) ? `${users.length} users in your department` : `${users.length} registered accounts`}
        action={
          <button onClick={openCreate} className={buttonPrimary}>
            <Plus size={16} />
            Add User
          </button>
        }
      />

      {/* Search */}
      <div className="relative sm:max-w-sm">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search by name, email or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} pl-10`}
        />
      </div>

      {users.length === 0 ? (
        <EmptyState message="No users found" />
      ) : filteredUsers.length === 0 ? (
        <EmptyState message="No users match your search" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 stagger-children">
          {filteredUsers.map((user) => (
            <div
              key={user.id}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-5 transition-all duration-300 hover:border-indigo-300/50 dark:hover:border-indigo-500/30 hover:shadow-lg"
            >
              <div className="absolute right-3 top-3 flex items-center gap-1">
                <button
                  onClick={(e) => { e.stopPropagation(); openEdit(user); }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors"
                  title="Edit User"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteModal(user); }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                  title="Delete User"
                >
                  <Trash2 size={13} />
                </button>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-sm font-bold text-white shadow-md">
                  {getInitials(user.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="mb-3">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                      {user.full_name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        user.role === 'superadmin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                        user.role === 'manager' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                        user.role === 'dept-lead' ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20' :
                        user.role === 'bd-team-lead' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                        'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                      }`}>
                        {user.role}
                      </span>
                      {(user.role === "bd" || user.role === "bd-team-lead") ? (
                        user.allowed_dept_ids !== null && user.allowed_dept_ids.length === 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20">
                            All Departments
                          </span>
                        ) : Array.isArray(user.allowed_dept_ids) && user.allowed_dept_ids.length > 0 ? (
                          user.allowed_dept_ids.map((id) => deptMap[id] && (
                            <span key={id} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-teal-500/10 text-teal-500 dark:text-teal-400 border border-teal-500/20">
                              {deptMap[id]}
                            </span>
                          ))
                        ) : user.department_id && deptMap[user.department_id] ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20">
                            {deptMap[user.department_id]}
                          </span>
                        ) : null
                      ) : (
                        user.department_id && deptMap[user.department_id] && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20">
                            {deptMap[user.department_id]}
                          </span>
                        )
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
                    <div className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400">
                      <Mail size={14} className="shrink-0" />
                      <span className="truncate">{user.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-slate-400">
                      <Calendar size={14} className="shrink-0" />
                      <span>{formatDate(user.created_at)}</span>
                    </div>
                  </div>
                  {user.must_change_password && (
                    <div className="mt-4 inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-500/10 text-amber-500 text-[11px] font-medium border border-amber-500/20">
                      <Shield size={12} />
                      Pending Password Change
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit User" : "Add New User"}
        size="sm"
      >
        <div className="space-y-4">
          <FormField label="Full Name">
            <input
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="e.g., Nouman Ejaz"
              className={inputClass}
              autoFocus
            />
          </FormField>
          <FormField label="Email Address">
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="user@example.com"
              className={inputClass}
            />
          </FormField>
          <FormField label="Role">
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value, department_id: null, allowed_dept_ids: null })}
              className={inputClass}
            >
              <option value="team-member">Team Member</option>
              <option value="bd">Business Developer</option>
              {isSuperadmin && <option value="dept-lead">Dept Lead</option>}
              {isSuperadmin && <option value="bd-team-lead">BD Team Lead</option>}
              {isSuperadmin && <option value="manager">Manager</option>}
              {isSuperadmin && <option value="superadmin">Superadmin</option>}
            </select>
          </FormField>

          {!editingId && formData.role === "team-member" && (
            <button
              type="button"
              onClick={() => setAlsoCandidate((v) => !v)}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 dark:border-white/[0.08] px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]"
            >
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Also add as candidate</p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Creates a matching candidate profile with the same name and email.</p>
              </div>
              <div className={`relative ml-4 h-6 w-11 shrink-0 rounded-full transition-colors ${alsoCandidate ? "bg-indigo-500" : "bg-slate-200 dark:bg-white/10"}`}>
                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${alsoCandidate ? "translate-x-5" : "translate-x-0"}`} />
              </div>
            </button>
          )}

          {isSuperadmin && (formData.role === "team-member" || formData.role === "dept-lead") && (
            <FormField label="Department">
              <select
                value={formData.department_id ?? ""}
                onChange={(e) => setFormData({ ...formData, department_id: e.target.value || null })}
                className={inputClass}
              >
                <option value="">— Select department —</option>
                {departments.filter((d) => d.is_active).map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </FormField>
          )}

          {isMultiDeptBdLead && formData.role !== "bd" && formData.role !== "bd-team-lead" && (
            <FormField label="Department">
              <select
                value={formData.department_id ?? ""}
                onChange={(e) => setFormData({ ...formData, department_id: e.target.value || null })}
                className={inputClass}
              >
                <option value="">— Select department —</option>
                {myAllowedDepts.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </FormField>
          )}
          {!isMultiDeptBdLead && (isBdTeamLead || isDeptLead) && myDeptId && (
            <div className="p-3 rounded-xl bg-slate-500/10 border border-slate-500/20">
              <p className="text-[12px] text-slate-400 leading-relaxed font-medium">
                This user will be assigned to your department: <span className="text-white">{deptMap[myDeptId] ?? "your department"}</span>.
              </p>
            </div>
          )}

          {(formData.role === "bd" || formData.role === "bd-team-lead") && (isSuperadmin || isMultiDeptBdLead) && (
            <div className="space-y-2">
              <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Department Access</p>
              <div className="flex flex-wrap gap-2">
                {/* All badge — superadmin only; bd-team-leads can't grant beyond their own scope */}
                {isSuperadmin && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, allowed_dept_ids: [] })}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                      formData.allowed_dept_ids !== null && formData.allowed_dept_ids.length === 0
                        ? "bg-indigo-500 text-white border-indigo-500"
                        : "bg-transparent text-slate-500 dark:text-slate-400 border-slate-300 dark:border-white/20 hover:border-indigo-400 hover:text-indigo-400"
                    }`}
                  >
                    All
                  </button>
                )}
                {/* Per-department badges scoped to what this user can grant */}
                {(isSuperadmin ? departments.filter((d) => d.is_active) : myAllowedDepts).map((d) => {
                  const selected = Array.isArray(formData.allowed_dept_ids) && formData.allowed_dept_ids.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        const current = Array.isArray(formData.allowed_dept_ids) && formData.allowed_dept_ids.length > 0
                          ? formData.allowed_dept_ids
                          : [];
                        const next = selected
                          ? current.filter((id) => id !== d.id)
                          : [...current, d.id];
                        setFormData({ ...formData, allowed_dept_ids: next.length ? next : null });
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                        selected
                          ? "bg-teal-500 text-white border-teal-500"
                          : "bg-transparent text-slate-500 dark:text-slate-400 border-slate-300 dark:border-white/20 hover:border-teal-400 hover:text-teal-400"
                      }`}
                    >
                      {d.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-500">
                {formData.allowed_dept_ids === null
                  ? "No restriction set — defaults to role behavior."
                  : formData.allowed_dept_ids.length === 0
                    ? "All departments — no restriction."
                    : `Restricted to ${formData.allowed_dept_ids.length} department(s).`}
              </p>
            </div>
          )}

          {editingId ? (
            <div className="mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-[12px] text-amber-500 leading-relaxed font-medium">
                Note: Updating user details will not reset their password.
              </p>
            </div>
          ) : (
            <div className="mt-2 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
              <p className="text-[12px] text-indigo-400 leading-relaxed font-medium">
                A temporary password will be automatically generated and emailed to the user. 
                They will be required to change it upon their first login.
              </p>
            </div>
          )}
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button onClick={() => setModalOpen(false)} className={buttonSecondary}>Cancel</button>
          <button 
            onClick={handleSubmit} 
            disabled={isSubmitting} 
            className={`${buttonPrimary} disabled:opacity-70 flex items-center gap-2`}
          >
            {isSubmitting && <Loader2 className="animate-spin" size={16} />}
            {isSubmitting ? (editingId ? "Updating..." : "Creating...") : (editingId ? "Update User" : "Create User")}
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
        title="Delete User"
        itemName={deleteModal?.full_name ?? ""}
        itemDetail={deleteModal?.email}
      />
    </div>
  );
}
