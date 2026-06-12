"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Loader2, Search, Pencil, Trash2, Shield, Power, Megaphone } from "lucide-react";
import { usersService, departmentsService, candidatesService, authService, businessDevelopersService } from "@/lib/services";
import { formatDate } from "@/lib/utils";
import type { User, UserFormData, Department, BusinessDeveloper } from "@/lib/types";
import { PageLoader, ErrorState, PageHeader, EmptyState } from "@/components/PageStates";
import Modal, { FormField, inputClass, buttonPrimary, buttonSecondary } from "@/components/Modal";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import { getUserRole, getUserDeptId } from "@/lib/auth";

const ROLE_OPTIONS = [
  { value: "all", label: "All Roles" },
  { value: "superadmin", label: "Superadmin" },
  { value: "manager", label: "Manager" },
  { value: "dept-lead", label: "Dept Lead" },
  { value: "bd-team-lead", label: "BD Team Lead" },
  { value: "bd-manager", label: "BD Manager" },
  { value: "bd", label: "Business Developer" },
  { value: "team-member", label: "Team Member" },
  { value: "guest", label: "Guest" },
];

function roleBadgeClass(role: string) {
  switch (role) {
    case "superadmin": return "bg-purple-500/10 text-purple-400 border border-purple-500/20";
    case "manager": return "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20";
    case "dept-lead": return "bg-teal-500/10 text-teal-400 border border-teal-500/20";
    case "bd-team-lead": return "bg-orange-500/10 text-orange-400 border border-orange-500/20";
    case "bd-manager": return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
    case "bd": return "bg-blue-500/10 text-blue-400 border border-blue-500/20";
    case "guest": return "bg-slate-500/10 text-slate-400 border border-slate-500/20";
    default: return "bg-gray-500/10 text-gray-400 border border-gray-500/20";
  }
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
  const [roleFilter, setRoleFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [deleteModal, setDeleteModal] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [businessDevs, setBusinessDevs] = useState<BusinessDeveloper[]>([]);
  const [alsoCandidate, setAlsoCandidate] = useState(false);

  const role = getUserRole();
  const isSuperadmin = role === "superadmin";
  const isDeptLead = role === "dept-lead";
  const isBdTeamLead = role === "bd-team-lead";
  const myDeptId = getUserDeptId();
  const hasAccess = isSuperadmin || isDeptLead || isBdTeamLead;

  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);

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

  // Determine which department options to show in the filter
  const deptOptions = useMemo(() => {
    if (isSuperadmin) return departments.filter((d) => d.is_active);
    if (isDeptLead) return departments.filter((d) => d.is_active && d.id === myDeptId);
    if (isBdTeamLead) return myAllowedDepts;
    return [];
  }, [isSuperadmin, isDeptLead, isBdTeamLead, myDeptId, myAllowedDepts, departments]);

  const userDeptIds = useCallback((u: User): string[] => {
    // Prefer allowed_dept_ids — it carries the full multi-dept list.
    // department_id is just a synced copy of the first entry and would hide the rest.
    if (Array.isArray(u.allowed_dept_ids) && u.allowed_dept_ids.length > 0) return u.allowed_dept_ids;
    if (u.department_id) return [u.department_id];
    return [];
  }, []);

  // Server-side filtered users based on roleFilter and deptFilter
  const filteredUsers = useMemo(() => {
    let result = users;
    if (roleFilter !== "all") {
      result = result.filter((u) => u.role === roleFilter);
    }
    if (deptFilter !== "all") {
      result = result.filter((u) => userDeptIds(u).includes(deptFilter));
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
      );
    }
    return result;
  }, [users, roleFilter, deptFilter, search, userDeptIds]);

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
      departmentsService.list().then(setDepartments).catch(() => {});
      businessDevelopersService.list().then(setBusinessDevs).catch(() => {});
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
    setFormData({ full_name: "", email: "", role: "team-member", department_id: null, allowed_dept_ids: null, bd_entity_id: null, team_lead_user_id: null });
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
      bd_entity_id: user.bd_entity_id ?? null,
      team_lead_user_id: user.team_lead_user_id ?? null,
      can_broadcast: user.can_broadcast ?? false,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!formData.full_name || !formData.email || !formData.role) {
      alert("Please fill in all fields");
      return;
    }
    if (isMultiDeptBdLead && formData.role !== "bd-team-lead" && !formData.department_id) {
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
          // Derive department list from allowed_dept_ids (multi-dept team member) or department_id
          const candidateDeptIds =
            formData.allowed_dept_ids && formData.allowed_dept_ids.length > 0
              ? formData.allowed_dept_ids
              : formData.department_id
              ? [formData.department_id]
              : null;
          await candidatesService.create({
            name: formData.full_name,
            email: formData.email,
            department_ids: candidateDeptIds,
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

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const handleToggleActive = async (user: User) => {
    setTogglingId(user.id);
    try {
      await usersService.toggleActive(user.id);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update user status");
    } finally {
      setTogglingId(null);
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
        subtitle={`${filteredUsers.length} user${filteredUsers.length !== 1 ? 's' : ''} found`}
        action={
          <button onClick={openCreate} className={buttonPrimary}>
            <Plus size={16} />
            Add User
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} pl-10`}
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className={`${inputClass} sm:max-w-[180px]`}
        >
          {ROLE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
          className={`${inputClass} sm:max-w-[200px]`}
        >
          <option value="all">All Departments</option>
          {deptOptions.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>

      {users.length === 0 ? (
        <EmptyState message="No users found" />
      ) : filteredUsers.length === 0 ? (
        <EmptyState message="No users match your filters" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Name</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Email</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Role</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Department</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Created</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Status</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="border-b border-slate-200 dark:border-white/[0.06] last:border-b-0 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-[11px] font-bold text-white">
                          {user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <span className="font-medium text-slate-900 dark:text-white truncate max-w-[180px]">
                          {user.full_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
                      {user.email}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${roleBadgeClass(user.role)}`}>
                          {user.role}
                        </span>
                        {user.can_broadcast && user.role !== "superadmin" && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                            <Megaphone size={9} />
                            Broadcast
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {(() => {
                        const deptIds = userDeptIds(user);
                        if (deptIds.length === 0) {
                          if (Array.isArray(user.allowed_dept_ids) && user.allowed_dept_ids.length === 0) {
                            return <span className="text-slate-400 dark:text-slate-500 text-[13px]">All depts</span>;
                          }
                          return <span className="text-slate-400 dark:text-slate-500">—</span>;
                        }
                        const names = deptIds.map((id) => deptMap[id]).filter(Boolean);
                        if (names.length === 0) return <span className="text-slate-400 dark:text-slate-500">—</span>;
                        return (
                          <div className="flex flex-wrap gap-1">
                            {names.map((name) => (
                              <span key={name} className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20">
                                {name}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-5 py-4 text-slate-500 dark:text-slate-400 text-[13px] whitespace-nowrap">
                      {formatDate(user.created_at)}
                    </td>
                    <td className="px-5 py-4">
                      {user.is_active === false ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-red-500/10 text-red-400 text-[10px] font-medium border border-red-500/20 whitespace-nowrap">
                          <Power size={10} />
                          Inactive
                        </span>
                      ) : user.must_change_password ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-500 text-[10px] font-medium border border-amber-500/20 whitespace-nowrap">
                          <Shield size={10} />
                          Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-[10px] font-medium border border-emerald-500/20 whitespace-nowrap">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleToggleActive(user)}
                          disabled={togglingId === user.id}
                          className={`rounded-lg p-1.5 transition-colors ${
                            user.is_active === false
                              ? "text-emerald-500 hover:bg-emerald-500/10"
                              : "text-slate-400 hover:bg-amber-500/10 hover:text-amber-500"
                          }`}
                          title={user.is_active === false ? "Activate user" : "Deactivate user"}
                        >
                          {togglingId === user.id ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
                        </button>
                        <button
                          onClick={() => openEdit(user)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors"
                          title="Edit User"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => setDeleteModal(user)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                          title="Delete User"
                        >
                          <Trash2 size={13} />
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

      {/* Create / Edit Modal */}
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
              onChange={(e) => setFormData({ ...formData, role: e.target.value, department_id: null, allowed_dept_ids: null, bd_entity_id: null, team_lead_user_id: null })}
              className={inputClass}
            >
              <option value="team-member">Team Member</option>
              <option value="bd">Business Developer</option>
              {isSuperadmin && <option value="dept-lead">Dept Lead</option>}
              {isSuperadmin && <option value="bd-team-lead">BD Team Lead</option>}
              {isSuperadmin && <option value="manager">Manager</option>}
              {isSuperadmin && <option value="bd-manager">BD Manager</option>}
              {isSuperadmin && <option value="superadmin">Superadmin</option>}
              {isSuperadmin && <option value="guest">Guest</option>}
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

          {/* Dept-lead: single-select (owns exactly one dept) */}
          {isSuperadmin && formData.role === "dept-lead" && (
            <div className="flex flex-wrap gap-2">
              {departments.filter((d) => d.is_active).map((d) => {
                const selected = formData.department_id === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, department_id: selected ? null : d.id })}
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
          )}

          {/* Team member: multi-select via allowed_dept_ids */}
          {isSuperadmin && formData.role === "team-member" && (
            <div className="space-y-1.5">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Select one or more departments — the member can switch between them.
              </p>
              <div className="flex flex-wrap gap-2">
                {departments.filter((d) => d.is_active).map((d) => {
                  const selected =
                    Array.isArray(formData.allowed_dept_ids) && formData.allowed_dept_ids.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        const current = Array.isArray(formData.allowed_dept_ids) ? formData.allowed_dept_ids : [];
                        const next = selected ? current.filter((id) => id !== d.id) : [...current, d.id];
                        setFormData({
                          ...formData,
                          allowed_dept_ids: next.length ? next : null,
                          // Always keep department_id in sync with first selection
                          department_id: next.length ? next[0] : null,
                        });
                      }}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                        selected
                          ? "bg-indigo-500 text-white border-indigo-500"
                          : "bg-transparent text-slate-500 dark:text-slate-400 border-slate-300 dark:border-white/20 hover:border-indigo-400 hover:text-indigo-400"
                      }`}
                    >
                      {d.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {isMultiDeptBdLead && formData.role !== "bd" && formData.role !== "bd-team-lead" && (
            <div className="flex flex-wrap gap-2">
              {myAllowedDepts.map((d) => {
                const selected = formData.department_id === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, department_id: selected ? null : d.id })}
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
          )}
          {(formData.role === "bd" || formData.role === "bd-team-lead") && (isSuperadmin || isMultiDeptBdLead) && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
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
            </div>
          )}

          {/* BD entity assignment — superadmin for all BD roles; BD team lead for BD users they create */}
          {(isSuperadmin || (isBdTeamLead && formData.role === "bd")) && (formData.role === "bd" || formData.role === "bd-team-lead") && (
            <FormField label="Linked BD Entity (optional)">
              <select
                value={formData.bd_entity_id || ""}
                onChange={(e) => setFormData({ ...formData, bd_entity_id: e.target.value || null })}
                className={inputClass}
              >
                <option value="">— Not linked —</option>
                {businessDevs.filter((b) => b.is_active).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Connects this user account to a BusinessDeveloper record. Required for scoped lead ownership.
              </p>
            </FormField>
          )}

          {isSuperadmin && formData.role === "bd" && (
            <FormField label="Reports to (BD Team Lead, optional)">
              <select
                value={formData.team_lead_user_id || ""}
                onChange={(e) => setFormData({ ...formData, team_lead_user_id: e.target.value || null })}
                className={inputClass}
              >
                <option value="">— No team lead —</option>
                {users.filter((u) => u.role === "bd-team-lead" || u.role === "superadmin").map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name} ({u.role === "superadmin" ? "Superadmin" : "BD Team Lead"})</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                Assigns this BD to a team lead. Linking to a Superadmin grants the BD cross-department read access.
              </p>
            </FormField>
          )}

          {/* Broadcast access toggle — superadmin only, edit only */}
          {isSuperadmin && editingId && (
            <button
              type="button"
              onClick={() => setFormData((f) => ({ ...f, can_broadcast: !f.can_broadcast }))}
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 dark:border-white/[0.08] px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.03]"
            >
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${formData.can_broadcast ? "bg-indigo-500/10 text-indigo-500" : "bg-slate-100 dark:bg-white/[0.05] text-slate-400"}`}>
                  <Megaphone size={15} />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-100">Broadcast access</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Allow this user to create and publish announcements
                  </p>
                </div>
              </div>
              <div className={`relative ml-4 h-6 w-11 shrink-0 rounded-full transition-colors ${formData.can_broadcast ? "bg-indigo-500" : "bg-slate-200 dark:bg-white/10"}`}>
                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${formData.can_broadcast ? "translate-x-5" : "translate-x-0"}`} />
              </div>
            </button>
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
