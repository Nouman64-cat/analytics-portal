"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Loader2, Search, DoorOpen, Shield, Pencil, ToggleLeft, ToggleRight, X } from "lucide-react";
import { interviewRoomsService } from "@/lib/services";
import { formatDate } from "@/lib/utils";
import type { InterviewRoom, InterviewRoomFormData } from "@/lib/types";
import { PageLoader, ErrorState, PageHeader, EmptyState } from "@/components/PageStates";
import Modal, { FormField, inputClass, buttonPrimary, buttonSecondary } from "@/components/Modal";
import { getUserRole } from "@/lib/auth";

export default function InterviewRoomsPage() {
  const [rooms, setRooms] = useState<InterviewRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<InterviewRoomFormData>({ room_no: "", is_active: true });
  const [search, setSearch] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const role = getUserRole();
  const canManage = role === "superadmin" || role === "coordinator";

  const filteredRooms = useMemo(() => {
    if (!search.trim()) return rooms;
    const q = search.toLowerCase();
    return rooms.filter((r) => r.room_no.toLowerCase().includes(q));
  }, [rooms, search]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await interviewRoomsService.list();
      setRooms(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load interview rooms");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) {
      fetchData();
    } else {
      setLoading(false);
      setError("Access denied.");
    }
  }, [fetchData, canManage]);

  const openCreate = () => {
    setEditingId(null);
    setFormData({ room_no: "", is_active: true });
    setModalOpen(true);
  };

  const openEdit = (room: InterviewRoom) => {
    setEditingId(room.id);
    setFormData({ room_no: room.room_no, is_active: room.is_active });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!formData.room_no.trim()) {
      alert("Please enter a room number");
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingId) {
        const updated = await interviewRoomsService.update(editingId, formData);
        setRooms((prev) => prev.map((r) => (r.id === editingId ? updated : r)));
      } else {
        const created = await interviewRoomsService.create(formData);
        setRooms((prev) => [...prev, created]);
      }
      setModalOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${editingId ? "update" : "create"} room`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (room: InterviewRoom) => {
    setTogglingId(room.id);
    try {
      const updated = await interviewRoomsService.update(room.id, { room_no: room.room_no, is_active: !room.is_active });
      setRooms((prev) => prev.map((r) => (r.id === room.id ? updated : r)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update room");
    } finally {
      setTogglingId(null);
    }
  };

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Shield size={48} className="text-red-500/50" />
        <h2 className="text-xl font-bold dark:text-white">Access Denied</h2>
        <p className="text-slate-500 dark:text-slate-400">You don&apos;t have permission to view interview rooms.</p>
      </div>
    );
  }

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Interview Rooms"
        subtitle={`${rooms.length} room${rooms.length !== 1 ? "s" : ""}`}
        action={
          <button onClick={openCreate} className={buttonPrimary}>
            <Plus size={16} />
            Add Room
          </button>
        }
      />

      <div className="relative sm:max-w-sm">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search rooms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputClass} pl-10 pr-9`}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            aria-label="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {rooms.length === 0 ? (
        <EmptyState message="No interview rooms yet" />
      ) : filteredRooms.length === 0 ? (
        <EmptyState message="No rooms match your search" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Room No.</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Status</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Created</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRooms.map((room) => (
                  <tr
                    key={room.id}
                    className={`border-b border-slate-200 dark:border-white/[0.06] last:border-b-0 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.02] ${!room.is_active ? "opacity-60" : ""}`}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md">
                          <DoorOpen size={14} className="text-white" />
                        </div>
                        <span className="font-medium text-slate-900 dark:text-white">
                          {room.room_no}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        room.is_active
                          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                          : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                      }`}>
                        {room.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-500 dark:text-slate-400 text-[13px] whitespace-nowrap">
                      {formatDate(room.created_at)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(room)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleToggleActive(room)}
                          disabled={togglingId === room.id}
                          className={`rounded-lg p-1.5 transition-colors disabled:opacity-50 ${
                            room.is_active
                              ? "text-emerald-500 hover:bg-emerald-500/10"
                              : "text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.06]"
                          }`}
                          title={room.is_active ? "Deactivate" : "Activate"}
                        >
                          {togglingId === room.id ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : room.is_active ? (
                            <ToggleRight size={14} />
                          ) : (
                            <ToggleLeft size={14} />
                          )}
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Room" : "Add Room"}
        size="sm"
      >
        <div className="space-y-4">
          <FormField label="Room No.">
            <input
              value={formData.room_no}
              onChange={(e) => setFormData({ ...formData, room_no: e.target.value })}
              placeholder="e.g., R-101"
              className={inputClass}
              autoFocus
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
