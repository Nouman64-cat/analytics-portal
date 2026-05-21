"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Pencil, Trash2, Briefcase, TrendingUp, Users, CalendarCheck, Loader2, ToggleLeft, ToggleRight, Mail } from "lucide-react";
import DateRangeFilter from "@/components/DateRangeFilter";
import { businessDevelopersService, interviewsService, departmentsService, authService } from "@/lib/services";
import { formatDate } from "@/lib/utils";
import type { BusinessDeveloper, BusinessDeveloperFormData, Interview, Department, User } from "@/lib/types";
import { PageLoader, ErrorState, PageHeader, EmptyState } from "@/components/PageStates";
import Modal, { FormField, inputClass, buttonPrimary, buttonSecondary } from "@/components/Modal";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import { getUserRole } from "@/lib/auth";
import StatsCard, { StatsGrid } from "@/components/StatsCard";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, Legend,
} from "recharts";

const BAR_COLORS = ["#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#f97316", "#eab308"];

function formatMonthLabel(ym: string) {
  const [year, month] = ym.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("default", { month: "long", year: "numeric" });
}

function getWeekKey(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function formatFreqLabel(period: string, mode: "weekly" | "monthly"): string {
  if (mode === "monthly") {
    const [y, mo] = period.split("-").map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString("default", { month: "short", year: "2-digit" });
  }
  const [yearStr, wStr] = period.split("-W");
  const y = Number(yearStr);
  const wk = Number(wStr);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(Date.UTC(y, 0, 4 - jan4Day + 1 + (wk - 1) * 7));
  return monday.toLocaleDateString("default", { month: "short", day: "numeric" });
}

export default function BusinessDevelopersPage() {
  const [bds, setBds] = useState<BusinessDeveloper[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<BusinessDeveloperFormData>({ name: "", email: "" });
  const [deleteModal, setDeleteModal] = useState<BusinessDeveloper | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [freqMode, setFreqMode] = useState<"weekly" | "monthly">("monthly");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [currentUserProfile, setCurrentUserProfile] = useState<User | null>(null);
  const role = getUserRole();
  const cannotCRUD = role === "bd" || role === "manager";
  const isSuperAdmin = role === "superadmin";
  const isBdTeamLead = role === "bd-team-lead";

  const myAllowedDepts = useMemo(() => {
    if (!isBdTeamLead) return departments.filter((d) => d.is_active);
    const allowed = currentUserProfile?.allowed_dept_ids;
    if (allowed === null || allowed === undefined) return [];
    if (allowed.length === 0) return departments.filter((d) => d.is_active);
    return departments.filter((d) => d.is_active && allowed.includes(d.id));
  }, [isBdTeamLead, currentUserProfile, departments]);

  const deptMap = useMemo(() => {
    const m: Record<string, string> = {};
    departments.forEach((d) => { m[d.id] = d.name; });
    return m;
  }, [departments]);

  const canManageDepts = isSuperAdmin || isBdTeamLead;

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

  useEffect(() => {
    fetchData();
    if (isSuperAdmin || isBdTeamLead) {
      departmentsService.list().then(setDepartments).catch(() => {});
    }
    if (isBdTeamLead) {
      authService.getMe().then(setCurrentUserProfile).catch(() => {});
    }
  }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    setFormData({ name: "", email: "", department_ids: null });
    setModalOpen(true);
  };

  const openEdit = (bd: BusinessDeveloper) => {
    setEditingId(bd.id);
    setFormData({ name: bd.name, email: bd.email ?? "", department_ids: bd.department_ids ?? null });
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

  const handleToggleStatus = async (bd: BusinessDeveloper) => {
    setTogglingId(bd.id);
    try {
      const updated = await businessDevelopersService.toggleStatus(bd.id);
      setBds((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setTogglingId(null);
    }
  };

  // ─── Analytics ───────────────────────────────────────────────────
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    interviews.forEach((i) => {
      if (i.interview_date) months.add(i.interview_date.slice(0, 7));
    });
    return [...months].sort().reverse();
  }, [interviews]);

  /** One entry per pipeline thread (lead); same definition as Dashboard → Total leads. */
  const threadsMap = useMemo(() => {
    const m = new Map<string, Interview[]>();
    interviews.forEach((i) => {
      const tid = i.thread_id || i.id;
      if (!m.has(tid)) m.set(tid, []);
      m.get(tid)!.push(i);
    });
    return m;
  }, [interviews]);

  /** Threads with at least one interview matching both the month pill and the date range. */
  const threadsInSelectedPeriod = useMemo(() => {
    if (selectedMonth === "all" && !dateFrom && !dateTo) return new Set(threadsMap.keys());
    const s = new Set<string>();
    threadsMap.forEach((rows, tid) => {
      if (rows.some((r) => {
        if (!r.interview_date) return false;
        if (selectedMonth !== "all" && !r.interview_date.startsWith(selectedMonth)) return false;
        if (dateFrom && r.interview_date < dateFrom) return false;
        if (dateTo && r.interview_date > dateTo) return false;
        return true;
      })) s.add(tid);
    });
    return s;
  }, [threadsMap, selectedMonth, dateFrom, dateTo]);

  function primaryBdForThread(rows: Interview[]): string | null {
    const sorted = [...rows].sort((a, b) => {
      const da = a.interview_date || "";
      const db = b.interview_date || "";
      if (da !== db) return da.localeCompare(db);
      return (a.created_at || "").localeCompare(b.created_at || "");
    });
    for (const r of sorted) {
      if (r.bd_id) return r.bd_id;
    }
    return null;
  }

  /** Per BD: pipeline threads where this BD is the “primary” (first chronologically with bd_id). */
  const bdThreadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    threadsInSelectedPeriod.forEach((tid) => {
      const rows = threadsMap.get(tid)!;
      const pbd = primaryBdForThread(rows);
      if (pbd) counts[pbd] = (counts[pbd] || 0) + 1;
    });
    return counts;
  }, [threadsMap, threadsInSelectedPeriod]);

  const totalLeadsInPeriod = threadsInSelectedPeriod.size;
  const totalAttributedThreads = useMemo(
    () => Object.values(bdThreadCounts).reduce((s, n) => s + n, 0),
    [bdThreadCounts],
  );

  const filteredBds = useMemo(() => {
    if (statusFilter === "active") return bds.filter((b) => b.is_active);
    if (statusFilter === "inactive") return bds.filter((b) => !b.is_active);
    return bds;
  }, [bds, statusFilter]);

  const activeBdCount = useMemo(() => bds.filter((b) => b.is_active).length, [bds]);

  const avgPerBd =
    filteredBds.length > 0 ? (totalAttributedThreads / filteredBds.length).toFixed(1) : "0";

  const topBdFiltered = useMemo(
    () =>
      filteredBds.reduce<BusinessDeveloper | null>(
        (top, bd) =>
          (bdThreadCounts[bd.id] || 0) > (top ? bdThreadCounts[top.id] || 0 : -1) ? bd : top,
        null,
      ),
    [filteredBds, bdThreadCounts],
  );

  const chartData = useMemo(
    () =>
      [...filteredBds]
        .map((bd) => ({ name: bd.name, leads: bdThreadCounts[bd.id] || 0 }))
        .sort((a, b) => b.leads - a.leads),
    [filteredBds, bdThreadCounts],
  );

  const freqChartData = useMemo(() => {
    const periodBdMap = new Map<string, Record<string, number>>();

    threadsMap.forEach((rows) => {
      const pbd = primaryBdForThread(rows);
      if (!pbd) return;
      const earliest = [...rows]
        .filter((r) => r.interview_date)
        .sort((a, b) => a.interview_date!.localeCompare(b.interview_date!))[0];
      if (!earliest?.interview_date) return;

      const period =
        freqMode === "monthly"
          ? earliest.interview_date.slice(0, 7)
          : getWeekKey(earliest.interview_date);

      if (!periodBdMap.has(period)) periodBdMap.set(period, {});
      const entry = periodBdMap.get(period)!;
      entry[pbd] = (entry[pbd] || 0) + 1;
    });

    const periods = [...periodBdMap.keys()].sort();

    const bdTotals: Record<string, number> = {};
    periodBdMap.forEach((entry) => {
      Object.entries(entry).forEach(([id, n]) => { bdTotals[id] = (bdTotals[id] || 0) + n; });
    });
    const topIds = Object.entries(bdTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id]) => id);

    const data = periods.map((period) => {
      const row: Record<string, string | number> = {
        period,
        label: formatFreqLabel(period, freqMode),
      };
      topIds.forEach((id) => {
        const name = bds.find((b) => b.id === id)?.name ?? id;
        row[name] = periodBdMap.get(period)?.[id] ?? 0;
      });
      return row;
    });

    const lines = topIds.map((id) => bds.find((b) => b.id === id)?.name ?? id);
    return { data, lines };
  }, [threadsMap, freqMode, bds]);
  // ─────────────────────────────────────────────────────────────────

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <PageHeader
        title="Business Developers"
        subtitle={`${bds.length} business developers · ${activeBdCount} active`}
        action={
          !cannotCRUD && (
            <button onClick={openCreate} className={buttonPrimary}>
              <Plus size={16} />
              Add Business Developer
            </button>
          )
        }
      />

      {/* Status Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">Status:</span>
        <div className="flex gap-1.5 flex-wrap">
          {(["all", "active", "inactive"] as const).map((s) => {
            const count = s === "all" ? bds.length : s === "active" ? activeBdCount : bds.length - activeBdCount;
            const active = statusFilter === s;
            const colorMap = {
              all: active ? "bg-slate-700 text-white dark:bg-white/20 dark:text-white" : "bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.10]",
              active: active ? "bg-emerald-500 text-white" : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20",
              inactive: active ? "bg-slate-500 text-white" : "bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.10]",
            };
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${colorMap[s]}`}
              >
                {s === "active" && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />}
                {s === "inactive" && <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />}
                {s.charAt(0).toUpperCase() + s.slice(1)}
                <span className="opacity-70">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Period filter: month pills + date range */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">Period:</span>
        <div className="flex gap-1.5 flex-wrap items-center">
          <button
            onClick={() => setSelectedMonth("all")}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${selectedMonth === "all" ? "bg-indigo-500 text-white" : "bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.10]"}`}
          >
            All time
          </button>
          {availableMonths.map((ym) => (
            <button
              key={ym}
              onClick={() => setSelectedMonth(ym)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${selectedMonth === ym ? "bg-indigo-500 text-white" : "bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.10]"}`}
            >
              {formatMonthLabel(ym)}
            </button>
          ))}
          <DateRangeFilter
            from={dateFrom}
            to={dateTo}
            onFromChange={setDateFrom}
            onToChange={setDateTo}
            onClear={() => { setDateFrom(""); setDateTo(""); }}
          />
        </div>
      </div>

      {/* Stats */}
      <StatsGrid>
        <StatsCard title="Total BDs" value={bds.length} icon={Users} gradient="bg-gradient-to-br from-amber-500 to-orange-600" />
        <StatsCard
          title="Pipeline leads (threads)"
          value={totalLeadsInPeriod}
          icon={CalendarCheck}
          gradient="bg-gradient-to-br from-indigo-500 to-purple-600"
        />
        <StatsCard title="Top Performer" value={topBdFiltered?.name ?? "—"} icon={TrendingUp} gradient="bg-gradient-to-br from-emerald-500 to-teal-600" />
        <StatsCard title="Avg per BD" value={avgPerBd} icon={Briefcase} gradient="bg-gradient-to-br from-fuchsia-500 to-pink-600" />
      </StatsGrid>
      {totalLeadsInPeriod > totalAttributedThreads && (
        <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2">
          {totalLeadsInPeriod - totalAttributedThreads} thread
          {totalLeadsInPeriod - totalAttributedThreads === 1 ? "" : "s"} have no BD on any round (not counted toward a BD below). Same total as Dashboard → Total leads when the month filter is &quot;All Time&quot;.
        </p>
      )}

      {/* Charts side by side */}
      {(chartData.length > 0 || freqChartData.data.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

          {/* Left: Pipeline leads bar chart (25%) */}
          {chartData.length > 0 && (
            <div className="lg:col-span-1 rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-4 sm:p-6 shadow-sm flex flex-col">
              <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
                {selectedMonth !== "all"
                  ? `Pipeline leads — ${formatMonthLabel(selectedMonth)}${dateFrom || dateTo ? ` · ${dateFrom || "…"} to ${dateTo || "…"}` : ""}`
                  : dateFrom || dateTo
                    ? `Pipeline leads — ${dateFrom || "…"} to ${dateTo || "…"}`
                    : "Pipeline leads per BD"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 -mt-2 mb-4">Thread attributed by first BD on timeline</p>
              <div className="flex-1 min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1e293b", border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px" }}
                      itemStyle={{ color: "#e2e8f0" }}
                      cursor={{ fill: "rgba(99,102,241,0.08)" }}
                      formatter={(value) => [value ?? 0, "Leads"]}
                    />
                    <Bar dataKey="leads" radius={[6, 6, 0, 0]}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Right: Leads frequency line chart (75%) */}
          {freqChartData.data.length > 0 && (
            <div className="lg:col-span-3 rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-4 sm:p-6 shadow-sm flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Leads frequency per BD</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">All-time lead counts grouped by {freqMode === "monthly" ? "month" : "week"}</p>
                </div>
                <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 dark:border-white/[0.08] p-0.5 shrink-0">
                  {(["monthly", "weekly"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setFreqMode(m)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        freqMode === m
                          ? "bg-indigo-500 text-white"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      }`}
                    >
                      {m.charAt(0).toUpperCase() + m.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 min-h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={freqChartData.data} margin={{ top: 5, right: 10, left: -10, bottom: 28 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.15} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      angle={-35}
                      textAnchor="end"
                      interval={freqMode === "weekly" ? Math.max(0, Math.floor(freqChartData.data.length / 8)) : 0}
                    />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} width={24} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1e293b", border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px" }}
                      itemStyle={{ color: "#e2e8f0" }}
                      labelStyle={{ color: "#94a3b8", marginBottom: "4px" }}
                    />
                    <Legend wrapperStyle={{ fontSize: "10px", paddingTop: "10px" }} iconType="circle" iconSize={7} />
                    {freqChartData.lines.map((name, i) => (
                      <Line
                        key={name}
                        type="monotone"
                        dataKey={name}
                        stroke={BAR_COLORS[i % BAR_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, strokeWidth: 0 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Table */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          {statusFilter === "all" ? "All Business Developers" : statusFilter === "active" ? "Active Business Developers" : "Inactive Business Developers"}
        </h3>
      </div>
      {filteredBds.length === 0 ? (
        <EmptyState message={statusFilter === "inactive" ? "No inactive business developers" : statusFilter === "active" ? "No active business developers" : "No business developers yet"} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Name</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Email</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Departments</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Status</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Leads</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Created</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredBds].sort((a, b) => (bdThreadCounts[b.id] || 0) - (bdThreadCounts[a.id] || 0)).map((bd) => {
                  const count = bdThreadCounts[bd.id] || 0;
                  const isToggling = togglingId === bd.id;
                  return (
                    <tr
                      key={bd.id}
                      className={`border-b border-slate-200 dark:border-white/[0.06] last:border-b-0 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.02] ${!bd.is_active ? "opacity-60" : ""}`}
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20 text-amber-400">
                            <Briefcase size={14} />
                          </div>
                          <span className="font-medium text-slate-900 dark:text-white truncate max-w-[180px]">
                            {bd.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                        {bd.email || <span className="text-slate-400 dark:text-slate-500">—</span>}
                      </td>
                      <td className="px-5 py-4">
                        {Array.isArray(bd.department_ids) && bd.department_ids.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {bd.department_ids.map((id) => deptMap[id] && (
                              <span key={id} className="px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-teal-500/10 text-teal-500 dark:text-teal-400 border border-teal-500/20">
                                {deptMap[id]}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${bd.is_active ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${bd.is_active ? "bg-emerald-400" : "bg-slate-400"}`} />
                          {bd.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-semibold text-slate-900 dark:text-white">{count}</span>
                      </td>
                      <td className="px-5 py-4 text-slate-500 dark:text-slate-400 text-[13px] whitespace-nowrap">
                        {formatDate(bd.created_at)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isSuperAdmin && (
                            <button
                              onClick={() => void handleToggleStatus(bd)}
                              disabled={isToggling}
                              title={bd.is_active ? "Set inactive" : "Set active"}
                              className={`rounded-lg p-1.5 transition-colors disabled:opacity-50 ${bd.is_active ? "text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10" : "text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]"}`}
                            >
                              {isToggling ? <Loader2 size={13} className="animate-spin" /> : bd.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                            </button>
                          )}
                          {!cannotCRUD && (
                            <>
                              <button
                                onClick={() => openEdit(bd)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors"
                                title="Edit"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => setDeleteModal(bd)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                                title="Delete"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Business Developer" : "Add Business Developer"}
        size="sm"
      >
        <div className="space-y-4">
        <FormField label="Full Name">
          <input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Ahmed Khan"
            className={inputClass}
            autoFocus
          />
        </FormField>
        <FormField label="Email (optional)">
          <input
            type="email"
            value={formData.email ?? ""}
            onChange={(e) => setFormData({ ...formData, email: e.target.value || null })}
            placeholder="e.g., ahmed@example.com"
            className={inputClass}
          />
        </FormField>

        {canManageDepts && (
          <div className="space-y-2">
            <p className="text-[12px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Departments
            </p>
            <div className="flex flex-wrap gap-2">
              {(isSuperAdmin ? departments.filter((d) => d.is_active) : myAllowedDepts).map((d) => {
                const selected = Array.isArray(formData.department_ids) && formData.department_ids.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      const current = Array.isArray(formData.department_ids) ? formData.department_ids : [];
                      const next = selected ? current.filter((id) => id !== d.id) : [...current, d.id];
                      setFormData({ ...formData, department_ids: next.length ? next : null });
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
              {!formData.department_ids || formData.department_ids.length === 0
                ? "No department assigned."
                : `Assigned to ${formData.department_ids.length} department(s).`}
            </p>
          </div>
        )}
        </div>
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
