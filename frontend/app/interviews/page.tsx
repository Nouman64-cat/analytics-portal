"use client";

import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
  ChangeEvent,
} from "react";
import {
  Plus,
  Search,
  Eye,
  Pencil,
  Trash2,
  CalendarCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  Users,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Target,
  GitBranch,
  ArrowRight,
} from "lucide-react";
import * as xlsx from "xlsx";
import {
  interviewsService,
  companiesService,
  candidatesService,
  profilesService,
  businessDevelopersService,
} from "@/lib/services";
import {
  formatDate,
  formatTime,
  truncate,
  sortInterviewsInChain,
  suggestNextRoundLabel,
  collectDescendantInterviewIds,
} from "@/lib/utils";
import type {
  Interview,
  Company,
  Candidate,
  ResumeProfile,
  BusinessDeveloper,
  InterviewFormData,
} from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import {
  PageLoader,
  ErrorState,
  PageHeader,
  EmptyState,
} from "@/components/PageStates";
import StatsCard, { StatsGrid } from "@/components/StatsCard";
import Modal, {
  FormField,
  inputClass,
  selectClass,
  textareaClass,
  buttonPrimary,
  buttonSecondary,
} from "@/components/Modal";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import { InterviewChainTimeline } from "@/components/InterviewChainTimeline";
import { getUserRole } from "@/lib/auth";
import { FaLinkedin } from "react-icons/fa";
import { FaGithub } from "react-icons/fa";

function isRejectedInterview(interview: Interview): boolean {
  return interview.computed_status.toLowerCase().includes("rejected");
}

/** Best-effort label from S3 URL path for the interview document field. */
function filenameFromInterviewDocUrl(url: string): string {
  try {
    const path = new URL(url).pathname;
    const seg = path.split("/").filter(Boolean).pop() || "document";
    return decodeURIComponent(seg);
  } catch {
    return "Uploaded document";
  }
}

/** Match `max-h-[min(52vh,17.5rem)]` and width for viewport clamping / flip-above. */
const PIPELINE_POPOVER_MAX_H_PX = () =>
  Math.min(window.innerHeight * 0.52, 17.5 * 16);
const PIPELINE_POPOVER_WIDTH_PX = () =>
  Math.min(window.innerWidth - 20, 16.5 * 16);

function getPipelinePopoverLayout(rect: DOMRect) {
  const GAP = 6;
  const maxH = PIPELINE_POPOVER_MAX_H_PX();
  const spaceBelow = window.innerHeight - rect.bottom - GAP;
  const spaceAbove = rect.top - GAP;
  let flipAbove = false;
  if (spaceBelow < maxH) {
    flipAbove = spaceAbove > spaceBelow;
  }
  const w = PIPELINE_POPOVER_WIDTH_PX();
  const x = Math.max(8, Math.min(rect.left, window.innerWidth - w - 8));
  const y = flipAbove ? rect.top - GAP : rect.bottom + GAP;
  return { x, y, flipAbove };
}

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
    bd_id: "All",
    month: "All",
  });

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    interviews.forEach((i) => {
      if (i.interview_date) {
        const d = new Date(i.interview_date + "T12:00:00");
        const monthName = d.toLocaleString("default", { month: "long" });
        months.add(monthName);
      }
    });
    const monthsOrder = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    return Array.from(months).sort(
      (a, b) => monthsOrder.indexOf(a) - monthsOrder.indexOf(b),
    );
  }, [interviews]);

  // Reset page to 1 when search or filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filters]);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<Interview | null>(null);
  const [deleteModal, setDeleteModal] = useState<Interview | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploadingInterviewId, setUploadingInterviewId] = useState<
    string | null
  >(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [interviewDocFile, setInterviewDocFile] = useState<File | null>(null);
  const [interviewDocError, setInterviewDocError] = useState<string | null>(
    null,
  );

  // Company popover
  const [companyPopover, setCompanyPopover] = useState<{
    company: Company;
    x: number;
    y: number;
  } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!companyPopover) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node)
      ) {
        setCompanyPopover(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [companyPopover]);

  // Profile popover
  const [profilePopover, setProfilePopover] = useState<{
    profile: ResumeProfile;
    x: number;
    y: number;
  } | null>(null);
  const profilePopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profilePopover) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        profilePopoverRef.current &&
        !profilePopoverRef.current.contains(e.target as Node)
      ) {
        setProfilePopover(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profilePopover]);

  /** Hover preview for multi-step pipeline (conversion path) */
  const [pipelinePopover, setPipelinePopover] = useState<{
    interview: Interview;
    chain: Interview[];
    x: number;
    y: number;
    flipAbove: boolean;
  } | null>(null);
  const pipelinePopoverRef = useRef<HTMLDivElement>(null);
  const pipelineHoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    if (!pipelinePopover) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        pipelinePopoverRef.current &&
        !pipelinePopoverRef.current.contains(e.target as Node)
      ) {
        setPipelinePopover(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [pipelinePopover]);

  useEffect(() => {
    return () => {
      if (pipelineHoverTimerRef.current) {
        clearTimeout(pipelineHoverTimerRef.current);
      }
    };
  }, []);

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
      const [
        interviewsData,
        companiesData,
        candidatesData,
        profilesData,
        bdsData,
      ] = await Promise.all([
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

      // Handle deep-linked interview from Dashboard
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const targetId = params.get("id");
        if (targetId) {
          const target = interviewsData.find((i) => i.id === targetId);
          if (target) {
            setDetailModal(target);
            // Clean URL to prevent re-opening on manual refresh
            window.history.replaceState({}, "", "/interviews");
          }
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load interviews",
      );
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
      interviewer: "",
      interview_link: "",
      is_phone_call: false,
      feedback: "",
      recruiter_feedback: "",
      parent_interview_id: undefined,
    });
    setInterviewDocFile(null);
    setInterviewDocError(null);
    setModalOpen(true);
  };

  const openCreateNextRound = (parent: Interview) => {
    setEditingId(null);
    setFormData({
      company_id: parent.company_id,
      candidate_id: parent.candidate_id,
      resume_profile_id: parent.resume_profile_id,
      role: parent.role,
      salary_range: parent.salary_range || "",
      round: suggestNextRoundLabel(parent.round) || "",
      interview_date: "",
      time_est: "",
      time_pkt: "",
      status: "",
      feedback: "",
      recruiter_feedback: "",
      bd_id: parent.bd_id || "",
      interviewer: "",
      interview_link: "",
      is_phone_call: false,
      parent_interview_id: parent.id,
    });
    setInterviewDocFile(null);
    setInterviewDocError(null);
    setDetailModal(null);
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
      recruiter_feedback: interview.recruiter_feedback || "",
      bd_id: interview.bd_id || "",
      interviewer: interview.interviewer || "",
      interview_link: interview.interview_link || "",
      is_phone_call: interview.is_phone_call || false,
      parent_interview_id: interview.parent_interview_id ?? undefined,
    });
    setInterviewDocFile(null);
    setInterviewDocError(null);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
      } as {
        company_id: string;
        candidate_id: string;
        resume_profile_id: string;
        role: string;
        round: string;
        interview_date?: string | null;
        time_est?: string | null;
        time_pkt?: string | null;
        status?: string | null;
        feedback?: string | null;
        recruiter_feedback?: string | null;
        parent_interview_id?: string | null;
        bd_id?: string | null;
        interviewer?: string | null;
        interview_link?: string | null;
        is_phone_call?: boolean;
        salary_range?: string | null;
        [key: string]: string | boolean | null | undefined;
      };

      // Send null to accurately clear fields in the database
      if (!payload.salary_range) payload.salary_range = null;
      if (!payload.interview_date) payload.interview_date = null;
      if (!payload.time_est) payload.time_est = null;
      if (!payload.time_pkt) payload.time_pkt = null;
      if (!payload.status) payload.status = null;
      if (!payload.feedback) payload.feedback = null;
      if (!payload.recruiter_feedback) payload.recruiter_feedback = null;
      if (!payload.bd_id) payload.bd_id = null;

      delete (payload as { thread_id?: string }).thread_id;
      if (editingId) {
        (payload as { parent_interview_id?: string | null }).parent_interview_id =
          formData.parent_interview_id || null;
      } else if (!payload.parent_interview_id) {
        delete (payload as { parent_interview_id?: string }).parent_interview_id;
      }
      if (!payload.interviewer) payload.interviewer = null;
      if (payload.is_phone_call || !payload.interview_link)
        payload.interview_link = null;

      let savedInterview;
      if (editingId) {
        savedInterview = await interviewsService.update(editingId, payload);
      } else {
        savedInterview = await interviewsService.create(payload);
      }

      if (interviewDocFile && savedInterview?.id) {
        if (
          ![
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/pdf",
          ].includes(interviewDocFile.type)
        ) {
          throw new Error("Only DOC, DOCX, and PDF files are allowed.");
        }

        setUploadingInterviewId(savedInterview.id);
        await interviewsService.uploadInterviewDoc(
          savedInterview.id,
          interviewDocFile,
        );
        setUploadingInterviewId(null);
      }

      setModalOpen(false);
      setInterviewDocFile(null);
      setInterviewDocError(null);
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
    dstStart.setDate(1 + ((7 - dstStart.getDay()) % 7) + 7); // 2nd Sunday of March
    const dstEnd = new Date(year, 10, 1); // November 1
    dstEnd.setDate(1 + ((7 - dstEnd.getDay()) % 7)); // 1st Sunday of November
    return d >= dstStart && d < dstEnd;
  };

  // EST (UTC-5) → PKT (UTC+5) = +10h; EDT (UTC-4) → PKT (UTC+5) = +9h
  // Falls back to today's date when no interview date is set yet
  const estToPktOffset = (dateStr?: string | null) => {
    const d = dateStr || new Date().toISOString().split("T")[0];
    return isUsDst(d) ? 9 : 10;
  };

  const shiftTime = (timeStr: string, hours: number): string => {
    const [h, m] = timeStr.split(":").map(Number);
    const total =
      (((h * 60 + m + hours * 60) % (24 * 60)) + 24 * 60) % (24 * 60);
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

  const handleInterviewDocUpload = async (interviewId: string, file?: File) => {
    if (!file) return;
    setUploadError(null);
    setUploadingInterviewId(interviewId);

    if (
      ![
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/pdf",
      ].includes(file.type)
    ) {
      setUploadError("Only DOC, DOCX, and PDF files are allowed.");
      setUploadingInterviewId(null);
      return;
    }

    try {
      await interviewsService.uploadInterviewDoc(interviewId, file);
      const updated = await interviewsService.get(interviewId);
      setDetailModal(updated);
      await fetchData();
    } catch (err) {
      setUploadError(
        err instanceof Error
          ? err.message
          : "Failed to upload interview document",
      );
    } finally {
      setUploadingInterviewId(null);
    }
  };

  const interviewsByThread = useMemo(() => {
    const m = new Map<string, Interview[]>();
    for (const i of interviews) {
      const tid = i.thread_id ?? i.id;
      if (!m.has(tid)) m.set(tid, []);
      m.get(tid)!.push(i);
    }
    for (const arr of m.values()) {
      arr.sort(sortInterviewsInChain);
    }
    return m;
  }, [interviews]);

  const chainStep = useCallback(
    (interview: Interview) => {
      const tid = interview.thread_id ?? interview.id;
      const chain = interviewsByThread.get(tid) || [interview];
      const idx = chain.findIndex((x) => x.id === interview.id);
      return {
        step: idx >= 0 ? idx + 1 : 1,
        total: Math.max(chain.length, 1),
      };
    },
    [interviewsByThread],
  );

  /** Eligible "previous round" rows when editing (same company, candidate, profile; no cycles). */
  const pipelineParentOptions = useMemo(() => {
    if (!editingId) return [] as Interview[];
    const descendants = collectDescendantInterviewIds(interviews, editingId);
    const rows = interviews.filter(
      (i) =>
        i.id !== editingId &&
        !descendants.has(i.id) &&
        i.company_id === formData.company_id &&
        i.candidate_id === formData.candidate_id &&
        i.resume_profile_id === formData.resume_profile_id,
    );
    rows.sort(sortInterviewsInChain);
    return rows;
  }, [
    editingId,
    interviews,
    formData.company_id,
    formData.candidate_id,
    formData.resume_profile_id,
  ]);

  const pipelineParentSelectOptions = useMemo(() => {
    const pid = formData.parent_interview_id;
    if (!pid) return pipelineParentOptions;
    const current = interviews.find((i) => i.id === pid);
    if (current && !pipelineParentOptions.some((x) => x.id === current.id)) {
      return [current, ...pipelineParentOptions];
    }
    return pipelineParentOptions;
  }, [pipelineParentOptions, formData.parent_interview_id, interviews]);

  const editingInterviewForDoc = useMemo(
    () => (editingId ? interviews.find((i) => i.id === editingId) : null),
    [editingId, interviews],
  );
  const existingInterviewDocUrl =
    editingInterviewForDoc?.interview_doc_url ?? null;

  const filtered = interviews.filter((i) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      i.company_name?.toLowerCase().includes(q) ||
      i.candidate_name?.toLowerCase().includes(q) ||
      i.role.toLowerCase().includes(q) ||
      i.status?.toLowerCase().includes(q) ||
      i.resume_profile_name?.toLowerCase().includes(q) ||
      i.feedback?.toLowerCase().includes(q) ||
      i.recruiter_feedback?.toLowerCase().includes(q);

    const interviewCompany = companies.find((c) => c.id === i.company_id);
    const matchCompany =
      filters.company_id === "All" ||
      (filters.company_id === "staffing" &&
        interviewCompany?.is_staffing_firm === true) ||
      (filters.company_id === "direct" &&
        interviewCompany?.is_staffing_firm === false) ||
      i.company_id === filters.company_id;
    const matchCandidate =
      filters.candidate_id === "All" || i.candidate_id === filters.candidate_id;
    const matchProfile =
      filters.resume_profile_id === "All" ||
      i.resume_profile_id === filters.resume_profile_id;
    const matchRound = filters.round === "All" || i.round === filters.round;
    const matchBd = filters.bd_id === "All" || i.bd_id === filters.bd_id;

    let matchStatus = true;
    if (filters.status !== "All") {
      matchStatus =
        i.computed_status.toLowerCase() === filters.status.toLowerCase();
    }

    let matchMonth = true;
    if (filters.month !== "All") {
      if (!i.interview_date) {
        matchMonth = false;
      } else {
        const d = new Date(i.interview_date + "T12:00:00");
        const m = d.toLocaleString("default", { month: "long" });
        matchMonth = m === filters.month;
      }
    }

    return (
      matchSearch &&
      matchCompany &&
      matchCandidate &&
      matchProfile &&
      matchRound &&
      matchBd &&
      matchStatus &&
      matchMonth
    );
  });

  const handleExport = () => {
    const dataToExport = filtered.map((i) => ({
      Company: i.company_name,
      Role: i.role,
      Candidate: i.candidate_name,
      Profile: i.resume_profile_name,
      Round: i.round,
      "Interview Date": i.interview_date ? formatDate(i.interview_date) : "",
      "Time (EST)": i.time_est ? formatTime(i.time_est) : "",
      "Time (PKT)": i.time_pkt ? formatTime(i.time_pkt) : "",
      "Salary Range": i.salary_range || "",
      Status: i.computed_status,
      "Pipeline step": (() => {
        const { step, total } = chainStep(i);
        return total > 1 ? `${step} of ${total}` : "—";
      })(),
      "Thread ID": i.thread_id ?? i.id,
      "Our notes (presentation)": i.feedback || "",
      "Recruiter notes": i.recruiter_feedback || "",
    }));

    const worksheet = xlsx.utils.json_to_sheet(dataToExport);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, "Interviews");
    xlsx.writeFile(
      workbook,
      `Interviews_Export_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  // Computed distributions
  const statusCounts = {
    Upcoming: 0,
    Unresponsed: 0,
    Converted: 0,
    Rejected: 0,
    Dropped: 0,
    Closed: 0,
    Dead: 0,
  };

  filtered.forEach((i) => {
    const label = i.computed_status.toLowerCase();
    if (label === "upcoming") statusCounts.Upcoming++;
    else if (label === "dead") statusCounts.Dead++;
    else if (label === "unresponsed") statusCounts.Unresponsed++;
    else if (label.includes("converted")) statusCounts.Converted++;
    else if (label.includes("rejected")) statusCounts.Rejected++;
    else if (label.includes("dropped")) statusCounts.Dropped++;
    else if (label.includes("closed")) statusCounts.Closed++;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedInterviews = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
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

      <StatsGrid cols={7}>
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
          gradient="bg-gradient-to-br from-orange-500 to-amber-600"
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
          gradient="bg-gradient-to-br from-amber-500 to-yellow-600"
        />
        <StatsCard
          title="Closed"
          value={statusCounts.Closed}
          icon={CheckCircle2}
          gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
        />
        <StatsCard
          title="Dead"
          value={statusCounts.Dead}
          icon={Ban}
          gradient="bg-gradient-to-br from-stone-500 to-stone-600"
        />
      </StatsGrid>

      {/* Filters Row */}
      <div className="flex flex-col gap-4 mb-6 relative z-10">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="relative sm:max-w-md w-full">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-500"
            />
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
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
              className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#12141c] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none transition-all hover:border-slate-300 dark:hover:border-white/[0.12] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Converted">Converted</option>
              <option value="Rejected">Rejected</option>
              <option value="Dropped">Dropped</option>
              <option value="Closed">Closed</option>
              <option value="Upcoming">Upcoming</option>
              <option value="Unresponsed">Unresponsed</option>
              <option value="Dead">Dead</option>
            </select>

            <select
              value={filters.company_id}
              onChange={(e) =>
                setFilters({ ...filters, company_id: e.target.value })
              }
              className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#12141c] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none transition-all hover:border-slate-300 dark:hover:border-white/[0.12] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer"
            >
              <option value="All">All Companies</option>
              <option value="staffing">Staffing Firm</option>
              <option value="direct">Direct Client</option>
            </select>

            <select
              value={filters.candidate_id}
              onChange={(e) =>
                setFilters({ ...filters, candidate_id: e.target.value })
              }
              className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#12141c] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none transition-all hover:border-slate-300 dark:hover:border-white/[0.12] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer max-w-[160px] truncate"
            >
              <option value="All">All Candidates</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={filters.resume_profile_id}
              onChange={(e) =>
                setFilters({ ...filters, resume_profile_id: e.target.value })
              }
              className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#12141c] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none transition-all hover:border-slate-300 dark:hover:border-white/[0.12] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer max-w-[160px] truncate"
            >
              <option value="All">All Profiles</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            <select
              value={filters.round}
              onChange={(e) =>
                setFilters({ ...filters, round: e.target.value })
              }
              className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#12141c] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none transition-all hover:border-slate-300 dark:hover:border-white/[0.12] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer max-w-[130px] truncate"
            >
              <option value="All">All Rounds</option>
              {Array.from(new Set(interviews.map((i) => i.round)))
                .filter(Boolean)
                .map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
            </select>

            <select
              value={filters.bd_id}
              onChange={(e) =>
                setFilters({ ...filters, bd_id: e.target.value })
              }
              className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#12141c] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none transition-all hover:border-slate-300 dark:hover:border-white/[0.12] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer max-w-[160px] truncate"
            >
              <option value="All">All BDs</option>
              {businessDevs.map((bd) => (
                <option key={bd.id} value={bd.id}>
                  {bd.name}
                </option>
              ))}
            </select>

            <select
              value={filters.month}
              onChange={(e) =>
                setFilters({ ...filters, month: e.target.value })
              }
              className="rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#12141c] px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none transition-all hover:border-slate-300 dark:hover:border-white/[0.12] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer max-w-[130px] truncate"
            >
              <option value="All">All Months</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            {(filters.status !== "All" ||
              filters.company_id !== "All" ||
              filters.candidate_id !== "All" ||
              filters.resume_profile_id !== "All" ||
              filters.round !== "All" ||
              filters.bd_id !== "All" ||
              filters.month !== "All") && (
              <button
                onClick={() =>
                  setFilters({
                    status: "All",
                    company_id: "All",
                    candidate_id: "All",
                    resume_profile_id: "All",
                    round: "All",
                    bd_id: "All",
                    month: "All",
                  })
                }
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
            <table className="w-full min-w-[1000px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                    Company
                  </th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                    Role
                  </th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                    Candidate
                  </th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                    Profile
                  </th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                    Round
                  </th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                    Pipeline
                  </th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                    Date
                  </th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                    EST
                  </th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                    PKT
                  </th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                    BD
                  </th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                    Status
                  </th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {paginatedInterviews.map((interview) => {
                  const isUpcoming =
                    interview.computed_status.toLowerCase() === "upcoming";
                  return (
                    <tr
                      key={interview.id}
                      className={`transition-colors ${
                        isUpcoming
                          ? "bg-blue-100 dark:bg-blue-500/[0.15] hover:bg-blue-200/70 dark:hover:bg-blue-500/[0.22] border-l-4 border-l-blue-500 dark:border-l-blue-400"
                          : "hover:bg-slate-100 dark:hover:bg-white/[0.02]"
                      }`}
                    >
                      <td className="px-5 py-3.5 text-sm font-medium text-slate-900 dark:text-white">
                        {(() => {
                          const company = companies.find(
                            (c) => c.id === interview.company_id,
                          );
                          if (!company?.detail)
                            return <span>{interview.company_name}</span>;
                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = (
                                  e.target as HTMLElement
                                ).getBoundingClientRect();
                                setProfilePopover(null);
                                setPipelinePopover(null);
                                setCompanyPopover((prev) =>
                                  prev?.company.id === company.id
                                    ? null
                                    : {
                                        company,
                                        x: rect.left,
                                        y: rect.bottom + 6,
                                      },
                                );
                              }}
                              className="text-left underline decoration-dotted decoration-slate-400 dark:decoration-slate-600 underline-offset-2 cursor-pointer hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                            >
                              {interview.company_name}
                            </button>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-700 dark:text-slate-300 max-w-[200px]">
                        {truncate(interview.role, 40)}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-700 dark:text-slate-300">
                        {interview.candidate_name}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-400">
                        {(() => {
                          const profile = profiles.find(
                            (p) => p.id === interview.resume_profile_id,
                          );
                          if (
                            !profile?.linkedin_url &&
                            !profile?.github_url &&
                            !profile?.portfolio_url &&
                            !profile?.resume_url
                          )
                            return <span>{interview.resume_profile_name}</span>;
                          return (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = (
                                  e.target as HTMLElement
                                ).getBoundingClientRect();
                                setCompanyPopover(null);
                                setPipelinePopover(null);
                                setProfilePopover((prev) =>
                                  prev?.profile.id === profile.id
                                    ? null
                                    : {
                                        profile,
                                        x: rect.left,
                                        y: rect.bottom + 6,
                                      },
                                );
                              }}
                              className="text-left underline decoration-dotted decoration-slate-400 dark:decoration-slate-600 underline-offset-2 cursor-pointer hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors"
                            >
                              {interview.resume_profile_name}
                            </button>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium ${isUpcoming ? "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300" : "bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300"}`}
                        >
                          {interview.round}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {(() => {
                          const { step, total } = chainStep(interview);
                          if (total <= 1) {
                            return (
                              <span className="text-slate-400 dark:text-slate-600">
                                —
                              </span>
                            );
                          }
                          const tid = interview.thread_id ?? interview.id;
                          const chain =
                            interviewsByThread.get(tid) || [interview];
                          return (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-help"
                              title="Hover for pipeline details"
                              aria-label={`Pipeline step ${step} of ${total}, hover or focus for conversion path`}
                              onMouseEnter={(e) => {
                                if (pipelineHoverTimerRef.current) {
                                  clearTimeout(pipelineHoverTimerRef.current);
                                  pipelineHoverTimerRef.current = null;
                                }
                                setCompanyPopover(null);
                                setProfilePopover(null);
                                const rect =
                                  e.currentTarget.getBoundingClientRect();
                                const layout = getPipelinePopoverLayout(rect);
                                setPipelinePopover({
                                  interview,
                                  chain,
                                  x: layout.x,
                                  y: layout.y,
                                  flipAbove: layout.flipAbove,
                                });
                              }}
                              onMouseLeave={() => {
                                pipelineHoverTimerRef.current = setTimeout(
                                  () => setPipelinePopover(null),
                                  200,
                                );
                              }}
                              onFocus={(e) => {
                                if (pipelineHoverTimerRef.current) {
                                  clearTimeout(pipelineHoverTimerRef.current);
                                  pipelineHoverTimerRef.current = null;
                                }
                                setCompanyPopover(null);
                                setProfilePopover(null);
                                const rect =
                                  e.currentTarget.getBoundingClientRect();
                                const layout = getPipelinePopoverLayout(rect);
                                setPipelinePopover({
                                  interview,
                                  chain,
                                  x: layout.x,
                                  y: layout.y,
                                  flipAbove: layout.flipAbove,
                                });
                              }}
                              onBlur={() => {
                                pipelineHoverTimerRef.current = setTimeout(
                                  () => setPipelinePopover(null),
                                  150,
                                );
                              }}
                            >
                              <GitBranch
                                className="size-3.5 shrink-0 opacity-85"
                                aria-hidden
                              />
                              {step}/{total}
                            </button>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-400">
                        {isUpcoming ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-blue-600 dark:text-blue-400">
                            <span className="relative flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                            </span>
                            {formatDate(interview.interview_date)}
                          </span>
                        ) : (
                          formatDate(interview.interview_date)
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-400">
                        {interview.time_est ? (
                          formatTime(interview.time_est)
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-400">
                        {interview.time_pkt ? (
                          formatTime(interview.time_pkt)
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600 dark:text-slate-400">
                        {interview.bd_name || (
                          <span className="text-slate-400 dark:text-slate-600">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={interview.computed_status} />
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
                              {!isRejectedInterview(interview) && (
                                <button
                                  type="button"
                                  onClick={() => openCreateNextRound(interview)}
                                  className="rounded-lg p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/15 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                                  title="Add next round (same pipeline)"
                                >
                                  <ArrowRight size={14} aria-hidden />
                                  <span className="sr-only">Add next round</span>
                                </button>
                              )}
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
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] px-4 py-3 sm:px-6">
              <div className="flex flex-1 justify-between sm:hidden">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center rounded-md border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-transparent px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.02] disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="relative ml-3 inline-flex items-center rounded-md border border-slate-200 dark:border-white/[0.1] bg-white dark:bg-transparent px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.02] disabled:opacity-50"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-slate-700 dark:text-slate-400">
                    Showing{" "}
                    <span className="font-medium">
                      {(currentPage - 1) * ITEMS_PER_PAGE + 1}
                    </span>{" "}
                    to{" "}
                    <span className="font-medium">
                      {Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)}
                    </span>{" "}
                    of <span className="font-medium">{filtered.length}</span>{" "}
                    results
                  </p>
                </div>
                <div>
                  <nav
                    className="isolate inline-flex -space-x-px rounded-md shadow-sm"
                    aria-label="Pagination"
                  >
                    <button
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                        className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold focus:z-20 focus:outline-offset-0 ${
                          currentPage === i + 1
                            ? "z-10 bg-indigo-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                            : "text-slate-900 dark:text-white ring-1 ring-inset ring-slate-200 dark:ring-white/[0.1] hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        {i + 1}
                      </button>
                    ))}
                    <button
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
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
        title={
          editingId
            ? "Edit Interview"
            : formData.parent_interview_id
              ? "Add next round"
              : "Add Interview"
        }
        size="lg"
      >
        {formData.parent_interview_id && !editingId ? (
          <p className="mb-4 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/90 dark:bg-indigo-500/10 px-3 py-2.5 text-sm text-indigo-900 dark:text-indigo-100">
            This round is linked after a previous step in the same pipeline.
            Company, candidate, and profile must stay aligned with that step.
          </p>
        ) : null}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Company">
            <select
              value={formData.company_id}
              onChange={(e) =>
                setFormData({ ...formData, company_id: e.target.value })
              }
              disabled={!!formData.parent_interview_id && !editingId}
              className={selectClass}
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Candidate">
            <select
              value={formData.candidate_id}
              onChange={(e) =>
                setFormData({ ...formData, candidate_id: e.target.value })
              }
              disabled={!!formData.parent_interview_id && !editingId}
              className={selectClass}
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Resume Profile">
            <select
              value={formData.resume_profile_id}
              onChange={(e) =>
                setFormData({ ...formData, resume_profile_id: e.target.value })
              }
              disabled={!!formData.parent_interview_id && !editingId}
              className={selectClass}
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </FormField>
          {editingId ? (
            <div className="col-span-1 sm:col-span-2">
              <FormField label="Previous round (pipeline)">
                <select
                  value={formData.parent_interview_id ?? ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      parent_interview_id: e.target.value || null,
                    })
                  }
                  className={selectClass}
                >
                  <option value="">
                    None — not linked to a prior round
                  </option>
                  {pipelineParentSelectOptions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.round} · {formatDate(i.interview_date)} ·{" "}
                      {i.computed_status || i.status || "—"}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Connect this row to an existing interview for the same company,
                  candidate, and profile. Rounds that come after this one in the
                  chain cannot be selected.
                </p>
              </FormField>
            </div>
          ) : null}
          <FormField label="Round">
            <input
              value={formData.round}
              onChange={(e) =>
                setFormData({ ...formData, round: e.target.value })
              }
              placeholder="e.g., 1st, 2nd, Recruiter's Call"
              className={inputClass}
            />
          </FormField>
          <div className="col-span-1 sm:col-span-2">
            <FormField label="Role">
              <input
                value={formData.role}
                onChange={(e) =>
                  setFormData({ ...formData, role: e.target.value })
                }
                placeholder="e.g., Senior ML Engineer"
                className={inputClass}
              />
            </FormField>
          </div>
          <FormField label="Salary Range">
            <input
              value={formData.salary_range || ""}
              onChange={(e) =>
                setFormData({ ...formData, salary_range: e.target.value })
              }
              placeholder="e.g., $150k - $180k"
              className={inputClass}
            />
          </FormField>
          <FormField label="Business Developer">
            <select
              value={formData.bd_id || ""}
              onChange={(e) =>
                setFormData({ ...formData, bd_id: e.target.value })
              }
              className={selectClass}
            >
              <option value="">None</option>
              {businessDevs.map((bd) => (
                <option key={bd.id} value={bd.id}>
                  {bd.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Interviewer">
            <input
              value={formData.interviewer || ""}
              onChange={(e) =>
                setFormData({ ...formData, interviewer: e.target.value })
              }
              placeholder="e.g., John Smith"
              className={inputClass}
            />
          </FormField>
          <div className="col-span-1 sm:col-span-2">
            <div className="flex items-center gap-3 mb-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.is_phone_call || false}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      is_phone_call: e.target.checked,
                      interview_link: e.target.checked
                        ? ""
                        : formData.interview_link,
                    })
                  }
                  className="h-4 w-4 rounded border-slate-300 dark:border-white/20 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Phone Call
                </span>
              </label>
            </div>
            <FormField label="Interview Link">
              <input
                value={formData.interview_link || ""}
                onChange={(e) =>
                  setFormData({ ...formData, interview_link: e.target.value })
                }
                placeholder="e.g., https://meet.google.com/..."
                disabled={formData.is_phone_call || false}
                className={`${inputClass} disabled:opacity-40 disabled:cursor-not-allowed`}
              />
            </FormField>
          </div>
          <div className="col-span-1 sm:col-span-2">
            <FormField label="Interview Date">
              <input
                type="date"
                value={formData.interview_date || ""}
                onChange={(e) =>
                  setFormData({ ...formData, interview_date: e.target.value })
                }
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
                setFormData({
                  ...formData,
                  time_est: est,
                  time_pkt: est ? shiftTime(est, offset) : "",
                });
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
                setFormData({
                  ...formData,
                  time_pkt: pkt,
                  time_est: pkt ? shiftTime(pkt, -offset) : "",
                });
              }}
              className={inputClass}
            />
          </FormField>
          <div className="col-span-1 sm:col-span-2">
            <FormField label="Status">
              <select
                value={formData.status || ""}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value })
                }
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
            <FormField label="Interview Document (DOC/DOCX/PDF)">
              {existingInterviewDocUrl && !interviewDocFile ? (
                <div className="mb-2 rounded-lg border border-emerald-200/80 bg-emerald-50/90 px-3 py-2 text-sm dark:border-emerald-500/25 dark:bg-emerald-500/10">
                  <p className="font-medium text-emerald-900 dark:text-emerald-100">
                    Document on file
                  </p>
                  <a
                    href={existingInterviewDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-emerald-800 underline decoration-emerald-600/40 underline-offset-2 hover:text-emerald-700 dark:text-emerald-200 dark:hover:text-emerald-100"
                  >
                    {filenameFromInterviewDocUrl(existingInterviewDocUrl)}
                  </a>
                  <p className="mt-1 text-xs text-emerald-800/90 dark:text-emerald-200/80">
                    Choose a file below only if you want to replace it.
                  </p>
                </div>
              ) : null}
              {existingInterviewDocUrl && interviewDocFile ? (
                <p className="mb-2 text-xs text-amber-800 dark:text-amber-200/90">
                  New file below will replace the current document when you save.
                </p>
              ) : null}
              <input
                type="file"
                accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file) {
                    if (
                      ![
                        "application/msword",
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        "application/pdf",
                      ].includes(file.type)
                    ) {
                      setInterviewDocError(
                        "Only DOC, DOCX, and PDF files are allowed.",
                      );
                      setInterviewDocFile(null);
                      return;
                    }
                    setInterviewDocError(null);
                    setInterviewDocFile(file);
                  } else {
                    setInterviewDocFile(null);
                    setInterviewDocError(null);
                  }
                }}
                className={inputClass}
              />
              {interviewDocFile && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Selected file: {interviewDocFile.name}
                </p>
              )}
              {interviewDocError && (
                <p className="mt-1 text-sm text-red-500">{interviewDocError}</p>
              )}
            </FormField>
          </div>
          <div className="col-span-1 sm:col-span-2">
            <FormField label="Our notes (after presentation)">
              <textarea
                value={formData.feedback || ""}
                onChange={(e) =>
                  setFormData({ ...formData, feedback: e.target.value })
                }
                placeholder="Internal SOP: how the interview went on your side, what to improve…"
                rows={4}
                className={textareaClass}
              />
            </FormField>
          </div>
          <div className="col-span-1 sm:col-span-2">
            <FormField label="Recruiter update">
              <textarea
                value={formData.recruiter_feedback || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    recruiter_feedback: e.target.value,
                  })
                }
                placeholder="What the recruiter shared (outcome context). Pipeline outcome stays in Status above."
                rows={3}
                className={textareaClass}
              />
            </FormField>
          </div>
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
                ? "Updating..."
                : "Update"
              : isSubmitting
                ? "Creating..."
                : "Create"}
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
        itemName={
          deleteModal ? `${deleteModal.company_name} — ${deleteModal.role}` : ""
        }
        itemDetail={
          deleteModal
            ? `${deleteModal.candidate_name} · ${deleteModal.round}`
            : undefined
        }
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
            {!cannotCRUD && !isRejectedInterview(detailModal) && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-indigo-200/80 dark:border-indigo-500/30 bg-gradient-to-r from-indigo-50 to-white dark:from-indigo-500/10 dark:to-[#151821] px-4 py-3">
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-medium text-slate-900 dark:text-white">
                    Next step in this pipeline
                  </span>
                  <span className="hidden sm:inline"> — </span>
                  <span className="block sm:inline text-slate-600 dark:text-slate-400">
                    Adds another round linked after this one (same company, candidate, profile).
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => openCreateNextRound(detailModal)}
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400 transition-colors"
                >
                  <ArrowRight size={16} aria-hidden />
                  Add next round
                </button>
              </div>
            )}
            {(() => {
              const tid = detailModal.thread_id ?? detailModal.id;
              const chain =
                interviewsByThread.get(tid) || [detailModal];
              return (
                <InterviewChainTimeline
                  chain={chain}
                  highlightId={detailModal.id}
                />
              );
            })()}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                  Company
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
                  {detailModal.company_name}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                  Role
                </p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">
                  {detailModal.role}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                  Candidate
                </p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">
                  {detailModal.candidate_name}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                  Profile
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-sm text-slate-900 dark:text-white">
                    {detailModal.resume_profile_name}
                  </p>
                  {(() => {
                    const profile = profiles.find(
                      (p) => p.id === detailModal.resume_profile_id,
                    );
                    if (!profile) return null;
                    return (
                      <div className="flex gap-2">
                        {profile.linkedin_url && (
                          <a
                            href={profile.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-400 transition-colors"
                          >
                            <FaLinkedin size={14} />
                          </a>
                        )}
                        {profile.github_url && (
                          <a
                            href={profile.github_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-slate-400 hover:text-slate-300 transition-colors"
                          >
                            <FaGithub size={14} />
                          </a>
                        )}
                        {profile.portfolio_url && (
                          <a
                            href={profile.portfolio_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-fuchsia-500 hover:text-fuchsia-400 transition-colors"
                            title="Portfolio"
                          >
                            <Target size={14} />
                          </a>
                        )}
                        {profile.resume_url && (
                          <a
                            href={profile.resume_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-500 hover:text-emerald-400 transition-colors"
                            title="Resume (PDF)"
                          >
                            <Eye size={14} />
                          </a>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                  Round
                </p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">
                  {detailModal.round}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                  Date
                </p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">
                  {formatDate(detailModal.interview_date)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                  Time (EST)
                </p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">
                  {formatTime(detailModal.time_est)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                  Time (PKT)
                </p>
                <p className="mt-1 text-sm text-slate-900 dark:text-white">
                  {formatTime(detailModal.time_pkt)}
                </p>
              </div>
              {detailModal.salary_range && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                    Salary Range
                  </p>
                  <p className="mt-1 text-sm text-emerald-400">
                    {detailModal.salary_range}
                  </p>
                </div>
              )}
              {detailModal.bd_name && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                    Business Developer
                  </p>
                  <p className="mt-1 text-sm text-slate-900 dark:text-white">
                    {detailModal.bd_name}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Status
                </p>
                <div className="mt-1">
                  <StatusBadge status={detailModal.computed_status} />
                </div>
              </div>
              {detailModal.interviewer && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                    Interviewer
                  </p>
                  <p className="mt-1 text-sm text-slate-900 dark:text-white">
                    {detailModal.interviewer}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                  Interview Medium
                </p>
                {detailModal.is_phone_call ? (
                  <p className="mt-1 text-sm text-slate-900 dark:text-white">
                    Phone Call
                  </p>
                ) : detailModal.interview_link ? (
                  <a
                    href={detailModal.interview_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 text-sm text-indigo-500 hover:text-indigo-400 break-all"
                  >
                    {detailModal.interview_link}
                  </a>
                ) : (
                  <p className="mt-1 text-sm text-slate-400 dark:text-slate-600">
                    —
                  </p>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                  Interview Detail Document
                </p>
                {detailModal.interview_doc_url ? (
                  <a
                    href={detailModal.interview_doc_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-500"
                  >
                    <Download size={14} />
                    Download Document
                  </a>
                ) : (
                  <p className="mt-1 text-sm text-slate-400 dark:text-slate-600">
                    Not uploaded
                  </p>
                )}
                {!cannotCRUD && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      id={`interview-doc-input-${detailModal.id}`}
                      type="file"
                      accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                      className="hidden"
                      onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        const file = e.target.files?.[0];
                        if (file)
                          handleInterviewDocUpload(detailModal.id, file);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() =>
                        document
                          .getElementById(
                            `interview-doc-input-${detailModal.id}`,
                          )
                          ?.click()
                      }
                      className="rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors"
                      disabled={uploadingInterviewId === detailModal.id}
                    >
                      {uploadingInterviewId === detailModal.id
                        ? "Uploading..."
                        : "Upload Document"}
                    </button>
                  </div>
                )}
                {uploadError && uploadingInterviewId === detailModal.id && (
                  <p className="mt-1 text-sm text-red-500">{uploadError}</p>
                )}
              </div>
            </div>
            {(detailModal.feedback || detailModal.recruiter_feedback) && (
              <div className="space-y-4">
                {detailModal.feedback && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                      Our notes (after presentation)
                    </p>
                    <p className="mt-2 whitespace-pre-wrap rounded-xl bg-white dark:bg-white/[0.03] p-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {detailModal.feedback}
                    </p>
                  </div>
                )}
                {detailModal.recruiter_feedback && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                      Recruiter update
                    </p>
                    <p className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 dark:bg-white/[0.04] p-4 text-sm leading-relaxed text-slate-700 dark:text-slate-300 border border-slate-100 dark:border-white/[0.06]">
                      {detailModal.recruiter_feedback}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Pipeline conversion preview (hover on step/total cell) */}
      {pipelinePopover && (
        <div
          ref={pipelinePopoverRef}
          style={{
            position: "fixed",
            top: pipelinePopover.y,
            left: pipelinePopover.x,
            transform: pipelinePopover.flipAbove ? "translateY(-100%)" : undefined,
            zIndex: 10000,
          }}
          className="w-[min(calc(100vw-1.25rem),16.5rem)] max-h-[min(52vh,17.5rem)] overflow-y-auto overflow-x-hidden rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1a1d2a] shadow-2xl px-2.5 py-2 sm:px-3 sm:py-2.5"
          onMouseEnter={() => {
            if (pipelineHoverTimerRef.current) {
              clearTimeout(pipelineHoverTimerRef.current);
              pipelineHoverTimerRef.current = null;
            }
          }}
          onMouseLeave={() => {
            pipelineHoverTimerRef.current = setTimeout(
              () => setPipelinePopover(null),
              200,
            );
          }}
        >
          <header className="mb-2 border-b border-slate-100 dark:border-white/[0.06] pb-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Conversion pipeline
            </p>
            <p
              className="mt-0.5 text-[11px] leading-snug text-slate-700 dark:text-slate-200 line-clamp-3"
              title={`${pipelinePopover.interview.candidate_name} · ${pipelinePopover.interview.company_name} — ${pipelinePopover.interview.role}`}
            >
              {pipelinePopover.interview.candidate_name} ·{" "}
              {pipelinePopover.interview.company_name} —{" "}
              {pipelinePopover.interview.role}
            </p>
          </header>
          <InterviewChainTimeline
            chain={pipelinePopover.chain}
            highlightId={pipelinePopover.interview.id}
            compact
          />
          <p className="mt-2 text-[10px] leading-tight text-slate-500 dark:text-slate-500">
            Linked rounds · status = outcome at each step.
          </p>
        </div>
      )}

      {/* Profile links popover */}
      {profilePopover && (
        <div
          ref={profilePopoverRef}
          style={{
            position: "fixed",
            top: profilePopover.y,
            left: profilePopover.x,
            zIndex: 9999,
          }}
          className="w-72 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1a1d2a] shadow-2xl p-4"
        >
          <p className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            {profilePopover.profile.name}
          </p>
          <div className="space-y-2">
            {profilePopover.profile.linkedin_url && (
              <a
                href={profilePopover.profile.linkedin_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 px-3 py-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors break-all"
              >
                <FaLinkedin size={13} className="shrink-0" />
                LinkedIn Profile
              </a>
            )}
            {profilePopover.profile.github_url && (
              <a
                href={profilePopover.profile.github_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-white/[0.06] px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[0.10] transition-colors break-all"
              >
                <FaGithub size={13} className="shrink-0" />
                GitHub Profile
              </a>
            )}
            {profilePopover.profile.portfolio_url && (
              <a
                href={profilePopover.profile.portfolio_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-fuchsia-50 dark:bg-fuchsia-500/10 px-3 py-2 text-xs text-fuchsia-600 dark:text-fuchsia-300 hover:bg-fuchsia-100 dark:hover:bg-fuchsia-500/20 transition-colors break-all"
              >
                <Target size={13} className="shrink-0" />
                Portfolio
              </a>
            )}
            {profilePopover.profile.resume_url && (
              <a
                href={profilePopover.profile.resume_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors break-all"
              >
                <Eye size={13} className="shrink-0" />
                Resume (PDF)
              </a>
            )}
          </div>
        </div>
      )}

      {/* Company detail popover — fixed positioned to avoid table overflow clipping */}
      {companyPopover && (
        <div
          ref={popoverRef}
          style={{
            position: "fixed",
            top: companyPopover.y,
            left: companyPopover.x,
            zIndex: 9999,
          }}
          className="w-72 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1a1d2a] shadow-2xl p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {companyPopover.company.name}
            </p>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              {companyPopover.company.is_staffing_firm
                ? "Staffing Firm"
                : "Direct Client"}
            </span>
          </div>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
            {companyPopover.company.detail}
          </p>
        </div>
      )}
    </div>
  );
}
