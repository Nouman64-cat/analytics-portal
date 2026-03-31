"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Pencil, Trash2, FileUser, Activity, Target, Loader2 } from "lucide-react";
import { profilesService, interviewsService } from "@/lib/services";
import { formatDate } from "@/lib/utils";
import type { ResumeProfile, ResumeProfileFormData, Interview } from "@/lib/types";
import { PageLoader, ErrorState, PageHeader, EmptyState } from "@/components/PageStates";
import Modal, { FormField, inputClass, selectClass, buttonPrimary, buttonSecondary } from "@/components/Modal";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import { getUserRole } from "@/lib/auth";
import StatsCard, { StatsGrid } from "@/components/StatsCard";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ResumeProfileFormData>({ name: "", is_active: true });
  const [deleteModal, setDeleteModal] = useState<ResumeProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const role = getUserRole();
  const cannotCRUD = role === "bd" || role === "manager";

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [pData, iData] = await Promise.all([
        profilesService.list(),
        interviewsService.list()
      ]);
      setProfiles(pData);
      setInterviews(iData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    // Explicitly seed new profile status to True (Active) by default
    setFormData({ name: "", is_active: true });
    setModalOpen(true);
  };

  const openEdit = (p: ResumeProfile) => {
    setEditingId(p.id);
    // Default undefined states dynamically default to true
    setFormData({ name: p.name, is_active: p.is_active ?? true });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (editingId) {
        await profilesService.update(editingId, formData);
      } else {
        await profilesService.create(formData);
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
      await profilesService.delete(deleteModal.id);
      setDeleteModal(null);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setIsDeleting(false);
    }
  };

  // ─── Dashboard Configuration ─────────────────────────────────────
  // A newly created/migrated profile defaults is_active safely if null
  const activeProfiles = profiles.filter(p => p.is_active !== false).length;
  const closedProfiles = profiles.filter(p => p.is_active === false).length;
  const totalInterviews = interviews.length;

  // Compute profile counts mapping exactly
  const profileCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    interviews.forEach(i => {
      counts[i.resume_profile_id] = (counts[i.resume_profile_id] || 0) + 1;
    });
    return counts;
  }, [interviews]);

  // Line Chart Data Prep — last 30 days
  const chartData = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    cutoff.setHours(0, 0, 0, 0);

    const recentInterviews = interviews.filter(i => {
      if (!i.interview_date) return false;
      return new Date(i.interview_date + "T00:00:00") >= cutoff;
    });

    // Top 4 profiles by count within the last 30 days
    const recentCounts: Record<string, number> = {};
    recentInterviews.forEach(i => {
      recentCounts[i.resume_profile_id] = (recentCounts[i.resume_profile_id] || 0) + 1;
    });
    const topProfiles = [...profiles]
      .sort((a, b) => (recentCounts[b.id] || 0) - (recentCounts[a.id] || 0))
      .slice(0, 4);
    if (topProfiles.length === 0) return [];

    // Group by day
    const timeline: Record<string, any> = {};
    [...recentInterviews]
      .sort((a, b) => new Date(a.interview_date!).getTime() - new Date(b.interview_date!).getTime())
      .forEach(i => {
        const dayKey = i.interview_date!; // "YYYY-MM-DD"
        if (!timeline[dayKey]) {
          const d = new Date(dayKey + "T00:00:00");
          timeline[dayKey] = {
            name: d.toLocaleDateString("default", { month: "short", day: "numeric" }),
            _sortKey: dayKey,
          };
          topProfiles.forEach(p => { timeline[dayKey][p.name] = 0; });
        }
        const pName = i.resume_profile_name || "";
        if (topProfiles.find(tp => tp.name === pName)) {
          timeline[dayKey][pName] += 1;
        }
      });

    return Object.values(timeline).sort((a, b) => a._sortKey.localeCompare(b._sortKey));
  }, [profiles, interviews]);

  const LINE_COLORS = ["#6366f1", "#ec4899", "#14b8a6", "#f59e0b"];

  // ────────────────────────────────────────────────────────────────

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <PageHeader
        title="Resume Profiles"
        subtitle="Manage and analyze individual profile performance."
        action={
          !cannotCRUD && (
            <button onClick={openCreate} className={buttonPrimary}>
              <Plus size={16} />
              Add Profile
            </button>
          )
        }
      />

      <StatsGrid>
        <StatsCard title="Total Profiles" value={profiles.length} icon={FileUser} gradient="bg-gradient-to-br from-indigo-500 to-purple-600" />
        <StatsCard title="Active" value={activeProfiles} icon={Activity} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" />
        <StatsCard title="Closed" value={closedProfiles} icon={Target} gradient="bg-gradient-to-br from-slate-500 to-slate-600" />
        <StatsCard title="Total Placements" value={totalInterviews} icon={Activity} gradient="bg-gradient-to-br from-fuchsia-500 to-pink-600" />
      </StatsGrid>

      {/* Line Chart Analytics Showcase */}
      {chartData.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-6 shadow-sm overflow-hidden">
          <h3 className="mb-6 text-sm font-semibold text-slate-900 dark:text-white">Profile Performance — Last 30 Days</h3>
          <div className="h-[300px] w-full ml-[-20px] sm:ml-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px', color: '#fff' }}
                  itemStyle={{ color: '#e2e8f0' }}
                  cursor={{stroke: '#334155', strokeWidth: 1}}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
                {Object.keys(chartData[0] || {}).filter(k => k !== 'name' && k !== '_sortKey').map((key, index) => (
                  <Line 
                    key={key} 
                    type="monotone" 
                    dataKey={key} 
                    stroke={LINE_COLORS[index % LINE_COLORS.length]} 
                    strokeWidth={3} 
                    dot={{ r: 4, strokeWidth: 2 }} 
                    activeDot={{ r: 6 }} 
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Profiles Modular Grid */}
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white mt-8 mb-2">Deployed Profiles</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
        {profiles.map((profile) => {
          const isActive = profile.is_active !== false; 
          return (
          <div
            key={profile.id}
            className={`group relative overflow-hidden rounded-2xl border bg-white dark:bg-[#12141c] p-5 transition-all duration-300 hover:shadow-lg ${isActive ? 'border-indigo-100 hover:border-indigo-300 dark:border-indigo-500/20 dark:hover:border-indigo-500/50' : 'border-slate-200 dark:border-white/[0.06] hover:border-slate-300 dark:hover:border-white/[0.1] opacity-70'}`}
          >
            <div className={`absolute -right-6 -top-6 h-20 w-20 rounded-full blur-2xl transition-all group-hover:opacity-60 ${isActive ? 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20' : 'bg-slate-500/10'}`} />
            
            <div className="relative flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${isActive ? 'from-indigo-500/20 to-purple-500/20 text-indigo-400' : 'from-slate-500/20 to-slate-400/20 text-slate-400'}`}>
                    <FileUser size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      {profile.name}
                      {isActive ? 
                        <span className="bg-emerald-500/10 text-emerald-500 text-[10px] px-2 py-0.5 rounded-full font-medium shadow-sm">Active</span> :
                        <span className="bg-slate-500/10 text-slate-500 text-[10px] px-2 py-0.5 rounded-full font-medium">Closed</span>
                      }
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-500">
                      Added {formatDate(profile.created_at)}
                    </p>
                  </div>
                </div>
                {!cannotCRUD && (
                  <div className="flex gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                    <button onClick={() => openEdit(profile)} className="rounded-lg p-1.5 text-slate-500 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:text-white transition-colors" title="Edit Profile Details"><Pencil size={13} /></button>
                    <button onClick={() => setDeleteModal(profile)} className="rounded-lg p-1.5 text-slate-500 dark:text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors" title="Delete Locally"><Trash2 size={13} /></button>
                  </div>
                )}
              </div>

              {/* Exact Statistics Pipeline Count */}
              <div className="mt-2 text-sm bg-slate-50 dark:bg-white/[0.02] rounded-xl p-3 border border-slate-100 dark:border-white/[0.04]">
                <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                  <span className="text-xs font-medium uppercase tracking-wider">Total Interviews Loaded</span>
                  <span className="font-semibold text-slate-900 dark:text-white text-base">{profileCounts[profile.id] || 0}</span>
                </div>
              </div>
            </div>
          </div>
        )})}
      </div>

      {profiles.length === 0 && <EmptyState message="No robust profiles generated yet" />}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
        title="Delete Profile"
        itemName={deleteModal?.name ?? ""}
        itemDetail={deleteModal ? (deleteModal.is_active !== false ? "Active" : "Closed") : undefined}
      />

      {/* Profile Modification Framework Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit Profile Options" : "Register Profile Framework"} size="sm">
        <div className="space-y-4">
          <FormField label="Full Profile Name">
            <input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g., Ibrahim Jafri" className={inputClass} autoFocus />
          </FormField>
          
          <FormField label="Global Usage Status">
            <select 
              value={formData.is_active !== false ? "true" : "false"} 
              onChange={(e) => setFormData({ ...formData, is_active: e.target.value === "true" })} 
              className={selectClass}
            >
              <option value="true">Active (Seeking Deployments)</option>
              <option value="false">Closed (Retired/Hired)</option>
            </select>
          </FormField>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setModalOpen(false)} className={buttonSecondary}>Cancel</button>
          <button onClick={handleSubmit} disabled={isSubmitting} className={`${buttonPrimary} disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2`}>
            {isSubmitting && <Loader2 className="animate-spin" size={16} />}
            {editingId ? (isSubmitting ? "Applying..." : "Apply Update") : (isSubmitting ? "Deploying..." : "Deploy")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
