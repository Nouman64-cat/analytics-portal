"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Search, Eye, Pencil, Trash2, CalendarCheck, Clock, CheckCircle2, XCircle, Ban, Users, ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import * as xlsx from "xlsx";
import { interviewsService, companiesService, candidatesService, profilesService, businessDevelopersService } from "@/lib/services";
import { formatDate, formatTime, truncate, getStatusLabel } from "@/lib/utils";
import type { Interview, Company, Candidate, ResumeProfile, BusinessDeveloper, InterviewFormData } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import { PageLoader, ErrorState, PageHeader, EmptyState } from "@/components/PageStates";
import StatsCard, { StatsGrid } from "@/components/StatsCard";
import Modal, { FormField, inputClass, selectClass, textareaClass, buttonPrimary, buttonSecondary } from "@/components/Modal";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import { getUserRole } from "@/lib/auth";

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [businessDevs, setBusinessDevs] = useState<BusinessDeveloper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  const [filters, setFilters] = useState({
    status: "All",
    company_id: "All",
    candidate_id: "All",
    resume_profile_id: "All",
    round: "All",
    bd_id: "All"
  });

  // Reset page to 1 when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filters]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<Interview | null>(null);
  const [deleteModal, setDeleteModal] = useState<Interview | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const role = getUserRole();
  const cannotCRUD = role === "bd" || role === "manager";
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<InterviewFormData>({
    company_id: "",
    candidate_id: "",
    resume_profile_id: "",
    role: "",
    round: "",
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [interviewsData, companiesData, candidatesData, profilesData, bdsData] = await Promise.all([
        interviewsService.list(),
        companiesService.list(),
        candidatesService.list(),
        profilesService.list(),
        businessDevelopersService.list(),
      ]);
      setInterviews(interviewsData);
      setCompanies(companiesData);
      setCandidates(candidatesData);
      setProfiles(profilesData);
      setBusinessDevs(bdsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load interviews");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({
      company_id: companies[0]?.id || "",
      candidate_id: candidates[0]?.id || "",
      resume_profile_id: profiles[0]?.id || "",
      role: "",
      round: "1st",
      bd_id: "",
    });
    setModalOpen(true);
  };

  const openEditModal = (interview: Interview) => {
    setEditingId(interview.id);
    setFormData({
      company_id: interview.company_id,
      candidate_id: interview.candidate_id,
      resume_profile_id: interview.resume_profile_id,
      role: interview.role,
      salary_range: interview.salary_range || "",
      round: interview.round,
      interview_date: interview.interview_date || "",
      time_est: interview.time_est || "",
      time_pkt: interview.time_pkt || "",
      status: interview.status || "",
      feedback: interview.feedback || "",
      bd_id: interview.bd_id || "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const payload: any = { ...formData };
      // Send null to accurately clear fields in the database
      if (!payload.salary_range) payload.salary_range = null;
      if (!payload.interview_date) payload.interview_date = null;
      if (!payload.time_est) payload.time_est = null;
      if (!payload.time_pkt) payload.time_pkt = null;
      if (!payload.status) payload.status = null;
      if (!payload.feedback) payload.feedback = null;
      if (!payload.bd_id) payload.bd_id = null;

      if (editingId) {
        await interviewsService.update(editingId, payload);
      } else {
        await interviewsService.create(payload);
      }
      setModalOpen(false);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Returns true if the US is observing DST on a given date.
  // DST runs from the 2nd Sunday of March to the 1st Sunday of November.
  const isUsDst = (dateStr: string): boolean => {
    const d = new Date(dateStr + "T12:00:00");
    const year = d.getFullYear();
    const dstStart = new Date(year, 2, 1); // March 1
    dstStart.setDate(1 + (7 - dstStart.getDay()) % 7 + 7); // 2nd Sunday of March
    const dstEnd = new Date(year, 10, 1); // November 1
    dstEnd.setDate(1 + (7 - dstEnd.getDay()) % 7); // 1st Sunday of November
    return d >= dstStart && d < dstEnd;
  };

  // EST (UTC-5) → PKT (UTC+5) = +10h; EDT (UTC-4) → PKT (UTC+5) = +9h
  // Falls back to today's date when no interview date is set yet
  const estToPktOffset = (dateStr?: string) => {
    const d = dateStr || new Date().toISOString().split("T")[0];
    return isUsDst(d) ? 9 : 10;
  };

  const shiftTime = (timeStr: string, hours: number): string => {
    const [h, m] = timeStr.split(":").map(Number);
    const total = ((h * 60 + m + hours * 60) % (24 * 60) + 24 * 60) % (24 * 60);
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    setIsDeleting(true);
    try {
      await interviewsService.delete(deleteModal.id);
      setDeleteModal(null);
      fetchData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setIsDeleting(false);
    }
  };

  const filtered = interviews.filter((i) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      i.company_name?.toLowerCase().includes(q) ||
      i.candidate_name?.toLowerCase().includes(q) ||
      i.role.toLowerCase().includes(q) ||
      i.status?.toLowerCase().includes(q) ||
      i.resume_profile_name?.toLowerCase().includes(q);

    const interviewCompany = companies.find(c => c.id === i.company_id);
    const matchCompany =
      filters.company_id === "All" ||
      (filters.company_id === "staffing" && interviewCompany?.is_staffing_firm === true) ||
      (filters.company_id === "direct" && interviewCompany?.is_staffing_firm === false) ||
      i.company_id === filters.company_id;
    const matchCandidate = filters.candidate_id === "All" || i.candidate_id === filters.candidate_id;
    const matchProfile = filters.resume_profile_id === "All" || i.resume_profile_id === filters.resume_profile_id;
    const matchRound = filters.round === "All" || i.round === filters.round;
    const matchBd = filters.bd_id === "All" || i.bd_id === filters.bd_id;

    let matchStatus = true;
    if (filters.status !== "All") {
      const label = getStatusLabel(i.status, i.interview_date).toLowerCase();
      matchStatus = label === filters.status.toLowerCase() || (i.status?.toLowerCase() || "").includes(filters.status.toLowerCase());
    }

    return matchSearch && matchCompany && matchCandidate && matchProfile && matchRound && matchBd && matchStatus;
  });

  const handleExport = () => {
    const dataToExport = filtered.map(i => ({
      Company: i.company_name,
      Role: i.role,
      Candidate: i.candidate_name,
      Profile: i.resume_profile_name,
      Round: i.round,
      "Interview Date": i.interview_date ? formatDate(i.interview_date) : "",
      "Time (EST)": i.time_est ? formatTime(i.time_est) : "",
      "Time (PKT)": i.time_pkt ? formatTime(i.time_pkt) : "",
      "Salary Range": i.salary_range || "",
      Status: getStatusLabel(i.status, i.interview_date),
      Feedback: i.feedback || "",
    }));

    const worksheet = xlsx.utils.json_to_sheet(dataToExport);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Interviews");
    xlsx.writeFile(workbook, `Interviews_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  // Computed distributions
  const statusCounts = { Upcoming: 0, Unresponsed: 0, Converted: 0, Rejected: 0, Dropped: 0, Closed: 0 };

  filtered.forEach(i => {
    const label = getStatusLabel(i.status, i.interview_date).toLowerCase();
    if (label === "upcoming") statusCounts.Upcoming++;
    else if (label === "unresponsed") statusCounts.Unresponsed++;
    else if (label.includes("converted")) statusCounts.Converted++;
    else if (label.includes("rejected")) statusCounts.Rejected++;
    else if (label.includes("dropped")) statusCounts.Dropped++;
    else if (label.includes("closed")) statusCounts.Closed++;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedInterviews = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Interviews"
        subtitle={`${interviews.length} total interviews`}
        action={
          <div className="flex gap-2">
            <button onClick={handleExport} className={buttonSecondary}>
              <Download size={16} />
              Export
            </button>
            {!cannotCRUD && (
              <button onClick={openCreateModal} className={buttonPrimary}>
                <Plus size={16} />
                Add Interview
              </button>
            )}
          </div>
        }
      />

      {/* Status Cards */}
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white mt-8 mb-2">Pipeline Status</h3>
      <StatsGrid cols={6}>
        <StatsCard
          title="Upcoming"
          value={statusCounts.Upcoming}
          icon={CalendarCheck}
          gradient="bg-gradient-to-br from-blue-500 to-indigo-600"
        />
        <StatsCard
          title="Unresponsed"
          value={statusCounts.Unresponsed}
          icon={Clock}
          gradient="bg-gradient-to-br from-slate-500 to-slate-600"
        />
        <StatsCard
          title="Converted"
          value={statusCounts.Converted}
          icon={CheckCircle2}
          gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
        />
        <StatsCard
          title="Rejected"
          value={statusCounts.Rejected}
          icon={XCircle}
          gradient="bg-gradient-to-br from-red-500 to-rose-600"
        />
        <StatsCard
          title="Dropped"
          value={statusCounts.Dropped}
          icon={Ban}
          gradient="bg-gradient-to-br from-amber-500 to-orange-600"
        />
        <StatsCard
          title="Closed"
          value={statusCounts.Closed}
          icon={XCircle}
          gradient="bg-gradient-to-br from-slate-500 to-slate-600"
        />
      </StatsGrid>

      {/* Filters Row */}
      <div className="flex flex-col gap-4 mb-6 relative z-10">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative sm:max-w-md w-full">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-500" />
            <input
              type="text"
              placeholder="Search interviews..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`${inputClass} pl-10`}
            />
          </div>

          {/* Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-2 w-full">
            <select
              value={filters.status}
              onChange={e => setFilters({ ...filters, status: e.target.value })}
              className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#12141c] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none transition-all hover:border-slate-300 dark:hover:border-white/[0.12] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Converted">Converted</option>
              <option value="Rejected">Rejected</option>
              <option value="Dropped">Dropped</option>
              <option value="Closed">Closed</option>
              <option value="Upcoming">Upcoming</option>
              <option value="Unresponsed">Unresponsed</option>
            </select>

            <select
              value={filters.company_id}
              onChange={e => setFilters({ ...filters, company_id: e.target.value })}
              className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#12141c] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none transition-all hover:border-slate-300 dark:hover:border-white/[0.12] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer"
            >
              <option value="All">All Companies</option>
              <option value="staffing">Staffing Firm</option>
              <option value="direct">Direct Client</option>
            </select>

            <select
              value={filters.candidate_id}
              onChange={e => setFilters({ ...filters, candidate_id: e.target.value })}
              className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#12141c] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none transition-all hover:border-slate-300 dark:hover:border-white/[0.12] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer max-w-[160px] truncate"
            >
              <option value="All">All Candidates</option>
              {candidates.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            <select
              value={filters.resume_profile_id}
              onChange={e => setFilters({ ...filters, resume_profile_id: e.target.value })}
              className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#12141c] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none transition-all hover:border-slate-300 dark:hover:border-white/[0.12] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer max-w-[160px] truncate"
            >
              <option value="All">All Profiles</option>
              {profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>

            <select
              value={filters.round}
              onChange={e => setFilters({ ...filters, round: e.target.value })}
              className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#12141c] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none transition-all hover:border-slate-300 dark:hover:border-white/[0.12] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer max-w-[130px] truncate"
            >
              <option value="All">All Rounds</option>
              {Array.from(new Set(interviews.map(i => i.round))).filter(Boolean).map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            <select
              value={filters.bd_id}
              onChange={e => setFilters({ ...filters, bd_id: e.target.value })}
              className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#12141c] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none transition-all hover:border-slate-300 dark:hover:border-white/[0.12] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer max-w-[160px] truncate"
            >
              <option value="All">All BDs</option>
              {businessDevs.map(bd => (
                <option key={bd.id} value={bd.id}>{bd.name}</option>
              ))}
            </select>

            {(filters.status !== "All" || filters.company_id !== "All" || filters.candidate_id !== "All" || filters.resume_profile_id !== "All" || filters.round !== "All" || filters.bd_id !== "All") && (
              <button
                onClick={() => setFilters({ status: "All", company_id: "All", candidate_id: "All", resume_profile_id: "All", round: "All", bd_id: "All" })}
                className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors px-2 ml-1"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState message="No interviews found" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Company</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Role</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Candidate</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Profile</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Round</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Date</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">EST</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">PKT</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">BD</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Status</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {paginatedInterviews.map((interview) => (
                  <tr
                    key={interview.id}
                    className="transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.02]"
                  >
                    <td className="px-5 py-3.5 text-sm font-medium text-slate-900 dark:text-white">
                      {interview.company_name}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-700 dark:text-slate-300 max-w-[200px]">
                      {truncate(interview.role, 40)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-700 dark:text-slate-300">
                      {interview.candidate_name}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-400">
                      {interview.resume_profile_name}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center rounded-lg bg-slate-100 dark:bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                        {interview.round}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-400">
                      {formatDate(interview.interview_date)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-400">
                      {interview.time_est ? formatTime(interview.time_est) : <span className="text-slate-400 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-400">
                      {interview.time_pkt ? formatTime(interview.time_pkt) : <span className="text-slate-400 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-400">
                      {interview.bd_name || <span className="text-slate-400 dark:text-slate-600">—</span>}
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusBadge status={interview.status} dateStr={interview.interview_date} />
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setDetailModal(interview)}
                          className="rounded-lg p-2 text-slate-500 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:text-white transition-colors"
                          title="View details"
                        >
                          <Eye size={14} />
                        </button>
                        {!cannotCRUD && (
                          <>
                            <button
                              onClick={() => openEditModal(interview)}
                              className="rounded-lg p-2 text-slate-500 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:text-white transition-colors"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setDeleteModal(interview)}
                              className="rounded-lg p-2 text-slate-500 dark:text-slate-500 hover:bg-red-500/10 hover:text-red-400 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] px-4 py-3 sm:px-6">
              <div className="flex flex-1 justify-between sm:hidden">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center rounded-md border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-transparent px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.02] disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="relative ml-3 inline-flex items-center rounded-md border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-transparent px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.02] disabled:opacity-50"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-slate-700 dark:text-slate-400">
                    Showing <span className="font-medium">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> to <span className="font-medium">{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}</span> of{' '}
                    <span className="font-medium">{filtered.length}</span> results
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="relative inline-flex items-center rounded-l-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-200 dark:ring-white/[0.1] hover:bg-slate-50 dark:hover:bg-white/[0.04] focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                    >
                      <span className="sr-only">Previous</span>
                      <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                    </button>
                    {/* Generates page buttons limited to total pages */}
                    {[...Array(totalPages)].map((_, i) => (
                      <button
                        key={i + 1}
                        onClick={() => setCurrentPage(i + 1)}
                        className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold focus:z-20 focus:outline-offset-0 ${currentPage === i + 1
                          ? "z-10 bg-indigo-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                          : "text-slate-900 dark:text-white ring-1 ring-inset ring-slate-200 dark:ring-white/[0.1] hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                          }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="relative inline-flex items-center rounded-r-md px-2 py-2 text-slate-400 ring-1 ring-inset ring-slate-200 dark:ring-white/[0.1] hover:bg-slate-50 dark:hover:bg-white/[0.04] focus:z-20 focus:outline-offset-0 disabled:opacity-50"
                    >
                      <span className="sr-only">Next</span>
                      <ChevronRight className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Interview" : "Add Interview"}
        size="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Company">
            <select
              value={formData.company_id}
              onChange={(e) => setFormData({ ...formData, company_id: e.target.value })}
              className={selectClass}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Candidate">
            <select
              value={formData.candidate_id}
              onChange={(e) => setFormData({ ...formData, candidate_id: e.target.value })}
              className={selectClass}
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Resume Profile">
            <select
              value={formData.resume_profile_id}
              onChange={(e) => setFormData({ ...formData, resume_profile_id: e.target.value })}
              className={selectClass}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Round">
            <input
              value={formData.round}
              onChange={(e) => setFormData({ ...formData, round: e.target.value })}
              placeholder="e.g., 1st, 2nd, Recruiter's Call"
              className={inputClass}
            />
          </FormField>
          <div className="col-span-1 sm:col-span-2">
            <FormField label="Role">
              <input
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                placeholder="e.g., Senior ML Engineer"
                className={inputClass}
              />
            </FormField>
          </div>
          <FormField label="Salary Range">
            <input
              value={formData.salary_range || ""}
              onChange={(e) => setFormData({ ...formData, salary_range: e.target.value })}
              placeholder="e.g., $150k - $180k"
              className={inputClass}
            />
          </FormField>
          <FormField label="Business Developer">
            <select
              value={formData.bd_id || ""}
              onChange={(e) => setFormData({ ...formData, bd_id: e.target.value })}
              className={selectClass}
            >
              <option value="">None</option>
              {businessDevs.map((bd) => (
                <option key={bd.id} value={bd.id}>{bd.name}</option>
              ))}
            </select>
          </FormField>
          <div className="col-span-1 sm:col-span-2">
            <FormField label="Interview Date">
              <input
                type="date"
                value={formData.interview_date || ""}
                onChange={(e) => setFormData({ ...formData, interview_date: e.target.value })}
                className={inputClass}
              />
            </FormField>
          </div>
          <FormField label="Time (EST)">
            <input
              type="time"
              value={formData.time_est || ""}
              onChange={(e) => {
                const est = e.target.value;
                const offset = estToPktOffset(formData.interview_date);
                setFormData({ ...formData, time_est: est, time_pkt: est ? shiftTime(est, offset) : "" });
              }}
              className={inputClass}
            />
          </FormField>
          <FormField label="Time (PKT)">
            <input
              type="time"
              value={formData.time_pkt || ""}
              onChange={(e) => {
                const pkt = e.target.value;
                const offset = estToPktOffset(formData.interview_date);
                setFormData({ ...formData, time_pkt: pkt, time_est: pkt ? shiftTime(pkt, -offset) : "" });
              }}
              className={inputClass}
            />
          </FormField>
          <div className="col-span-1 sm:col-span-2">
            <FormField label="Status">
              <select
                value={formData.status || ""}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className={selectClass}
              >
                <option value="">Select a status...</option>
                <option value="Converted">Converted</option>
                <option value="Rejected">Rejected</option>
                <option value="Dropped">Dropped</option>
                <option value="Closed">Closed</option>
                <option value="Upcoming">Upcoming</option>
                <option value="Unresponsed">Unresponsed</option>
              </select>
            </FormField>
          </div>
          <div className="col-span-1 sm:col-span-2">
            <FormField label="Feedback">
              <textarea
                value={formData.feedback || ""}
                onChange={(e) => setFormData({ ...formData, feedback: e.target.value })}
                placeholder="Interview notes and feedback..."
                rows={4}
                className={textareaClass}
              />
            </FormField>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={() => setModalOpen(false)} className={buttonSecondary}>
            Cancel
          </button>
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
        title="Delete Interview"
        itemName={deleteModal ? `${deleteModal.company_name} — ${deleteModal.role}` : ""}
        itemDetail={deleteModal ? `${deleteModal.candidate_name} · ${deleteModal.round}` : undefined}
      />

      {/* Detail Modal */}
      <Modal
        open={!!detailModal}
        onClose={() => setDetailModal(null)}
        title="Interview Details"
        size="lg"
      >
        {detailModal && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Company</p>
                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{detailModal.company_name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Role</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">{detailModal.role}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Candidate</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">{detailModal.candidate_name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Profile</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">{detailModal.resume_profile_name}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Round</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">{detailModal.round}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Date</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">{formatDate(detailModal.interview_date)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Time (EST)</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">{formatTime(detailModal.time_est)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Time (PKT)</p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">{formatTime(detailModal.time_pkt)}</p>
              </div>
              {detailModal.salary_range && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Salary Range</p>
                  <p className="mt-1 text-sm text-emerald-400">{detailModal.salary_range}</p>
                </div>
              )}
              {detailModal.bd_name && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Business Developer</p>
                  <p className="mt-1 text-sm text-slate-900 dark:text-white">{detailModal.bd_name}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status</p>
                <div className="mt-1"><StatusBadge status={detailModal.status} dateStr={detailModal.interview_date} /></div>
              </div>
            </div>
            {detailModal.feedback && (
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">Feedback</p>
                <p className="mt-2 whitespace-pre-wrap rounded-xl bg-white dark:bg-white/[0.03] p-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {detailModal.feedback}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
