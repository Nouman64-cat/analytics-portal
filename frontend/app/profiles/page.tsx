"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, FileUser } from "lucide-react";
import { profilesService } from "@/lib/services";
import { formatDate } from "@/lib/utils";
import type { ResumeProfile, ResumeProfileFormData } from "@/lib/types";
import { PageLoader, ErrorState, PageHeader, EmptyState } from "@/components/PageStates";
import Modal, { FormField, inputClass, buttonPrimary, buttonSecondary } from "@/components/Modal";

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ResumeProfileFormData>({ name: "" });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await profilesService.list();
      setProfiles(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profiles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    setFormData({ name: "" });
    setModalOpen(true);
  };

  const openEdit = (p: ResumeProfile) => {
    setEditingId(p.id);
    setFormData({ name: p.name });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
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
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this profile?")) return;
    try {
      await profilesService.delete(id);
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
        title="Resume Profiles"
        subtitle={`${profiles.length} profiles available`}
        action={
          <button onClick={openCreate} className={buttonPrimary}>
            <Plus size={16} />
            Add Profile
          </button>
        }
      />

      {profiles.length === 0 ? (
        <EmptyState message="No profiles yet" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 stagger-children">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[#12141c] p-5 transition-all duration-300 hover:border-white/[0.1] hover:shadow-lg hover:shadow-black/20"
            >
              <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br from-purple-500/10 to-pink-500/10 blur-2xl transition-all group-hover:opacity-60" />
              <div className="relative flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20">
                    <FileUser size={18} className="text-purple-300" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{profile.name}</h3>
                    <p className="text-[11px] text-slate-500">
                      Added {formatDate(profile.created_at)}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => openEdit(profile)}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-white transition-colors"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(profile.id)}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Profile" : "Add Profile"}
        size="sm"
      >
        <FormField label="Profile Name">
          <input
            value={formData.name}
            onChange={(e) => setFormData({ name: e.target.value })}
            placeholder="e.g., Ibrahim Jafri"
            className={inputClass}
            autoFocus
          />
        </FormField>
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
