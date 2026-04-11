"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Loader2, Search, UserCog, Mail, Shield, Calendar } from "lucide-react";
import { usersService } from "@/lib/services";
import { formatDate } from "@/lib/utils";
import type { User, UserFormData } from "@/lib/types";
import { PageLoader, ErrorState, PageHeader, EmptyState } from "@/components/PageStates";
import Modal, { FormField, inputClass, buttonPrimary, buttonSecondary } from "@/components/Modal";
import { getUserRole } from "@/lib/auth";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<UserFormData>({
    full_name: "",
    email: "",
    role: "team-member",
  });
  const [search, setSearch] = useState("");

  const role = getUserRole();
  const isSuperadmin = role === "superadmin";

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
    if (isSuperadmin) {
      fetchData();
    } else {
      setLoading(false);
      setError("Access denied. Superadmin role required.");
    }
  }, [fetchData, isSuperadmin]);

  const openCreate = () => {
    setFormData({ full_name: "", email: "", role: "team-member" });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!formData.full_name || !formData.email || !formData.role) {
      alert("Please fill in all fields");
      return;
    }
    
    setIsSubmitting(true);
    try {
      await usersService.create(formData);
      setModalOpen(false);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create user");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isSuperadmin) {
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
        title="User Management"
        subtitle={`${users.length} registered accounts`}
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
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-indigo-400">
                  <UserCog size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                      {user.full_name}
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      user.role === 'superadmin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                      user.role === 'manager' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                      'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                    }`}>
                      {user.role}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
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
        title="Add New User"
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
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className={inputClass}
            >
              <option value="team-member">Team Member</option>
              <option value="manager">Manager</option>
              <option value="bd">Business Developer</option>
              <option value="superadmin">Superadmin</option>
            </select>
          </FormField>
          
          <div className="mt-2 p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
            <p className="text-[12px] text-indigo-400 leading-relaxed font-medium">
              A temporary password will be automatically generated and emailed to the user. 
              They will be required to change it upon their first login.
            </p>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <button onClick={() => setModalOpen(false)} className={buttonSecondary}>Cancel</button>
          <button 
            onClick={handleSubmit} 
            disabled={isSubmitting} 
            className={`${buttonPrimary} disabled:opacity-70 flex items-center gap-2`}
          >
            {isSubmitting && <Loader2 className="animate-spin" size={16} />}
            {isSubmitting ? "Creating..." : "Create User"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
