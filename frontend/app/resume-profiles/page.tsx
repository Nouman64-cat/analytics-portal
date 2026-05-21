"use client";

import { useEffect, useState, useCallback, useMemo, ChangeEvent } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  FileUser,
  Activity,
  Target,
  Loader2,
  Eye,
  Search,
} from "lucide-react";
import { FaLinkedin, FaGithub } from "react-icons/fa";
import { profilesService, interviewsService, departmentsService } from "@/lib/services";
import { useDepartmentContext } from "@/lib/DepartmentContext";
import { formatDate } from "@/lib/utils";
import type {
  ResumeProfile,
  ResumeProfileFormData,
  Interview,
  Department,
} from "@/lib/types";
import {
  PageLoader,
  ErrorState,
  PageHeader,
  EmptyState,
} from "@/components/PageStates";
import Modal, {
  FormField,
  inputClass,
  selectClass,
  buttonPrimary,
  buttonSecondary,
} from "@/components/Modal";

import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import { getUserRole } from "@/lib/auth";
import StatsCard, { StatsGrid } from "@/components/StatsCard";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

function formatMonthLabel(ym: string) {
  const [year, month] = ym.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString(
    "default",
    { month: "long", year: "numeric" },
  );
}

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "closed" | "all">("active");
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<ResumeProfileFormData>({
    name: "",
    is_active: true,
  });
  const [deleteModal, setDeleteModal] = useState<ResumeProfile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [viewModal, setViewModal] = useState<ResumeProfile | null>(null);
  const [uploadingProfileId, setUploadingProfileId] = useState<string | null>(
    null,
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const role = getUserRole();
  const cannotCRUD = role === "manager";
  const isSuperadmin = role === "superadmin";
  const { departmentId } = useDepartmentContext();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [pData, iData] = await Promise.all([
        profilesService.list({ department_id: departmentId }),
        interviewsService.list(),
      ]);
      setProfiles(pData);
      setInterviews(iData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (isSuperadmin) departmentsService.list().then(setDepartments).catch(() => {});
  }, [isSuperadmin]);

  const openCreate = () => {
    setEditingId(null);
    setFormData({
      name: "",
      is_active: true,
      department_id: departmentId ?? null,
      linkedin_url: "",
      github_url: "",
      portfolio_url: "",
    });
    setModalOpen(true);
  };

  const openEdit = (p: ResumeProfile) => {
    setEditingId(p.id);
    setFormData({
      name: p.name,
      is_active: p.is_active ?? true,
      department_id: p.department_id ?? null,
      linkedin_url: p.linkedin_url || "",
      github_url: p.github_url || "",
      portfolio_url: p.portfolio_url || "",
    });
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

  const handleResumeUpload = async (profileId: string, file?: File) => {
    if (!file) return;
    setUploadError(null);
    setUploadingProfileId(profileId);
    try {
      if (file.type !== "application/pdf") {
        throw new Error("Please upload a PDF file.");
      }
      await profilesService.uploadResume(profileId, file);
      await fetchData();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Failed to upload resume",
      );
    } finally {
      setUploadingProfileId(null);
    }
  };

  // ─── Dashboard Configuration ─────────────────────────────────────
  const activeProfiles = profiles.filter((p) => p.is_active !== false).length;
  const closedProfiles = profiles.filter((p) => p.is_active === false).length;

  const filteredProfiles = useMemo(() => {
    let result = profiles;
    if (statusFilter === "active") result = result.filter((p) => p.is_active !== false);
    if (statusFilter === "closed") result = result.filter((p) => p.is_active === false);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.department_name && p.department_name.toLowerCase().includes(q))
      );
    }
    return result;
  }, [profiles, statusFilter, search]);

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    interviews.forEach((i) => {
      if (i.interview_date) months.add(i.interview_date.slice(0, 7));
    });
    return [...months].sort().reverse();
  }, [interviews]);

  const filteredInterviews = useMemo(() => {
    if (selectedMonth === "all") return interviews;
    return interviews.filter((i) =>
      i.interview_date?.startsWith(selectedMonth),
    );
  }, [interviews, selectedMonth]);

  const totalInterviews = filteredInterviews.length;

  const profileCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredInterviews.forEach((i) => {
      counts[i.resume_profile_id] = (counts[i.resume_profile_id] || 0) + 1;
    });
    return counts;
  }, [filteredInterviews]);

  const chartData = useMemo(() => {
    let relevant: Interview[];
    if (selectedMonth === "all") {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 30);
      cutoff.setHours(0, 0, 0, 0);
      relevant = interviews.filter((i) => {
        if (!i.interview_date) return false;
        return new Date(i.interview_date + "T00:00:00") >= cutoff;
      });
    } else {
      relevant = interviews.filter((i) =>
        i.interview_date?.startsWith(selectedMonth),
      );
    }

    const recentCounts: Record<string, number> = {};
    relevant.forEach((i) => {
      recentCounts[i.resume_profile_id] =
        (recentCounts[i.resume_profile_id] || 0) + 1;
    });
    const topProfiles = [...profiles]
      .sort((a, b) => (recentCounts[b.id] || 0) - (recentCounts[a.id] || 0))
      .slice(0, 4);
    if (topProfiles.length === 0) return [];

    type TimelineEntry = {
      name: string;
      _sortKey: string;
      [profileName: string]: string | number;
    };

    const timeline: Record<string, TimelineEntry> = {};
    [...relevant]
      .sort(
        (a, b) =>
          new Date(a.interview_date!).getTime() -
          new Date(b.interview_date!).getTime(),
      )
      .forEach((i) => {
        const dayKey = i.interview_date!;
        if (!timeline[dayKey]) {
          const d = new Date(dayKey + "T00:00:00");
          timeline[dayKey] = {
            name: d.toLocaleDateString("default", {
              month: "short",
              day: "numeric",
            }),
            _sortKey: dayKey,
          } as TimelineEntry;
          topProfiles.forEach((p) => {
            timeline[dayKey][p.name] = 0;
          });
        }
        const pName = i.resume_profile_name || "";
        if (topProfiles.find((tp) => tp.name === pName)) {
          const current = timeline[dayKey][pName];
          timeline[dayKey][pName] =
            (typeof current === "number" ? current : 0) + 1;
        }
      });

    return Object.values(timeline).sort((a, b) =>
      a._sortKey.localeCompare(b._sortKey),
    );
  }, [profiles, interviews, selectedMonth]);

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

      {/* Month Filter */}
      {availableMonths.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
            Filter by month:
          </span>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedMonth("all")}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${selectedMonth === "all" ? "bg-indigo-500 text-white" : "bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.10]"}`}
            >
              All Time
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
          </div>
        </div>
      )}

      <StatsGrid>
        <StatsCard
          title="Total Profiles"
          value={profiles.length}
          icon={FileUser}
          gradient="bg-gradient-to-br from-indigo-500 to-purple-600"
        />
        <StatsCard
          title="Active"
          value={activeProfiles}
          icon={Activity}
          gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
        />
        <StatsCard
          title="Closed Profiles"
          value={closedProfiles}
          icon={Target}
          gradient="bg-gradient-to-br from-slate-500 to-slate-600"
        />
        <StatsCard
          title="Total Placements"
          value={totalInterviews}
          icon={Activity}
          gradient="bg-gradient-to-br from-fuchsia-500 to-pink-600"
        />
      </StatsGrid>

      {/* Line Chart Analytics Showcase */}
      {chartData.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-6 shadow-sm overflow-hidden">
          <h3 className="mb-6 text-sm font-semibold text-slate-900 dark:text-white">
            {selectedMonth === "all"
              ? "Profile Performance — Last 30 Days"
              : `Profile Performance — ${formatMonthLabel(selectedMonth)}`}
          </h3>
          <div className="h-[300px] w-full ml-[-20px] sm:ml-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#334155"
                  opacity={0.2}
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "none",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                  itemStyle={{ color: "#e2e8f0" }}
                  cursor={{ stroke: "#334155", strokeWidth: 1 }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: "12px", color: "#94a3b8" }}
                />
                {Object.keys(chartData[0] || {})
                  .filter((k) => k !== "name" && k !== "_sortKey")
                  .map((key, index) => (
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

      {/* Profiles Table */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="relative sm:max-w-xs">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search profiles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputClass} pl-10`}
            />
          </div>
        </div>
        <div className="flex gap-1.5">
          {(["active", "closed", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                statusFilter === f
                  ? f === "active"
                    ? "bg-emerald-500 text-white"
                    : f === "closed"
                      ? "bg-slate-500 text-white"
                      : "bg-indigo-500 text-white"
                  : "bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.10]"
              }`}
            >
              {f === "active" ? `Active (${activeProfiles})` : f === "closed" ? `Closed (${closedProfiles})` : `All (${profiles.length})`}
            </button>
          ))}
        </div>
      </div>

      {profiles.length === 0 ? (
        <EmptyState message="No robust profiles generated yet" />
      ) : search.trim() && filteredProfiles.length === 0 ? (
        <EmptyState message="No profiles match your search" />
      ) : profiles.length > 0 && statusFilter !== "all" && filteredProfiles.length === 0 ? (
        <EmptyState message={`No ${statusFilter} profiles found`} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Name</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Department</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Status</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Interviews</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Links</th>
                  <th className="px-5 py-3.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Created</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProfiles.map((profile) => {
                  const isActive = profile.is_active !== false;
                  return (
                    <tr
                      key={profile.id}
                      className="border-b border-slate-200 dark:border-white/[0.06] last:border-b-0 transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.02]"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${isActive ? "from-indigo-500/30 to-purple-500/30 text-indigo-400" : "from-slate-500/20 to-slate-400/20 text-slate-400"}`}>
                            <FileUser size={14} />
                          </div>
                          <span className="font-medium text-slate-900 dark:text-white truncate max-w-[200px]">
                            {profile.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        {profile.department_name ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 border border-indigo-500/20">
                            {profile.department_name}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {isActive ? (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            Active
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-500/10 text-slate-500 border border-slate-500/20">
                            Closed
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-semibold text-slate-900 dark:text-white text-sm">
                          {profileCounts[profile.id] || 0}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          {profile.linkedin_url && (
                            <a
                              href={profile.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                              title="LinkedIn"
                            >
                              <FaLinkedin size={13} />
                            </a>
                          )}
                          {profile.github_url && (
                            <a
                              href={profile.github_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                              title="GitHub"
                            >
                              <FaGithub size={13} />
                            </a>
                          )}
                          {profile.portfolio_url && (
                            <a
                              href={profile.portfolio_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg p-1.5 text-fuchsia-500 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-500/10 transition-colors"
                              title="Portfolio"
                            >
                              <Target size={13} />
                            </a>
                          )}
                          {profile.resume_url ? (
                            <a
                              href={profile.resume_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg p-1.5 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                              title="Resume"
                            >
                              <Eye size={13} />
                            </a>
                          ) : (
                            <span className="rounded-lg p-1.5 text-slate-400 cursor-default" title="No resume uploaded">
                              <FileUser size={13} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-500 dark:text-slate-400 text-[13px] whitespace-nowrap">
                        {formatDate(profile.created_at)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewModal(profile)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors"
                            title="View Profile"
                          >
                            <Eye size={13} />
                          </button>
                          {!cannotCRUD && (
                            <>
                              <button
                                onClick={() => openEdit(profile)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors"
                                title="Edit Profile"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => setDeleteModal(profile)}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                                title="Delete Profile"
                              >
                                <Trash2 size={13} />
                              </button>
                              <div className="relative">
                                <input
                                  id={`resume-input-${profile.id}`}
                                  type="file"
                                  accept="application/pdf"
                                  className="hidden"
                                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleResumeUpload(profile.id, f);
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    document
                                      .getElementById(`resume-input-${profile.id}`)
                                      ?.click()
                                  }
                                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors"
                                  title={profile.resume_url ? "Replace Resume" : "Upload Resume"}
                                  disabled={uploadingProfileId === profile.id}
                                >
                                  {uploadingProfileId === profile.id ? (
                                    <Loader2 className="animate-spin" size={13} />
                                  ) : (
                                    <FileUser size={13} />
                                  )}
                                </button>
                              </div>
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
          {uploadError && (
            <div className="px-5 py-3 border-t border-slate-200 dark:border-white/[0.06]">
              <p className="text-[12px] text-red-500">{uploadError}</p>
            </div>
          )}
        </div>
      )}

      {/* View Profile Modal */}
      <Modal
        open={!!viewModal}
        onClose={() => setViewModal(null)}
        title="Profile Details"
        size="sm"
      >
        {viewModal && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${viewModal.is_active !== false ? "from-indigo-500/20 to-purple-500/20 text-indigo-400" : "from-slate-500/20 to-slate-400/20 text-slate-400"}`}
              >
                <FileUser size={20} />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {viewModal.name}
                </p>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${viewModal.is_active !== false ? "bg-emerald-500/10 text-emerald-500" : "bg-slate-500/10 text-slate-500"}`}
                >
                  {viewModal.is_active !== false ? "Active" : "Closed"}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                  Interviews
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                  {profileCounts[viewModal.id] || 0}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                  Added
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                  {formatDate(viewModal.created_at)}
                </p>
              </div>
            </div>
            {viewModal.linkedin_url ||
            viewModal.github_url ||
            viewModal.portfolio_url ||
            viewModal.resume_url ? (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                  Links
                </p>
                {viewModal.linkedin_url && (
                  <a
                    href={viewModal.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-xl border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/10 px-3 py-2.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors break-all"
                  >
                    <FaLinkedin size={15} className="shrink-0" />
                    {viewModal.linkedin_url}
                  </a>
                )}
                {viewModal.github_url && (
                  <a
                    href={viewModal.github_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03] px-3 py-2.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors break-all"
                  >
                    <FaGithub size={15} className="shrink-0" />
                    {viewModal.github_url}
                  </a>
                )}
                {viewModal.portfolio_url && (
                  <a
                    href={viewModal.portfolio_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-xl border border-fuchsia-200 dark:border-fuchsia-500/20 bg-fuchsia-50 dark:bg-fuchsia-500/10 px-3 py-2.5 text-sm text-fuchsia-600 dark:text-fuchsia-300 hover:bg-fuchsia-100 dark:hover:bg-fuchsia-500/20 transition-colors break-all"
                  >
                    <Target size={15} className="shrink-0" />
                    {viewModal.portfolio_url}
                  </a>
                )}
                {viewModal.resume_url && (
                  <a
                    href={viewModal.resume_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2.5 text-sm text-emerald-600 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors break-all"
                  >
                    <Eye size={15} className="shrink-0" />
                    Download Resume
                  </a>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-400 dark:text-slate-600 italic">
                No links added.
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        open={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
        title="Delete Profile"
        itemName={deleteModal?.name ?? ""}
        itemDetail={
          deleteModal
            ? deleteModal.is_active !== false
              ? "Active"
              : "Closed"
            : undefined
        }
      />

      {/* Profile Modification Framework Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editingId ? "Edit Profile Options" : "Register Profile Framework"
        }
        size="md"
      >
        <div className="space-y-4">
          <FormField label="Full Profile Name">
            <input
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g., Ibrahim Jafri"
              className={inputClass}
              autoFocus
            />
          </FormField>

          <FormField label="Global Usage Status">
            <select
              value={formData.is_active !== false ? "true" : "false"}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  is_active: e.target.value === "true",
                })
              }
              className={selectClass}
            >
              <option value="true">Active (Seeking Deployments)</option>
              <option value="false">Closed (Retired/Hired)</option>
            </select>
          </FormField>

          {isSuperadmin && (
            <FormField label="Department">
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, department_id: null })}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${!formData.department_id ? "bg-indigo-500 text-white" : "bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.10]"}`}
                >
                  None
                </button>
                {departments.filter((d) => d.is_active).map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, department_id: d.id })}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${formData.department_id === d.id ? "bg-indigo-500 text-white" : "bg-slate-100 dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.10]"}`}
                  >
                    {d.name}
                  </button>
                ))}
              </div>
            </FormField>
          )}

          <FormField label="LinkedIn URL">
            <div className="relative">
              <FaLinkedin
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400"
              />
              <input
                value={formData.linkedin_url || ""}
                onChange={(e) =>
                  setFormData({ ...formData, linkedin_url: e.target.value })
                }
                placeholder="https://linkedin.com/in/..."
                className={`${inputClass} pl-8`}
              />
            </div>
          </FormField>

          <FormField label="GitHub URL">
            <div className="relative">
              <FaGithub
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={formData.github_url || ""}
                onChange={(e) =>
                  setFormData({ ...formData, github_url: e.target.value })
                }
                placeholder="https://github.com/..."
                className={`${inputClass} pl-8`}
              />
            </div>
          </FormField>

          <FormField label="Portfolio URL">
            <input
              value={formData.portfolio_url || ""}
              onChange={(e) =>
                setFormData({ ...formData, portfolio_url: e.target.value })
              }
              placeholder="https://portfolio.example.com/..."
              className={inputClass}
            />
          </FormField>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => setModalOpen(false)}
            className={buttonSecondary}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={`${buttonPrimary} disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2`}
          >
            {isSubmitting && <Loader2 className="animate-spin" size={16} />}
            {editingId
              ? isSubmitting
                ? "Applying..."
                : "Apply Update"
              : isSubmitting
                ? "Deploying..."
                : "Deploy"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
