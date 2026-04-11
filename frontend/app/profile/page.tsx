"use client";

import { useEffect, useState, useCallback } from "react";
import { User, Mail, Shield, Calendar, Key, Loader2, CheckCircle, UserCircle, Save } from "lucide-react";
import { authService } from "@/lib/services";
import { formatDate } from "@/lib/utils";
import type { User as UserType } from "@/lib/types";
import { PageLoader, ErrorState, PageHeader } from "@/components/PageStates";
import { FormField, inputClass, buttonPrimary, buttonSecondary } from "@/components/Modal";

export default function ProfilePage() {
  const [user, setUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Profile update state
  const [newName, setNewName] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await authService.getMe();
      setUser(data);
      setNewName(data.full_name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || (user && newName === user.full_name)) return;

    setIsUpdatingProfile(true);
    setProfileSuccess(false);

    try {
      const updated = await authService.updateProfile({ full_name: newName });
      setUser(updated);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }

    setIsChangingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(false);

    try {
      await authService.changePassword({ 
        current_password: currentPassword, 
        new_password: newPassword 
      });
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchProfile} />;
  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Account Profile"
        subtitle="Manage your personal information and security settings"
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Profile Details Sidebar */}
        <div className="md:col-span-1 space-y-6">
          <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-6 shadow-sm overflow-hidden relative">
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-indigo-500/10 to-purple-500/10 blur-2xl" />
            
            <div className="relative flex flex-col items-center text-center">
              <div className="h-24 w-24 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg mb-4">
                {user.full_name.split(' ').map(n => n[0]).join('').toUpperCase()}
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white uppercase tracking-tight">
                {user.full_name}
              </h2>
              <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-[10px] font-bold uppercase tracking-wider">
                <Shield size={12} />
                {user.role}
              </div>
            </div>

            <div className="mt-8 space-y-4 border-t border-slate-100 dark:border-white/[0.04] pt-6">
              <div className="flex items-center gap-3 text-sm">
                <Mail size={16} className="text-slate-400" />
                <span className="text-slate-600 dark:text-slate-400 truncate">{user.email}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Calendar size={16} className="text-slate-400" />
                <span className="text-slate-600 dark:text-slate-400">Joined {formatDate(user.created_at)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Settings Area */}
        <div className="md:col-span-2 space-y-6">
          {/* Edit Profile Form */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-9 w-9 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                <UserCircle size={18} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Profile Information</h3>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <FormField label="Full Name">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className={inputClass}
                  placeholder="Enter your full name"
                />
              </FormField>

              {profileSuccess && (
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-500 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                  <CheckCircle size={14} />
                  Profile updated successfully!
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isUpdatingProfile || !newName.trim() || newName === user.full_name}
                  className={`${buttonPrimary} flex items-center justify-center gap-2`}
                >
                  {isUpdatingProfile ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                  {isUpdatingProfile ? "Saving..." : "Update Name"}
                </button>
              </div>
            </form>
          </div>

          {/* Change Password Form */}
          <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                <Key size={18} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Change Password</h3>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <FormField label="Current Password">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className={inputClass}
                />
              </FormField>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="New Password">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className={inputClass}
                  />
                </FormField>
                <FormField label="Confirm New Password">
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className={inputClass}
                  />
                </FormField>
              </div>

              {passwordError && (
                <p className="text-xs font-medium text-red-500 bg-red-500/10 p-3 rounded-xl border border-red-500/20">
                  {passwordError}
                </p>
              )}

              {passwordSuccess && (
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-500 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                  <CheckCircle size={14} />
                  Password successfully updated!
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isChangingPassword || !newPassword || !currentPassword}
                  className={`${buttonPrimary} w-full sm:w-auto flex items-center justify-center gap-2`}
                >
                  {isChangingPassword && <Loader2 className="animate-spin" size={16} />}
                  {isChangingPassword ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
