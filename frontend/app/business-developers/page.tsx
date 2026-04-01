"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Pencil, Trash2, Briefcase, TrendingUp, Users, CalendarCheck, Loader2 } from "lucide-react";
import { businessDevelopersService, interviewsService } from "@/lib/services";
import { formatDate } from "@/lib/utils";
import type { BusinessDeveloper, BusinessDeveloperFormData, Interview } from "@/lib/types";
import { PageLoader, ErrorState, PageHeader, EmptyState } from "@/components/PageStates";
import Modal, { FormField, inputClass, buttonPrimary, buttonSecondary } from "@/components/Modal";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import { getUserRole } from "@/lib/auth";
import StatsCard, { StatsGrid } from "@/components/StatsCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const BAR_COLORS = ["#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#f97316", "#eab308"];

function formatMonthLabel(ym: string) {
  const [year, month] = ym.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("default", { month: "long", year: "numeric" });
}

export default function BusinessDevelopersPage() {
  const [bds, setBds] = useState<BusinessDeveloper[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<BusinessDeveloperFormData>({ name: "" });
  const [deleteModal, setDeleteModal] = useState<BusinessDeveloper | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const role = getUserRole();
  const cannotCRUD = role === "bd" || role === "manager";

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [bdsData, interviewsData] = await Promise.all([
        businessDevelopersService.list(),
        interviewsService.list(),
      ]);
      setBds(bdsData);
      setInterviews(interviewsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load business developers");
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

  const openEdit = (bd: BusinessDeveloper) => {
    setEditingId(bd.id);
    setFormData({ name: bd.name });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (editingId) {
        await businessDevelopersService.update(editingId, formData);
      } else {
        await businessDevelopersService.create(formData);
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
      await businessDevelopersService.delete(deleteModal.id);
      setDeleteModal(null);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setIsDeleting(false);
    }
  };

  // ─── Analytics ───────────────────────────────────────────────────
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    interviews.forEach(i => {
      if (i.interview_date) months.add(i.interview_date.slice(0, 7));
    });
    return [...months].sort().reverse();
  }, [interviews]);

  const filteredInterviews = useMemo(() => {
    if (selectedMonth === "all") return interviews;
    return interviews.filter(i => i.interview_date?.startsWith(selectedMonth));
  }, [interviews, selectedMonth]);

  const bdCounts = useMemo(() => {
    const companySets: Record<string, Set<string>> = {};
    filteredInterviews.forEach(i => {
      if (i.bd_id) {
        if (!companySets[i.bd_id]) companySets[i.bd_id] = new Set();
        companySets[i.bd_id].add(i.company_id);
      }
    });
    const counts: Record<string, number> = {};
    Object.entries(companySets).forEach(([bdId, set]) => { counts[bdId] = set.size; });
    return counts;
  }, [filteredInterviews]);

  const totalBdCompanies = useMemo(
    () => Object.values(bdCounts).reduce((s, n) => s + n, 0),
    [bdCounts]
  );

  const topBd = useMemo(
    () => bds.reduce<BusinessDeveloper | null>((top, bd) =>
      (bdCounts[bd.id] || 0) > (top ? bdCounts[top.id] || 0 : -1) ? bd : top, null),
    [bds, bdCounts]
  );

  const avgPerBd = bds.length > 0 ? (totalBdCompanies / bds.length).toFixed(1) : "0";

  // Bar chart data — all BDs sorted by count desc
  const chartData = useMemo(() =>
    [...bds]
      .map(bd => ({ name: bd.name, companies: bdCounts[bd.id] || 0 }))
      .sort((a, b) => b.companies - a.companies),
    [bds, bdCounts]
  );
  // ─────────────────────────────────────────────────────────────────

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <PageHeader
        title="Business Developers"
        subtitle={`${bds.length} business developers`}
        action={
          !cannotCRUD && (
            <button onClick={openCreate} className={buttonPrimary}>
              <Plus size={16} />
              Add Business Developer
            </button>
          )
        }
      />

      {/* Month Filter */}
      {availableMonths.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">Filter by month:</span>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedMonth("all")}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${selectedMonth === "all" ? "bg-amber-500 text-white" : "bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.10]"}`}
            >
              All Time
            </button>
            {availableMonths.map(ym => (
              <button
                key={ym}
                onClick={() => setSelectedMonth(ym)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${selectedMonth === ym ? "bg-amber-500 text-white" : "bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.10]"}`}
              >
                {formatMonthLabel(ym)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <StatsGrid>
        <StatsCard title="Total BDs" value={bds.length} icon={Users} gradient="bg-gradient-to-br from-amber-500 to-orange-600" />
        <StatsCard title="Leads Brought" value={totalBdCompanies} icon={CalendarCheck} gradient="bg-gradient-to-br from-indigo-500 to-purple-600" />
        <StatsCard title="Top Performer" value={topBd?.name ?? "—"} icon={TrendingUp} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" />
        <StatsCard title="Avg per BD" value={avgPerBd} icon={Briefcase} gradient="bg-gradient-to-br from-fuchsia-500 to-pink-600" />
      </StatsGrid>

      {/* Bar Chart */}
      {chartData.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-4 sm:p-6 shadow-sm">
          <h3 className="mb-4 sm:mb-6 text-sm font-semibold text-slate-900 dark:text-white">
            {selectedMonth === "all" ? "Leads Brought per Business Developer" : `Leads Brought — ${formatMonthLabel(selectedMonth)}`}
          </h3>
          <div className="h-[200px] sm:h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1e293b", border: "none", borderRadius: "8px", color: "#fff" }}
                  itemStyle={{ color: "#e2e8f0" }}
                  cursor={{ fill: "rgba(99,102,241,0.08)" }}
                  formatter={(value) => [value ?? 0, "Companies"]}
                />
                <Bar dataKey="companies" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Cards */}
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white mt-8 mb-2">All Business Developers</h3>
      {bds.length === 0 ? (
        <EmptyState message="No business developers yet" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 stagger-children">
          {[...bds].sort((a, b) => (bdCounts[b.id] || 0) - (bdCounts[a.id] || 0)).map((bd) => {
            const count = bdCounts[bd.id] || 0;
            return (
              <div
                key={bd.id}
                className="group relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-5 transition-all duration-300 hover:border-amber-300/50 dark:hover:border-amber-500/30 hover:shadow-lg hover:shadow-black/20"
              >
                <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br from-amber-500/10 to-orange-500/10 blur-2xl transition-all group-hover:opacity-80" />
                <div className="relative">
                  <div className="flex items-start justify-between">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-400">
                      <Briefcase size={18} />
                    </div>
                    {!cannotCRUD && (
                      <div className="flex gap-1 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100">
                        <button
                          onClick={() => openEdit(bd)}
                          className="rounded-lg p-1.5 text-slate-500 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:text-white transition-colors"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => setDeleteModal(bd)}
                          className="rounded-lg p-1.5 text-slate-500 dark:text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    <p className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">{count}</p>
                    <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                      {count === 1 ? "Lead" : "Leads"} brought
                    </p>
                  </div>

                  <div className="mt-4 border-t border-slate-100 dark:border-white/[0.04] pt-3">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{bd.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-500">
                      Added {formatDate(bd.created_at)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Business Developer" : "Add Business Developer"}
        size="sm"
      >
        <FormField label="Full Name">
          <input
            value={formData.name}
            onChange={(e) => setFormData({ name: e.target.value })}
            placeholder="e.g., Ahmed Khan"
            className={inputClass}
            autoFocus
          />
        </FormField>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setModalOpen(false)} className={buttonSecondary}>Cancel</button>
          <button onClick={handleSubmit} disabled={isSubmitting} className={`${buttonPrimary} disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2`}>
            {isSubmitting && <Loader2 className="animate-spin" size={16} />}
            {editingId ? (isSubmitting ? "Updating..." : "Update") : (isSubmitting ? "Creating..." : "Create")}
          </button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
        title="Delete Business Developer"
        itemName={deleteModal?.name ?? ""}
      />
    </div>
  );
}
