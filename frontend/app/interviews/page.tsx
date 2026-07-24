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
  CheckCircle2,
  Users,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Download,
  Loader2,
  Target,
  GitBranch,
  ArrowRight,
  SlidersHorizontal,
  ExternalLink,
  Copy,
  MapPin,
  Wind,
  Thermometer,
  Map as MapIcon,
  Upload,
  Sparkles,
  Check,
} from "lucide-react";
import * as xlsx from "xlsx";
import {
  interviewsService,
  companiesService,
  candidatesService,
  profilesService,
  businessDevelopersService,
  authService,
  leadsService,
  jobRolesService,
} from "@/lib/services";
import {
  formatInterviewDateEst,
  formatTime,
  truncate,
  sortInterviewsInChain,
  suggestNextRoundLabel,
  collectDescendantInterviewIds,
  getLeadOutcomeBadgeStyle,
  getLeadOutcomeSelectShellClass,
  getLeadOutcomeEmoji,
  getStatusStyle,
  getTodayEst,
  minutesUntilInterview,
} from "@/lib/utils";
import { INTERVIEW_STATS_GRADIENT } from "@/lib/constants";
import type {
  Interview,
  Company,
  Candidate,
  ResumeProfile,
  BusinessDeveloper,
  InterviewFormData,
  LeadListItem,
  JobRole,
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
import CompanyCombobox from "@/components/CompanyCombobox";
import RoleCombobox from "@/components/RoleCombobox";
import SearchableSelect from "@/components/SearchableSelect";
import TypeableSelect from "@/components/TypeableSelect";
import { InterviewChainTimeline } from "@/components/InterviewChainTimeline";
import { getUserRole } from "@/lib/auth";
import { useDepartmentContext } from "@/lib/DepartmentContext";
import { FaLinkedin } from "react-icons/fa";
import { FaGithub } from "react-icons/fa";
import DateRangeFilter from "@/components/DateRangeFilter";
import Link from "next/link";
import { useProfileWeather } from "@/hooks/useProfileWeather";
import LocationAutocomplete from "@/components/LocationAutocomplete";

// ─── Weather Card (shown in Interview Details modal) ────────

function WeatherCard({ location }: { location: string }) {
  const { loading, error, weather, description } = useProfileWeather(location);
  const [mapExpanded, setMapExpanded] = useState(false);

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02] px-4 py-3 animate-pulse">
        <MapPin size={14} className="text-rose-400 shrink-0" />
        <span className="text-xs text-slate-500 dark:text-slate-400">{location} — loading weather…</span>
      </div>
    );
  }

  if (error || !weather) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02] px-4 py-3">
        <MapPin size={14} className="text-rose-400 shrink-0" />
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {location}
          {error ? ` — ${error}` : ""}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-rose-200/70 dark:border-rose-500/20 bg-gradient-to-r from-rose-50/60 to-orange-50/40 dark:from-rose-500/[0.06] dark:to-orange-500/[0.04] p-4 relative">
      <div className="flex flex-wrap md:flex-nowrap items-center gap-4 min-w-0">
        
        {/* Left side: Location and weather */}
        <div className="flex flex-col gap-2.5 min-w-0 flex-1">
          {/* Location + local time */}
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <MapPin size={13} className="text-rose-500 dark:text-rose-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
              {weather.cityName}{weather.country ? `, ${weather.country}` : ""}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              🕐 {weather.localTime} · {weather.localDate}
            </span>
          </div>

          {/* Weather Details */}
          <div className="flex items-center gap-4 flex-wrap">
            {/* Temperature */}
            <div className="flex items-center gap-1.5">
              <Thermometer size={13} className="text-amber-500 shrink-0" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                {weather.temp}°C / {Math.round((weather.temp * 9) / 5 + 32)}°F
              </span>
            </div>

            {/* Condition */}
            <span className="text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
              {description}
            </span>

            {/* Wind */}
            <div className="flex items-center gap-1.5">
              <Wind size={13} className="text-sky-500 shrink-0" />
              <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {weather.windspeed} km/h
              </span>
            </div>
          </div>
        </div>

        {/* Right side: Map Button */}
        <button 
          type="button"
          onClick={() => setMapExpanded(!mapExpanded)}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-500/30 bg-white/60 dark:bg-black/20 text-rose-600 dark:text-rose-400 hover:bg-white dark:hover:bg-black/40 transition-colors shrink-0 w-full md:w-auto"
        >
          <MapIcon size={14} />
          {mapExpanded ? "Hide Map" : "Show Map"}
        </button>
      </div>

      {/* Embedded Map */}
      {mapExpanded && (
        <div className="mt-1 w-full rounded-lg overflow-hidden border border-rose-200 dark:border-rose-500/20 shadow-inner h-48 md:h-64 transition-all">
          <iframe
            width="100%"
            height="100%"
            frameBorder="0"
            scrolling="no"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${weather.longitude - 0.05},${weather.latitude - 0.05},${weather.longitude + 0.05},${weather.latitude + 0.05}&layer=mapnik&marker=${weather.latitude},${weather.longitude}`}
            className="w-full h-full"
          />
        </div>
      )}
    </div>
  );
}

// ─── Inline Location Editor (for missing location in modal) ──

function InlineLocationEditor({
  profileId,
  onLocationUpdated,
}: {
  profileId: string;
  onLocationUpdated: (loc: string) => void;
}) {
  const [loc, setLoc] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!loc.trim()) return;
    setSaving(true);
    try {
      await profilesService.update(profileId, { location: loc });
      onLocationUpdated(loc);
    } catch (err) {
      alert("Failed to save location");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-slate-300 dark:border-white/[0.12] bg-slate-50/50 dark:bg-white/[0.02] px-4 py-3.5">
      <div className="flex items-center gap-2">
        <MapPin size={13} className="text-slate-400 shrink-0" />
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Add Location to view local weather & time
        </span>
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <LocationAutocomplete
            value={loc}
            onChange={setLoc}
            className={`${inputClass} text-sm`}
            placeholder="e.g., Karachi, Pakistan"
          />
        </div>
        <button
          type="button"
          disabled={saving || !loc.trim()}
          onClick={handleSave}
          className={`${buttonPrimary} px-3 py-1.5 min-w-[70px] justify-center`}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : "Save"}
        </button>
      </div>
    </div>
  );
}

// ─── Quick-create lead (used inside the interview form) ─────

function QuickCreateLead({
  companies,
  profiles,
  candidates,
  jobRoles,
  isTeamMember,
  meCandidateId,
  onCompanyCreated,
  onRoleCreated,
  onLeadCreated,
}: {
  companies: Company[];
  profiles: ResumeProfile[];
  candidates: Candidate[];
  jobRoles: JobRole[];
  isTeamMember: boolean;
  meCandidateId: string | null;
  onCompanyCreated: (c: Company) => void;
  onRoleCreated: (r: JobRole) => void;
  onLeadCreated: (lead: LeadListItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [role, setRole] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [saving, setSaving] = useState(false);
  const { departmentId } = useDepartmentContext();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !profileId || !role.trim()) return;
    const effectiveCandidateId = isTeamMember
      ? (meCandidateId ?? "")
      : candidateId;
    if (!effectiveCandidateId) {
      alert("Select a candidate for this lead.");
      return;
    }
    setSaving(true);
    try {
      const lead = await leadsService.create({
        company_id: companyId,
        resume_profile_id: profileId,
        role: role.trim(),
        candidate_id: effectiveCandidateId,
        active_department_id: departmentId || null,
      });
      onLeadCreated(lead);
      setExpanded(false);
      setCompanyId("");
      setProfileId("");
      setRole("");
      setCandidateId("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create lead");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2">
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium transition-colors"
        >
          <Plus size={13} />
          Don't see the lead? Create one here
        </button>
      ) : (
        <div className="border border-indigo-200 dark:border-indigo-500/20 rounded-xl bg-indigo-50/50 dark:bg-indigo-500/[0.04] p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
              New lead
            </p>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2.5">
            <FormField label="Company">
              <CompanyCombobox
                companies={companies}
                value={companyId}
                onChange={setCompanyId}
                onCompanyCreated={(c) => {
                  onCompanyCreated(c);
                  setCompanyId(c.id);
                }}
              />
            </FormField>

            <FormField label="Resume profile">
              <SearchableSelect
                options={profiles.map((p) => ({ id: p.id, label: p.name }))}
                value={profileId}
                onChange={setProfileId}
                placeholder="Select profile…"
                required
              />
            </FormField>

            <FormField label="Role / title">
              <RoleCombobox
                roles={jobRoles}
                value={role}
                onChange={setRole}
                onRoleCreated={onRoleCreated}
                placeholder="e.g. Senior Engineer"
                required
              />
            </FormField>

            {!isTeamMember && (
              <FormField label="Candidate">
                <SearchableSelect
                  options={candidates.map((c) => ({ id: c.id, label: c.name }))}
                  value={candidateId}
                  onChange={setCandidateId}
                  placeholder="Select candidate…"
                  required
                />
              </FormField>
            )}

            <button
              type="submit"
              disabled={saving || !companyId || !profileId || !role.trim()}
              className={`${buttonPrimary} w-full justify-center`}
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}
              Create lead & select
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────

function isRejectedInterview(interview: Interview): boolean {
  if (interview.lead_outcome?.toLowerCase() === "rejected") return true;
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

const LEAD_OUTCOME_OPTIONS: { value: string; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "unresponsive", label: "Unresponsive" },
  { value: "dropped", label: "Dropped" },
  { value: "dead", label: "Dead" },
  { value: "rejected", label: "Rejected" },
  { value: "closed", label: "Closed" },
];

function LeadThreadPanel({
  threadId,
  interview,
  fetchData,
  onUpdateDetail,
  readOnly,
  embedded,
}: {
  threadId: string;
  interview: Interview;
  fetchData: () => Promise<void>;
  onUpdateDetail: (patch: Partial<Interview>) => void;
  readOnly?: boolean;
  /** Omit outer card and heading when wrapped in a parent lead/opportunity section. */
  embedded?: boolean;
}) {
  const explicit = interview.lead_source === "explicit";
  const [override, setOverride] = useState<string>(
    explicit && interview.lead_outcome ? interview.lead_outcome : "",
  );
  const [notes, setNotes] = useState(interview.lead_notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const ex = interview.lead_source === "explicit";
    setOverride(ex && interview.lead_outcome ? interview.lead_outcome : "");
    setNotes(interview.lead_notes ?? "");
  }, [
    threadId,
    interview.id,
    interview.lead_source,
    interview.lead_outcome,
    interview.lead_notes,
  ]);

  const handleSave = async () => {
    setSaving(true);
    try {
      let res;
      if (!override) {
        res = await interviewsService.updateLead(threadId, {
          clear_override: true,
          ...(notes.trim() !== "" ? { notes: notes.trim() } : {}),
        });
      } else {
        res = await interviewsService.updateLead(threadId, {
          outcome_override: override,
          ...(notes.trim() !== "" ? { notes: notes.trim() } : {}),
        });
      }
      onUpdateDetail({
        lead_outcome: res.lead_outcome,
        lead_status_label: res.lead_status_label,
        lead_source: res.lead_source,
        lead_notes: res.lead_notes ?? null,
        lead_closed_at: res.lead_closed_at ?? null,
      });
      await fetchData();
    } finally {
      setSaving(false);
    }
  };

  const sourceHint = (
    <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
      (
      {interview.lead_source === "explicit"
        ? "manual override"
        : "from interviews"}
      )
    </span>
  );

  const embeddedLeadLbl = "text-indigo-800 dark:text-indigo-200/90";
  const cardLeadLbl = "text-amber-800 dark:text-amber-200/90";

  const leadBadge = (
    outcome: string | null | undefined,
    label: string | null | undefined,
  ) => {
    const loStyle = getLeadOutcomeBadgeStyle(outcome);
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${loStyle.bg} ${loStyle.text}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${loStyle.dot}`} />
        <span aria-hidden="true">{getLeadOutcomeEmoji(outcome)}</span>
        {label ?? "—"}
      </span>
    );
  };

  const body = (
    <>
      {embedded && readOnly ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            className={`text-xs font-semibold uppercase tracking-wider shrink-0 ${embeddedLeadLbl}`}
          >
            Lead
          </span>
          {leadBadge(interview.lead_outcome, interview.lead_status_label)}
          <Link
            href={`/leads?thread_id=${threadId}`}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline ml-auto shrink-0"
          >
            <ExternalLink size={11} className="shrink-0" />
            View lead
          </Link>
        </div>
      ) : embedded ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span
            className={`text-xs font-semibold uppercase tracking-wider shrink-0 ${embeddedLeadLbl}`}
          >
            Lead
          </span>
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            {leadBadge(interview.lead_outcome, interview.lead_status_label)}
            {sourceHint}
          </span>
        </div>
      ) : (
        <>
          <h4
            className={`text-xs font-semibold uppercase tracking-wider ${cardLeadLbl}`}
          >
            Lead
          </h4>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {leadBadge(interview.lead_outcome, interview.lead_status_label)}
            {sourceHint}
          </div>
        </>
      )}
      {readOnly ? (
        interview.lead_notes && (
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
            {interview.lead_notes}
          </p>
        )
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Override outcome
            </label>
            <select
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              className={`${selectClass} ${getLeadOutcomeSelectShellClass(override || interview.lead_outcome)}`}
            >
              <option value="">
                Use status from interviews (clear override)
              </option>
              {LEAD_OUTCOME_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={textareaClass}
              placeholder="Context for this lead status…"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className={buttonPrimary + " text-sm py-2 px-4"}
          >
            {saving ? "Saving…" : "Save lead status"}
          </button>
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="space-y-2">{body}</div>;
  }

  return (
    <div className="rounded-xl border border-amber-200/80 dark:border-amber-500/25 bg-amber-50/40 dark:bg-amber-500/5 p-4">
      {body}
    </div>
  );
}

export default function InterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  /** Full thread chains for team members (main list is scoped per candidate). */
  const [pipelineThreadChains, setPipelineThreadChains] = useState<
    Record<string, Interview[]>
  >({});
  const [companies, setCompanies] = useState<Company[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [businessDevs, setBusinessDevs] = useState<BusinessDeveloper[]>([]);
  const [jobRoles, setJobRoles] = useState<JobRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;
  const [filters, setFilters] = useState({
    status: "All",
    company_id: "All",
    candidate_id: "All",
    resume_profile_id: "All",
    round: "All",
    bd_id: "All",
    month: "All",
    is_today: false,
    date_from: "",
    date_to: "",
  });
  const [showExtraFilters, setShowExtraFilters] = useState(false);

  // Ticks every 30 s so countdown badges in the table stay live.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

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
  const [linkCopied, setLinkCopied] = useState(false);
  const [deleteModal, setDeleteModal] = useState<Interview | null>(null);
  const [leadOpen, setLeadOpen] = useState(true);
  const [ivOpen, setIvOpen] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [uploadingInterviewId, setUploadingInterviewId] = useState<
    string | null
  >(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [interviewDocFile, setInterviewDocFile] = useState<File | null>(null);
  const [interviewDocError, setInterviewDocError] = useState<string | null>(
    null,
  );
  const [interviewResumeFile, setInterviewResumeFile] = useState<File | null>(
    null,
  );
  const [interviewResumeError, setInterviewResumeError] = useState<
    string | null
  >(null);
  const [uploadProgress, setUploadProgress] = useState<{
    doc: number;
    resume: number;
  }>({ doc: 0, resume: 0 });
  const [introMap, setIntroMap] = useState<Map<string, string>>(new Map());
  const [generatingIntro, setGeneratingIntro] = useState(false);
  const [introCopied, setIntroCopied] = useState(false);
  const [introError, setIntroError] = useState<string | null>(null);
  const [introErrorId, setIntroErrorId] = useState<string | null>(null);
  const [docDragOver, setDocDragOver] = useState(false);
  const [resumeDragOver, setResumeDragOver] = useState(false);

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
  const { departmentId } = useDepartmentContext();
  const cannotCRUD = role === "manager" || role === "bd-manager" || role === "guest";
  const isTeamMember = role === "team-member";
  const canEditLeadThreadPanel =
    role === "superadmin" ||
    role === "team-member" ||
    role === "bd" ||
    role === "dept-lead" ||
    role === "bd-team-lead";
  const [meCandidateId, setMeCandidateId] = useState<string | null>(null);
  const canAddPipelineRound = !isTeamMember || !!meCandidateId;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<InterviewFormData>({
    company_id: "",
    candidate_id: "",
    resume_profile_id: "",
    role: "",
    round: "",
  });
  const [leadsList, setLeadsList] = useState<LeadListItem[]>([]);
  /** Matches `LeadListItem.thread_id` when creating from an existing lead or after "Add next round". */
  const [selectedLeadThreadId, setSelectedLeadThreadId] = useState("");
  /** True when the modal was opened via "Add next round" — lead / pipeline must not be changed. */
  const [lockLeadPicker, setLockLeadPicker] = useState(false);

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
        leadsData,
        me,
        rolesData,
      ] = await Promise.all([
        interviewsService.list(
          departmentId ? { department_id: departmentId } : undefined,
        ),
        companiesService.list(),
        candidatesService.list({ department_id: departmentId }),
        profilesService.list({ department_id: departmentId }),
        businessDevelopersService.list(),
        leadsService.list({
          page: 1,
          page_size: 500,
          department_id: departmentId ?? undefined,
        }),
        authService.getMe(),
        jobRolesService.list(),
      ]);

      let pipelineChains: Record<string, Interview[]> = {};
      if (me.role === "team-member") {
        const tids = [
          ...new Set(interviewsData.map((i) => i.thread_id ?? i.id)),
        ];
        if (tids.length > 0) {
          const results = await Promise.all(
            tids.map((tid) => interviewsService.listByThread(tid)),
          );
          tids.forEach((tid, idx) => {
            pipelineChains[tid] = results[idx];
          });
        }
      }
      setPipelineThreadChains(pipelineChains);

      setInterviews(interviewsData);
      // Seed introMap with any AI introductions already saved in the DB
      setIntroMap((prev) => {
        const next = new Map(prev);
        for (const iv of interviewsData) {
          if (iv.ai_introduction && !next.has(iv.id)) {
            next.set(iv.id, iv.ai_introduction);
          }
        }
        return next;
      });
      setCompanies(companiesData);
      setCandidates(candidatesData);
      setProfiles(profilesData);
      setBusinessDevs(bdsData);
      setLeadsList(leadsData.items);
      setMeCandidateId(me.candidate_id ?? null);
      setJobRoles(rolesData);

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
  }, [departmentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const closeInterviewModal = () => {
    setModalOpen(false);
    setLockLeadPicker(false);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setSelectedLeadThreadId("");
    setLockLeadPicker(false);
    const defaultCandidate = isTeamMember ? meCandidateId || "" : "";
    setFormData({
      company_id: "",
      candidate_id: defaultCandidate,
      resume_profile_id: "",
      role: "",
      salary_range: "",
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
    setInterviewResumeFile(null);
    setInterviewResumeError(null);
    setUploadProgress({ doc: 0, resume: 0 });
    setModalOpen(true);
  };

  const openCreateNextRound = (parent: Interview) => {
    setEditingId(null);
    setSelectedLeadThreadId(parent.thread_id || "");
    setLockLeadPicker(true);
    const nextCandidate = isTeamMember
      ? meCandidateId || parent.candidate_id || ""
      : parent.candidate_id || "";
    setFormData({
      company_id: parent.company_id,
      candidate_id: nextCandidate,
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
    setInterviewResumeFile(null);
    setInterviewResumeError(null);
    setUploadProgress({ doc: 0, resume: 0 });
    setDetailModal(null);
    setModalOpen(true);
  };

  const openEditModal = (interview: Interview) => {
    setEditingId(interview.id);
    setSelectedLeadThreadId("");
    setLockLeadPicker(false);
    setFormData({
      company_id: interview.company_id,
      candidate_id: interview.candidate_id || "",
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
    setInterviewResumeFile(null);
    setInterviewResumeError(null);
    setUploadProgress({ doc: 0, resume: 0 });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (isTeamMember && !meCandidateId && !editingId) {
      alert(
        "No candidate record matches your login email. Ask an admin to add a candidate with the same email as your user account.",
      );
      return;
    }
    if (!editingId) {
      if (!formData.parent_interview_id) {
        alert(
          "Select a lead for this round. Create a new pipeline on the Leads page if you need a new opportunity.",
        );
        return;
      }
      if (
        !formData.company_id ||
        !formData.resume_profile_id ||
        !formData.role?.trim()
      ) {
        alert(
          "Opportunity details are incomplete. Select a lead again, or refresh the page.",
        );
        return;
      }
      const effectiveCid =
        isTeamMember && meCandidateId ? meCandidateId : formData.candidate_id;
      if (!effectiveCid?.trim()) {
        alert("Select a candidate for this interview round.");
        return;
      }
    } else if (!isTeamMember && !formData.candidate_id?.trim()) {
      alert("Select a candidate for this interview.");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        ...(isTeamMember && meCandidateId
          ? { candidate_id: meCandidateId }
          : {}),
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
        (
          payload as { parent_interview_id?: string | null }
        ).parent_interview_id = formData.parent_interview_id || null;
      } else if (!payload.parent_interview_id) {
        delete (payload as { parent_interview_id?: string })
          .parent_interview_id;
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

      if ((interviewDocFile || interviewResumeFile) && savedInterview?.id) {
        if (interviewDocFile && interviewDocFile.type !== "application/pdf")
          throw new Error(
            "Only PDF files are allowed for interview documents.",
          );
        if (
          interviewResumeFile &&
          interviewResumeFile.type !== "application/pdf"
        )
          throw new Error("Only PDF files are allowed for resumes.");

        setUploadingInterviewId(savedInterview.id);
        await Promise.all([
          interviewDocFile
            ? interviewsService.uploadInterviewDoc(
                savedInterview.id,
                interviewDocFile,
                (pct) => setUploadProgress((p) => ({ ...p, doc: pct })),
              )
            : Promise.resolve(),
          interviewResumeFile
            ? interviewsService.uploadInterviewResume(
                savedInterview.id,
                interviewResumeFile,
                (pct) => setUploadProgress((p) => ({ ...p, resume: pct })),
              )
            : Promise.resolve(),
        ]);
        setUploadingInterviewId(null);
      }

      closeInterviewModal();
      setInterviewDocFile(null);
      setInterviewDocError(null);
      setInterviewResumeFile(null);
      setInterviewResumeError(null);
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

  const handleInterviewResumeUpload = async (
    interviewId: string,
    file?: File,
  ) => {
    if (!file) return;
    setUploadError(null);
    setUploadingInterviewId(interviewId);

    if (file.type !== "application/pdf") {
      setUploadError("Only PDF files are allowed for resumes.");
      setUploadingInterviewId(null);
      return;
    }

    try {
      await interviewsService.uploadInterviewResume(interviewId, file);
      const updated = await interviewsService.get(interviewId);
      setDetailModal(updated);
      await fetchData();
    } catch (err) {
      setUploadError(
        err instanceof Error ? err.message : "Failed to upload resume",
      );
    } finally {
      setUploadingInterviewId(null);
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

  const handleGenerateIntroduction = async (interviewId: string) => {
    if (generatingIntro) return;
    setGeneratingIntro(true);
    setIntroError(null);
    setIntroErrorId(null);
    setIntroCopied(false);
    try {
      const res = await interviewsService.generateIntroduction(interviewId);
      setIntroMap((prev) => new Map(prev).set(interviewId, res.introduction));
    } catch (err) {
      setIntroError(
        err instanceof Error ? err.message : "Failed to generate introduction",
      );
      setIntroErrorId(interviewId);
    } finally {
      setGeneratingIntro(false);
    }
  };

  const handleCopyIntro = async () => {
    const text = detailModal ? introMap.get(detailModal.id) ?? null : null;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setIntroCopied(true);
      setTimeout(() => setIntroCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  // Auto-generate introduction when the detail modal opens for a new interview
  useEffect(() => {
    if (!detailModal) return;
    if (introMap.has(detailModal.id) || generatingIntro) return;
    handleGenerateIntroduction(detailModal.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailModal?.id]);

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

  /** Full thread for pipeline UI; for team members merges GET /interviews/thread/:id (list is per-candidate). */
  const chainByThreadId = useMemo(() => {
    const fromList = new Map<string, Interview[]>();
    for (const i of interviews) {
      const tid = i.thread_id ?? i.id;
      if (!fromList.has(tid)) fromList.set(tid, []);
      fromList.get(tid)!.push(i);
    }
    for (const arr of fromList.values()) {
      arr.sort(sortInterviewsInChain);
    }
    const merged = new Map<string, Interview[]>();
    const allTids = new Set<string>([
      ...fromList.keys(),
      ...Object.keys(pipelineThreadChains),
    ]);
    for (const tid of allTids) {
      const full = pipelineThreadChains[tid];
      if (full && full.length > 0) {
        merged.set(tid, [...full].sort(sortInterviewsInChain));
      } else {
        const partial = fromList.get(tid);
        if (partial) merged.set(tid, partial);
      }
    }
    return merged;
  }, [interviews, pipelineThreadChains]);

  const chainStep = useCallback(
    (interview: Interview) => {
      if (
        interview.pipeline_thread_step != null &&
        interview.pipeline_thread_total != null
      ) {
        return {
          step: interview.pipeline_thread_step,
          total: interview.pipeline_thread_total,
        };
      }
      const tid = interview.thread_id ?? interview.id;
      const chain = chainByThreadId.get(tid) || [interview];
      const idx = chain.findIndex((x) => x.id === interview.id);
      return {
        step: idx >= 0 ? idx + 1 : 1,
        total: Math.max(chain.length, 1),
      };
    },
    [chainByThreadId],
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

  const leadsForInterviewPicker = useMemo(() => {
    const withParent = leadsList.filter((l) => l.last_interview_id);
    const scoped =
      isTeamMember && meCandidateId
        ? withParent.filter(
            (l) => !l.candidate_id || l.candidate_id === meCandidateId,
          )
        : withParent;
    return [...scoped].sort((a, b) => {
      const ac = (a.company_name || "").localeCompare(b.company_name || "");
      if (ac !== 0) return ac;
      return (a.primary_bd_name || "").localeCompare(b.primary_bd_name || "");
    });
  }, [leadsList, isTeamMember, meCandidateId]);

  /** Read-only opportunity row (managed on the Leads form / first round). */
  const opportunitySnapshot = useMemo(() => {
    if (editingId) {
      const iv = interviews.find((i) => i.id === editingId);
      if (iv) {
        return {
          company: iv.company_name ?? "—",
          profile: iv.resume_profile_name ?? "—",
          role: iv.role || "—",
          salary: iv.salary_range?.trim() || "—",
          bd: iv.bd_name || "—",
        };
      }
      return {
        company:
          companies.find((c) => c.id === formData.company_id)?.name ?? "—",
        profile:
          profiles.find((p) => p.id === formData.resume_profile_id)?.name ??
          "—",
        role: formData.role || "—",
        salary: formData.salary_range?.trim() || "—",
        bd: formData.bd_id
          ? (businessDevs.find((b) => b.id === formData.bd_id)?.name ?? "—")
          : "—",
      };
    }
    if (formData.parent_interview_id) {
      const iv = interviews.find((i) => i.id === formData.parent_interview_id);
      if (iv) {
        return {
          company: iv.company_name ?? "—",
          profile: iv.resume_profile_name ?? "—",
          role: iv.role || "—",
          salary: iv.salary_range?.trim() || "—",
          bd: iv.bd_name || "—",
        };
      }
      const lead = leadsForInterviewPicker.find(
        (l) => l.thread_id === selectedLeadThreadId,
      );
      if (lead) {
        return {
          company: lead.company_name ?? "—",
          profile: lead.resume_profile_name ?? "—",
          role: lead.primary_role || "—",
          salary: lead.salary_range?.trim() || "—",
          bd: lead.primary_bd_name || "—",
        };
      }
    }
    return null;
  }, [
    editingId,
    formData.parent_interview_id,
    formData.company_id,
    formData.resume_profile_id,
    formData.role,
    formData.salary_range,
    formData.bd_id,
    interviews,
    companies,
    profiles,
    businessDevs,
    leadsForInterviewPicker,
    selectedLeadThreadId,
  ]);

  const editingInterviewForDoc = useMemo(
    () => (editingId ? interviews.find((i) => i.id === editingId) : null),
    [editingId, interviews],
  );
  const existingInterviewDocUrl =
    editingInterviewForDoc?.interview_doc_url ?? null;
  const existingInterviewResumeUrl = editingInterviewForDoc?.resume_url ?? null;

  const filtered = interviews.filter((i) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      i.company_name?.toLowerCase().includes(q) ||
      i.candidate_name?.toLowerCase().includes(q) ||
      i.role?.toLowerCase().includes(q) ||
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

    let matchToday = true;
    if (filters.is_today) {
      if (!i.interview_date) {
        matchToday = false;
      } else {
        matchToday = i.interview_date === getTodayEst();
      }
    }

    const matchDateFrom =
      !filters.date_from ||
      (!!i.interview_date && i.interview_date >= filters.date_from);
    const matchDateTo =
      !filters.date_to ||
      (!!i.interview_date && i.interview_date <= filters.date_to);

    return (
      matchSearch &&
      matchCompany &&
      matchCandidate &&
      matchProfile &&
      matchRound &&
      matchBd &&
      matchStatus &&
      matchMonth &&
      matchToday &&
      matchDateFrom &&
      matchDateTo
    );
  });

  const handleExport = () => {
    const dataToExport = filtered.map((i) => ({
      Company: i.company_name,
      Role: i.role,
      Candidate: i.candidate_name,
      Profile: i.resume_profile_name,
      Round: i.round,
      "Interview Date": i.interview_date
        ? formatInterviewDateEst(i.interview_date, i.time_est)
        : "",
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
    Progressed: 0,
    Rejected: 0,
    Dead: 0,
    Closed: 0,
    Dropped: 0,
  };

  let legitInterviewsCount = 0;

  filtered.forEach((i) => {
    if (i.lead_outcome !== "dropped") legitInterviewsCount++;

    const label = i.computed_status.toLowerCase();
    if (label === "upcoming") statusCounts.Upcoming++;
    else if (label === "unresponsed") statusCounts.Unresponsed++;
    else if (label.includes("converted") || label.includes("progressed")) statusCounts.Progressed++;
    else if (label.includes("rejected")) statusCounts.Rejected++;
    else if (label === "dead") statusCounts.Dead++;
    else if (label.includes("closed")) statusCounts.Closed++;
    else if (label.includes("dropped")) statusCounts.Dropped++;
  });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginatedInterviews = filtered.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <style>{`
        @keyframes iv-row-imminent {
          0%, 100% { background-color: rgba(239, 68, 68, 0.18); }
          50%       { background-color: rgba(239, 68, 68, 0.45); }
        }
        @keyframes iv-row-warning {
          0%, 100% { background-color: rgba(245, 158, 11, 0.12); }
          50%       { background-color: rgba(245, 158, 11, 0.32); }
        }
        .iv-row-imminent { animation: iv-row-imminent 0.9s ease-in-out infinite; }
        .iv-row-warning  { animation: iv-row-warning  1.4s ease-in-out infinite; }
      `}</style>
      <PageHeader
        title="Interviews"
        action={
          <div className="flex gap-2">
            <button onClick={handleExport} className={buttonSecondary}>
              <Download size={16} />
              Export
            </button>
            {!cannotCRUD && (
              <button
                onClick={openCreateModal}
                className={buttonPrimary}
                disabled={isTeamMember && !meCandidateId}
                title={
                  isTeamMember && !meCandidateId
                    ? "Link a candidate with your email first"
                    : undefined
                }
              >
                <Plus size={16} />
                Add Interview
              </button>
            )}
          </div>
        }
      />

      {isTeamMember && !meCandidateId && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100/90">
          <p className="font-medium text-amber-900 dark:text-amber-50">
            Candidate link required
          </p>
          <p className="mt-1 text-amber-900/85 dark:text-amber-100/75">
            Add a candidate in the system whose email matches your login email
            so interviews can be tied to your account.
          </p>
        </div>
      )}

      <div className="flex flex-wrap xl:flex-nowrap items-center gap-2 rounded-[20px] border border-white/60 dark:border-white/[0.08] bg-white/40 dark:bg-white/[0.06] backdrop-blur-3xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.25)] p-2 w-full">
        {[
          { title: "Legit", value: legitInterviewsCount, emoji: "😎", color: "text-teal-700 dark:text-teal-300", bg: "bg-teal-500/10 dark:bg-teal-500/20" },
          { title: "Total", value: filtered.length, emoji: "😀", color: "text-indigo-700 dark:text-indigo-300", bg: "bg-indigo-500/10 dark:bg-indigo-500/20" },
          { title: "Upcoming", value: statusCounts.Upcoming, emoji: "🙂", color: "text-blue-700 dark:text-blue-300", bg: "bg-blue-500/10 dark:bg-blue-500/20" },
          { title: "Unresponsed", value: statusCounts.Unresponsed, emoji: "😐", color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-500/10 dark:bg-amber-500/20" },
          { title: "Dead", value: statusCounts.Dead, emoji: "💀", color: "text-stone-700 dark:text-stone-300", bg: "bg-stone-500/10 dark:bg-stone-500/20" },
          { title: "Rejected", value: statusCounts.Rejected, emoji: "😞", color: "text-red-700 dark:text-red-300", bg: "bg-red-500/10 dark:bg-red-500/20" },
          { title: "Progressed", value: statusCounts.Progressed, emoji: "😄", color: "text-violet-700 dark:text-violet-300", bg: "bg-violet-500/10 dark:bg-violet-500/20" },
          { title: "Closed", value: statusCounts.Closed, emoji: "😌", color: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-500/10 dark:bg-emerald-500/20" },
          { title: "Dropped", value: statusCounts.Dropped, emoji: "🙁", color: "text-amber-700 dark:text-amber-300", bg: "bg-amber-500/10 dark:bg-amber-500/20" },
        ].map((s, i) => (
          <div key={i} className={`flex items-center gap-3 px-3 xl:px-4 py-2 shrink-0 flex-1 min-w-[130px] xl:min-w-0 rounded-xl ${s.bg}`}>
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/60 dark:bg-black/20 ${s.color}`}>
              <span className="text-base leading-none" aria-hidden="true">{s.emoji}</span>
            </div>
            <div>
              <p className={`text-[10px] font-bold uppercase tracking-wider leading-none mb-1.5 opacity-80 ${s.color}`}>
                {s.title}
              </p>
              <p className="text-lg font-bold leading-none text-slate-900 dark:text-white">
                {s.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters Row */}
      {(() => {
        const iSel =
          "w-auto shrink-0 rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#12141c] px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none transition-all hover:border-slate-300 dark:hover:border-white/[0.12] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 appearance-none cursor-pointer min-h-[2.25rem]";
        const extraCount = [
          filters.company_id !== "All",
          filters.resume_profile_id !== "All",
          filters.round !== "All",
          filters.bd_id !== "All",
          filters.month !== "All",
          filters.date_from !== "",
          filters.date_to !== "",
        ].filter(Boolean).length;
        const anyFilter =
          filters.status !== "All" ||
          filters.company_id !== "All" ||
          filters.candidate_id !== "All" ||
          filters.resume_profile_id !== "All" ||
          filters.round !== "All" ||
          filters.bd_id !== "All" ||
          filters.month !== "All" ||
          filters.is_today ||
          filters.date_from !== "" ||
          filters.date_to !== "";
        return (
          <div className="flex flex-col gap-2 mb-6 relative z-10">
            {/* Primary row */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-500 pointer-events-none"
                />
                <input
                  type="text"
                  placeholder="Search interviews by company, role, candidate, status…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className={`${inputClass} pl-10 text-sm py-1.5`}
                />
              </div>
              <select
                value={filters.status}
                onChange={(e) =>
                  setFilters({ ...filters, status: e.target.value })
                }
                className={iSel}
              >
                <option value="All">All statuses</option>
                <option value="Converted">Progressed</option>
                <option value="Upcoming">Upcoming</option>
                <option value="Unresponsed">Unresponsed</option>
                <option value="Dead">Dead</option>
                <option value="Rejected">Rejected</option>
                <option value="Closed">Closed</option>
                <option value="Dropped">Dropped</option>
              </select>
              {!isTeamMember && (
                <select
                  value={filters.candidate_id}
                  onChange={(e) =>
                    setFilters({ ...filters, candidate_id: e.target.value })
                  }
                  className={iSel}
                >
                  <option value="All">All candidates</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                onClick={() =>
                  setFilters({ ...filters, is_today: !filters.is_today })
                }
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all focus:outline-none cursor-pointer min-h-[2.25rem] ${
                  filters.is_today
                    ? "bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700"
                    : "bg-white dark:bg-[#12141c] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/[0.12]"
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setShowExtraFilters((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all cursor-pointer min-h-[2.25rem] ${
                  showExtraFilters || extraCount > 0
                    ? "border-indigo-400/60 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                    : "bg-white dark:bg-[#12141c] border-slate-200 dark:border-white/[0.08] text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/[0.12]"
                }`}
              >
                <SlidersHorizontal size={12} className="shrink-0" />
                Filters
                {extraCount > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500 text-[10px] font-bold text-white leading-none">
                    {extraCount}
                  </span>
                )}
                <ChevronDown
                  size={12}
                  className={`shrink-0 transition-transform ${showExtraFilters ? "rotate-180" : ""}`}
                />
              </button>
              {anyFilter && (
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
                      is_today: false,
                      date_from: "",
                      date_to: "",
                    })
                  }
                  className="text-xs font-medium text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
                >
                  Clear all
                </button>
              )}
            </div>

            {/* Expandable extra filters */}
            {showExtraFilters && (
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-white/[0.05] animate-fade-in overflow-x-auto pb-0.5">
                <select
                  value={filters.company_id}
                  onChange={(e) =>
                    setFilters({ ...filters, company_id: e.target.value })
                  }
                  className={`${iSel} shrink-0`}
                >
                  <option value="All">All companies</option>
                  <option value="staffing">Staffing firm</option>
                  <option value="direct">Direct client</option>
                </select>
                <select
                  value={filters.resume_profile_id}
                  onChange={(e) =>
                    setFilters({
                      ...filters,
                      resume_profile_id: e.target.value,
                    })
                  }
                  className={`${iSel} shrink-0`}
                >
                  <option value="All">All profiles</option>
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
                  className={`${iSel} shrink-0`}
                >
                  <option value="All">All rounds</option>
                  <option value="Recruiter's Call">Recruiter's Call</option>
                  <option value="Phone Screen">Phone Screen</option>
                  <option value="1st">1st</option>
                  <option value="2nd">2nd</option>
                  <option value="3rd">3rd</option>
                  <option value="4th">4th</option>
                  <option value="5th">5th</option>
                  <option value="6th">6th</option>
                  <option value="Final">Final</option>
                </select>
                <select
                  value={filters.bd_id}
                  onChange={(e) =>
                    setFilters({ ...filters, bd_id: e.target.value })
                  }
                  className={`${iSel} shrink-0`}
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
                  className={`${iSel} shrink-0`}
                >
                  <option value="All">All months</option>
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <div className="shrink-0">
                  <DateRangeFilter
                    from={filters.date_from}
                    to={filters.date_to}
                    onFromChange={(v) =>
                      setFilters((prev) => ({ ...prev, date_from: v }))
                    }
                    onToChange={(v) => setFilters((prev) => ({ ...prev, date_to: v }))}
                    onClear={() =>
                      setFilters((prev) => ({ ...prev, date_from: "", date_to: "" }))
                    }
                  />
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState message="No interviews found" />
      ) : (
          <div className="overflow-hidden rounded-2xl border border-white/60 dark:border-white/[0.08] bg-white/35 dark:bg-white/[0.05] backdrop-blur-3xl shadow-[0_2px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.25)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-full table-auto">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/[0.06]">
                    <th className="px-3 py-2.5 text-left text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                      Company
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                      Role
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                      Candidate
                    </th>
                    <th className="hidden xl:table-cell px-3 py-2.5 text-left text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                      Profile
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                      Round
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                      Pipeline
                    </th>
                    <th
                      className="px-3 py-2.5 text-left text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500"
                      title="Calendar day in US Eastern (from interview date + EST time)"
                    >
                      Date (EST)
                    </th>
                    <th
                      className="px-3 py-2.5 text-left text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500"
                      title="Wall-clock time in US Eastern (same instant as PKT column)"
                    >
                      EST
                    </th>
                    <th
                      className="px-3 py-2.5 text-left text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500"
                      title="Wall-clock time in Pakistan (same instant as EST column)"
                    >
                      PKT
                    </th>
                    <th className="hidden xl:table-cell px-3 py-2.5 text-left text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                      BD
                    </th>
                    <th className="px-3 py-2.5 text-left text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                      Status
                    </th>
                    <th className="px-3 py-2.5 text-right text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedInterviews.map((interview) => {
                    const isUpcoming =
                      interview.computed_status.toLowerCase() === "upcoming";
                    const isClosed =
                      interview.computed_status.toLowerCase() === "closed";
                    const minsLeft = isUpcoming
                      ? minutesUntilInterview(interview, nowMs)
                      : null;
                    // Alert tiers: imminent ≤15 min, warning ≤60 min
                    const isImminent =
                      minsLeft !== null && minsLeft >= 0 && minsLeft <= 15;
                    const isWarning =
                      minsLeft !== null && minsLeft > 15 && minsLeft <= 60;
                    const isDeptOnly = interview.bd_dept_only === true;
                    const rowSep = isImminent
                      ? "border-b border-red-300 dark:border-red-500/30"
                      : isWarning
                        ? "border-b border-amber-200 dark:border-amber-500/20"
                        : isUpcoming
                          ? "border-b border-blue-200 dark:border-white/[0.08]"
                          : isClosed
                            ? "border-b border-emerald-200 dark:border-white/[0.08]"
                            : "border-b border-slate-200 dark:border-white/[0.06]";
                    const rowBg = isImminent
                      ? "iv-row-imminent border-l-4 border-l-red-500"
                      : isWarning
                        ? "iv-row-warning border-l-4 border-l-amber-500"
                        : isDeptOnly
                          ? "bg-violet-50/40 dark:bg-violet-500/[0.06] hover:bg-violet-100/50 dark:hover:bg-violet-500/[0.10] border-l-4 border-l-violet-400/70 dark:border-l-violet-500/50 opacity-80"
                          : isUpcoming
                            ? "bg-blue-100 dark:bg-blue-500/[0.15] hover:bg-blue-200/70 dark:hover:bg-blue-500/[0.22] border-l-4 border-l-blue-500 dark:border-l-blue-400"
                            : isClosed
                              ? "bg-emerald-100 dark:bg-emerald-500/[0.15] hover:bg-emerald-200/70 dark:hover:bg-emerald-500/[0.22] border-l-4 border-l-emerald-500 dark:border-l-emerald-400"
                              : "hover:bg-slate-100 dark:hover:bg-white/[0.02]";

                    return (
                      <tr
                        key={interview.id}
                        className={`transition-colors ${rowSep} ${rowBg}`}
                      >
                        <td className="px-3 py-2.5 text-sm font-medium text-slate-900 dark:text-white">
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
                        <td className="px-3 py-2.5 text-sm text-slate-700 dark:text-slate-300 max-w-[200px]">
                          {truncate(interview.role, 40)}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-slate-700 dark:text-slate-300">
                          {interview.candidate_name}
                        </td>
                        <td className="hidden xl:table-cell px-3 py-2.5 text-sm text-slate-600 dark:text-slate-400">
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
                              return (
                                <span>{interview.resume_profile_name}</span>
                              );
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
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium ${isUpcoming ? "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300" : "bg-slate-100 dark:bg-white/[0.04] text-slate-700 dark:text-slate-300"}`}
                          >
                            {interview.round}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
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
                            const chain = chainByThreadId.get(tid) || [
                              interview,
                            ];
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
                        <td className="px-3 py-2.5 text-sm text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {(() => {
                            const dateStr = formatInterviewDateEst(
                              interview.interview_date,
                              interview.time_est,
                              true,
                            );
                            const parts = dateStr.split(", ");
                            const hasDay =
                              parts.length > 1 && parts[0].length === 3;
                            const day = hasDay ? parts[0] : "";
                            const rest = hasDay
                              ? parts.slice(1).join(", ")
                              : dateStr;

                            let badgeColor = "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400";
                            if (hasDay) {
                              switch (day.toLowerCase()) {
                                case "mon": badgeColor = "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300"; break;
                                case "tue": badgeColor = "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"; break;
                                case "wed": badgeColor = "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"; break;
                                case "thu": badgeColor = "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"; break;
                                case "fri": badgeColor = "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"; break;
                                case "sat": badgeColor = "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300"; break;
                                case "sun": badgeColor = "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300"; break;
                              }
                            }

                            const badge = hasDay ? (
                              <span
                                className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                  !isUpcoming ? "opacity-70" : ""
                                } ${badgeColor}`}
                              >
                                {day}
                              </span>
                            ) : null;

                            if (isUpcoming) {
                              return (
                                <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                                  <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                                  </span>
                                  {badge}
                                  <span>{rest}</span>
                                </span>
                              );
                            }

                            return (
                              <span className="inline-flex items-center gap-1.5">
                                {badge}
                                <span>{rest}</span>
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2.5 text-sm text-slate-600 dark:text-slate-400">
                          <div className="flex flex-col gap-1">
                            {interview.time_est ? (
                              formatTime(interview.time_est)
                            ) : (
                              <span className="text-slate-400 dark:text-slate-600">
                                —
                              </span>
                            )}
                            {isImminent && minsLeft !== null && (
                              <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-black uppercase tracking-wide bg-red-600 text-white animate-pulse w-fit">
                                🚨 {minsLeft}m
                              </span>
                            )}
                            {isWarning && minsLeft !== null && (
                              <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide bg-amber-500 text-white w-fit">
                                ⚠ {minsLeft}m
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-sm text-slate-600 dark:text-slate-400">
                          {interview.time_pkt ? (
                            formatTime(interview.time_pkt)
                          ) : (
                            <span className="text-slate-400 dark:text-slate-600">
                              —
                            </span>
                          )}
                        </td>
                        <td className="hidden xl:table-cell px-3 py-2.5 text-sm text-slate-600 dark:text-slate-400">
                          {interview.bd_name || (
                            <span className="text-slate-400 dark:text-slate-600">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={interview.computed_status} />
                        </td>
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {isDeptOnly ? (
                              /* BD dept-only: show a locked badge instead of action buttons */
                              <span
                                title="You can see this interview exists in your department, but full details are restricted to its owning BD."
                                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide bg-violet-100 dark:bg-violet-500/15 text-violet-600 dark:text-violet-300 border border-violet-200/60 dark:border-violet-500/25 cursor-default select-none"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
                                  <rect x="3" y="11" width="18" height="11" rx="2"/>
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                                </svg>
                                Dept view
                              </span>
                            ) : (
                              <>
                                <button
                                  onClick={() => setDetailModal(interview)}
                                  className="rounded-lg p-2 text-slate-500 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:text-white transition-colors"
                                  title="View details"
                                >
                                  <Eye size={14} />
                                </button>
                                {!cannotCRUD && (
                                  <>
                                    {!isRejectedInterview(interview) &&
                                      canAddPipelineRound && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openCreateNextRound(interview)
                                          }
                                          className="rounded-lg p-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/15 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                                          title="Add next round (same pipeline)"
                                        >
                                          <ArrowRight size={14} aria-hidden />
                                          <span className="sr-only">
                                            Add next round
                                          </span>
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
              <div className="flex items-center justify-between border-t border-white/60 dark:border-white/[0.07] bg-white/60 dark:bg-white/[0.04] px-4 py-3 sm:px-6">
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
                        {Math.min(
                          currentPage * ITEMS_PER_PAGE,
                          filtered.length,
                        )}
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
                        onClick={() =>
                          setCurrentPage((p) => Math.max(1, p - 1))
                        }
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
        onClose={closeInterviewModal}
        title={
          editingId
            ? "Edit Interview"
            : formData.parent_interview_id
              ? "Add next round"
              : "Add Interview"
        }
        size="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {!editingId ? (
            <div className="col-span-1 sm:col-span-2">
              <FormField label="Lead (required)">
                {lockLeadPicker && selectedLeadThreadId ? (
                  <div
                    className={`${selectClass} flex items-center text-slate-700 dark:text-slate-200 bg-slate-100/80 dark:bg-white/[0.04] cursor-not-allowed`}
                  >
                    {(() => {
                      const l = leadsForInterviewPicker.find(
                        (x) => x.thread_id === selectedLeadThreadId,
                      );
                      return l
                        ? `${l.company_name ?? "Company"}${
                            l.primary_bd_name ? ` · ${l.primary_bd_name}` : ""
                          }`
                        : "Selected pipeline";
                    })()}
                  </div>
                ) : (
                  <select
                    value={selectedLeadThreadId}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedLeadThreadId(v);
                      if (!v) {
                        const defaultCandidate = isTeamMember
                          ? meCandidateId || ""
                          : "";
                        setFormData({
                          company_id: "",
                          candidate_id: defaultCandidate,
                          resume_profile_id: "",
                          role: "",
                          round: "1st",
                          bd_id: "",
                          interviewer: "",
                          interview_link: "",
                          is_phone_call: false,
                          feedback: "",
                          recruiter_feedback: "",
                          parent_interview_id: undefined,
                          salary_range: "",
                          interview_date: "",
                          time_est: "",
                          time_pkt: "",
                          status: "",
                        });
                        return;
                      }
                      const lead = leadsForInterviewPicker.find(
                        (l) => l.thread_id === v,
                      );
                      if (!lead?.last_interview_id) return;
                      setFormData({
                        company_id: lead.company_id,
                        candidate_id:
                          isTeamMember && meCandidateId
                            ? meCandidateId
                            : lead.candidate_id || "",
                        resume_profile_id: lead.resume_profile_id,
                        role: lead.primary_role || "",
                        salary_range: lead.salary_range || "",
                        round:
                          suggestNextRoundLabel(lead.last_round || "") ||
                          "Next round",
                        interview_date: "",
                        time_est: "",
                        time_pkt: "",
                        status: "",
                        feedback: "",
                        recruiter_feedback: "",
                        bd_id: lead.primary_bd_id || "",
                        interviewer: "",
                        interview_link: "",
                        is_phone_call: false,
                        parent_interview_id: lead.last_interview_id,
                      });
                    }}
                    className={selectClass}
                  >
                    <option value="">Select a lead…</option>
                    {leadsForInterviewPicker.map((l) => (
                      <option key={l.thread_id} value={l.thread_id}>
                        {l.company_name ?? "Company"}
                        {l.primary_bd_name ? ` · ${l.primary_bd_name}` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
              {lockLeadPicker && selectedLeadThreadId ? (
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  This round continues the pipeline from the interview you
                  started from; the lead cannot be changed here. Use{" "}
                  <span className="font-medium text-slate-600 dark:text-slate-300">
                    Add Interview
                  </span>{" "}
                  if you need to attach to a different opportunity.
                </p>
              ) : null}
              {!lockLeadPicker && (
                <QuickCreateLead
                  companies={companies}
                  profiles={profiles}
                  candidates={candidates}
                  jobRoles={jobRoles}
                  isTeamMember={isTeamMember}
                  meCandidateId={meCandidateId}
                  onCompanyCreated={(c) =>
                    setCompanies((prev) =>
                      [...prev, c].sort((a, b) => a.name.localeCompare(b.name)),
                    )
                  }
                  onRoleCreated={(r) =>
                    setJobRoles((prev) =>
                      [...prev, r].sort((a, b) => a.name.localeCompare(b.name)),
                    )
                  }
                  onLeadCreated={(lead) => {
                    setLeadsList((prev) => [...prev, lead]);
                    setSelectedLeadThreadId(lead.thread_id);
                    const l = lead;
                    setFormData({
                      company_id: l.company_id,
                      candidate_id:
                        isTeamMember && meCandidateId
                          ? meCandidateId
                          : l.candidate_id || "",
                      resume_profile_id: l.resume_profile_id,
                      role: l.primary_role || "",
                      salary_range: l.salary_range || "",
                      round: "Phone Screen",
                      interview_date: "",
                      time_est: "",
                      time_pkt: "",
                      status: "",
                      feedback: "",
                      recruiter_feedback: "",
                      bd_id: l.primary_bd_id || "",
                      interviewer: "",
                      interview_link: "",
                      is_phone_call: false,
                      parent_interview_id: l.last_interview_id,
                    });
                  }}
                />
              )}
            </div>
          ) : null}
          {opportunitySnapshot ? (
            <div className="col-span-1 sm:col-span-2 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50/80 dark:bg-white/[0.03] px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                lead
              </p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm text-slate-800 dark:text-slate-100">
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">
                    Company
                  </dt>
                  <dd>{opportunitySnapshot.company}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">
                    Resume profile
                  </dt>
                  <dd>{opportunitySnapshot.profile}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">
                    Role
                  </dt>
                  <dd>{opportunitySnapshot.role}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">
                    Salary range
                  </dt>
                  <dd>{opportunitySnapshot.salary}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">
                    Business developer
                  </dt>
                  <dd>{opportunitySnapshot.bd}</dd>
                </div>
              </dl>
            </div>
          ) : null}
          {editingId || formData.parent_interview_id ? (
            <div className="col-span-1 sm:col-span-2">
              <FormField label="Candidate">
                {isTeamMember ? (
                  <div
                    className={`${selectClass} flex items-center text-slate-700 dark:text-slate-200 bg-slate-100/80 dark:bg-white/[0.04] cursor-not-allowed`}
                  >
                    {meCandidateId
                      ? candidates.find((c) => c.id === meCandidateId)?.name ||
                        "You (linked)"
                      : "No candidate linked to your email — contact an admin."}
                  </div>
                ) : (
                  <SearchableSelect
                    options={candidates.map((c) => ({
                      id: c.id,
                      label: c.name,
                    }))}
                    value={formData.candidate_id}
                    onChange={(id) =>
                      setFormData({ ...formData, candidate_id: id })
                    }
                    placeholder="Select candidate…"
                    required
                  />
                )}
              </FormField>
            </div>
          ) : null}
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
                  {pipelineParentSelectOptions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.round} ·{" "}
                      {formatInterviewDateEst(i.interview_date, i.time_est)} ·{" "}
                      {i.computed_status || i.status || "—"}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Connect this row to an existing interview for the same
                  company, candidate, and profile. Rounds that come after this
                  one in the chain cannot be selected.
                </p>
              </FormField>
            </div>
          ) : null}
          <FormField label="Round">
            <TypeableSelect
              options={[
                "Recruiter's Call",
                "Phone Screen",
                "1st",
                "2nd",
                "3rd",
                "4th",
                "5th",
                "6th",
                "Final",
              ]}
              value={formData.round}
              onChange={(val) => setFormData({ ...formData, round: val })}
              placeholder="Type or select round…"
            />
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
            <FormField label="Round status">
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    "",
                    "Upcoming",
                    "Converted",
                    "Closed",
                    "Dropped",
                    "Rejected",
                  ] as const
                ).map((val) => {
                  const label = val === "" ? "Unresponsed" : val === "Converted" ? "Progressed" : val;
                  const s = getStatusStyle(val === "" ? null : val);
                  const selected = (formData.status || "") === val;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() =>
                        setFormData({ ...formData, status: val || null })
                      }
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all
                        ${
                          selected
                            ? `${s.bg} ${s.text} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-900 ring-current`
                            : "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.1]"
                        }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${selected ? s.dot : "bg-slate-400 dark:bg-slate-500"}`}
                      />
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Use <span className="font-medium">Progressed</span> when this
                round moved the candidate forward. Use{" "}
                <span className="font-medium">Closed</span> when the position
                was filled, <span className="font-medium">Dropped</span> when
                the candidate withdrew or the opportunity ended. Only{" "}
                <span className="font-medium">Dead</span> is set at the lead
                level only.
              </p>
            </FormField>
          </div>
          <div className="col-span-1">
            <FormField label="Interview Document (PDF)">
              <input
                id="interview-doc-file-input"
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file) {
                    if (file.type !== "application/pdf") {
                      setInterviewDocError("Only PDF files are allowed.");
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
              />
              <div
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-all duration-200 select-none
                  ${docDragOver
                    ? "border-indigo-500 bg-indigo-500/10 dark:bg-indigo-500/15 scale-[1.01]"
                    : interviewDocFile
                      ? "border-indigo-300 dark:border-indigo-500/40 bg-indigo-50/60 dark:bg-indigo-500/[0.06]"
                      : "border-slate-200 dark:border-white/[0.10] bg-white/50 dark:bg-white/[0.02] hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:bg-indigo-50/40 dark:hover:bg-indigo-500/[0.04]"
                  }`}
                onClick={() => document.getElementById("interview-doc-file-input")?.click()}
                onDragOver={(e: React.DragEvent) => { e.preventDefault(); setDocDragOver(true); }}
                onDragEnter={(e: React.DragEvent) => { e.preventDefault(); setDocDragOver(true); }}
                onDragLeave={() => setDocDragOver(false)}
                onDrop={(e: React.DragEvent) => {
                  e.preventDefault();
                  setDocDragOver(false);
                  const file = e.dataTransfer.files?.[0] ?? null;
                  if (!file) return;
                  if (file.type !== "application/pdf") {
                    setInterviewDocError("Only PDF files are allowed.");
                    return;
                  }
                  setInterviewDocError(null);
                  setInterviewDocFile(file);
                }}
              >
                <Upload
                  size={22}
                  className={`transition-colors ${docDragOver ? "text-indigo-500" : interviewDocFile ? "text-indigo-400" : "text-slate-400 dark:text-slate-500"}`}
                />
                {interviewDocFile ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[220px]">
                      {interviewDocFile.name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setInterviewDocFile(null); setInterviewDocError(null); }}
                      className="text-xs text-red-500 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      {docDragOver ? "Drop to upload" : "Drag & drop PDF here"}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">or click to browse</p>
                  </div>
                )}
                {!interviewDocFile && existingInterviewDocUrl && (
                  <a
                    href={existingInterviewDocUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 rounded-lg px-2.5 py-1 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors"
                  >
                    <Download size={11} /> Current doc
                  </a>
                )}
              </div>
              {uploadProgress.doc > 0 && uploadProgress.doc < 100 && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-150"
                    style={{ width: `${uploadProgress.doc}%` }}
                  />
                </div>
              )}
              {interviewDocError && (
                <p className="mt-1.5 text-xs text-red-500">
                  {interviewDocError}
                </p>
              )}
            </FormField>
          </div>
          <div className="col-span-1">
            <FormField label="Resume (PDF)">
              <input
                id="interview-resume-file-input"
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const file = e.target.files?.[0] ?? null;
                  if (file) {
                    if (file.type !== "application/pdf") {
                      setInterviewResumeError("Only PDF files are allowed.");
                      setInterviewResumeFile(null);
                      return;
                    }
                    setInterviewResumeError(null);
                    setInterviewResumeFile(file);
                  } else {
                    setInterviewResumeFile(null);
                    setInterviewResumeError(null);
                  }
                }}
              />
              <div
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-5 text-center cursor-pointer transition-all duration-200 select-none
                  ${resumeDragOver
                    ? "border-indigo-500 bg-indigo-500/10 dark:bg-indigo-500/15 scale-[1.01]"
                    : interviewResumeFile
                      ? "border-indigo-300 dark:border-indigo-500/40 bg-indigo-50/60 dark:bg-indigo-500/[0.06]"
                      : "border-slate-200 dark:border-white/[0.10] bg-white/50 dark:bg-white/[0.02] hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:bg-indigo-50/40 dark:hover:bg-indigo-500/[0.04]"
                  }`}
                onClick={() => document.getElementById("interview-resume-file-input")?.click()}
                onDragOver={(e: React.DragEvent) => { e.preventDefault(); setResumeDragOver(true); }}
                onDragEnter={(e: React.DragEvent) => { e.preventDefault(); setResumeDragOver(true); }}
                onDragLeave={() => setResumeDragOver(false)}
                onDrop={(e: React.DragEvent) => {
                  e.preventDefault();
                  setResumeDragOver(false);
                  const file = e.dataTransfer.files?.[0] ?? null;
                  if (!file) return;
                  if (file.type !== "application/pdf") {
                    setInterviewResumeError("Only PDF files are allowed.");
                    return;
                  }
                  setInterviewResumeError(null);
                  setInterviewResumeFile(file);
                }}
              >
                <Upload
                  size={22}
                  className={`transition-colors ${resumeDragOver ? "text-indigo-500" : interviewResumeFile ? "text-indigo-400" : "text-slate-400 dark:text-slate-500"}`}
                />
                {interviewResumeFile ? (
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[220px]">
                      {interviewResumeFile.name}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setInterviewResumeFile(null); setInterviewResumeError(null); }}
                      className="text-xs text-red-500 hover:text-red-400 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      {resumeDragOver ? "Drop to upload" : "Drag & drop PDF here"}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">or click to browse</p>
                  </div>
                )}
                {!interviewResumeFile && existingInterviewResumeUrl && (
                  <a
                    href={existingInterviewResumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 rounded-lg px-2.5 py-1 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                  >
                    <Download size={11} /> Current resume
                  </a>
                )}
              </div>
              {uploadProgress.resume > 0 && uploadProgress.resume < 100 && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-150"
                    style={{ width: `${uploadProgress.resume}%` }}
                  />
                </div>
              )}
              {interviewResumeError && (
                <p className="mt-1.5 text-xs text-red-500">
                  {interviewResumeError}
                </p>
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
          <button onClick={closeInterviewModal} className={buttonSecondary}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              isSubmitting || (!editingId && !formData.parent_interview_id)
            }
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
        description={
          deleteModal?.pipeline_thread_total === 1
            ? "This is the only round in this pipeline. Deleting it will also permanently remove the lead."
            : undefined
        }
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
        onClose={() => {
          setDetailModal(null);
          setLinkCopied(false);
        }}
        title="Interview Details"
        size="xl"
      >
        {detailModal && (
          <div className="flex flex-col lg:flex-row lg:gap-5 lg:h-full">
            {/* Left on desktop / bottom on mobile — AI Introduction (scrolls independently) */}
            <div className="order-2 lg:order-1 shrink-0 lg:w-[300px] xl:w-[340px] lg:overflow-y-auto lg:pb-4">
              <div className="rounded-xl border border-violet-200/80 dark:border-violet-500/30 bg-violet-50/50 dark:bg-violet-500/[0.06] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-violet-800 dark:text-violet-300">
                      AI Introduction
                    </p>
                    <p className="mt-0.5 text-xs text-violet-600/70 dark:text-violet-400/60">
                      Read aloud naturally at the start of your interview
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleGenerateIntroduction(detailModal.id)}
                    disabled={generatingIntro}
                    title="Regenerate introduction"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-violet-500 dark:bg-violet-500 dark:hover:bg-violet-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {generatingIntro ? (
                      <Loader2 size={13} className="animate-spin" aria-hidden />
                    ) : (
                      <Sparkles size={13} aria-hidden />
                    )}
                    {generatingIntro
                      ? "Generating…"
                      : introMap.has(detailModal.id)
                        ? "Regenerate"
                        : "Generate"}
                  </button>
                </div>
                {introError && introErrorId === detailModal.id && (
                  <div className="px-4 pb-3">
                    <p className="text-xs text-red-500 dark:text-red-400">
                      {introError}
                    </p>
                  </div>
                )}
                {generatingIntro && !introMap.has(detailModal.id) && (
                  <div className="flex items-center gap-2 px-4 pb-4 text-xs text-violet-500 dark:text-violet-400">
                    <Loader2 size={12} className="animate-spin" aria-hidden />
                    Generating your introduction…
                  </div>
                )}
                {introMap.has(detailModal.id) && (
                  <div className="relative px-4 pb-4">
                    <p className="whitespace-pre-wrap rounded-xl border border-violet-200/60 dark:border-violet-500/20 bg-white dark:bg-white/[0.04] px-4 py-3.5 pr-10 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                      {introMap.get(detailModal.id)}
                    </p>
                    <button
                      type="button"
                      onClick={handleCopyIntro}
                      title={introCopied ? "Copied!" : "Copy to clipboard"}
                      className="absolute right-6 bottom-7 rounded-md p-1.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.07] transition-colors"
                    >
                      {introCopied ? (
                        <Check size={14} className="text-emerald-500" aria-hidden />
                      ) : (
                        <Copy size={14} aria-hidden />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
            {/* Right on desktop / top on mobile — Interview details (scrolls independently) */}
            <div className="order-1 lg:order-2 min-w-0 flex-1 space-y-5 lg:overflow-y-auto lg:pb-4">
            {/* {!cannotCRUD && !isRejectedInterview(detailModal) && canAddPipelineRound && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-indigo-200/80 dark:border-indigo-500/30 bg-gradient-to-r from-indigo-50 to-white dark:from-indigo-500/10 dark:to-[#151821] px-4 py-3">
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  <span className="font-medium text-slate-900 dark:text-white">
                    Next step in this pipeline
                  </span>
                  <span className="hidden sm:inline"> — </span>
                  <span className="block sm:inline text-slate-600 dark:text-slate-400">
                    {isTeamMember
                      ? "Adds another round after this step (same company; your candidate is fixed to your account)."
                      : "Adds another round linked after this one (same company; you can change candidate and profile in the form)."}
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
            )} */}
            {(() => {
              const tid = detailModal.thread_id ?? detailModal.id;
              const chain = chainByThreadId.get(tid) || [detailModal];
              return (
                <InterviewChainTimeline
                  chain={chain}
                  highlightId={detailModal.id}
                />
              );
            })()}
            <div className="rounded-xl border border-indigo-200/90 dark:border-indigo-500/35 bg-indigo-50/60 dark:bg-indigo-500/[0.08]">
              <button
                onClick={() => setLeadOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-800 dark:text-indigo-200/90">
                  {detailModal.thread_id ? "Opportunity" : "Lead Details"}
                </span>
                <ChevronDown
                  size={14}
                  className={`text-indigo-500 transition-transform ${leadOpen ? "" : "-rotate-90"}`}
                />
              </button>
              {leadOpen && (
                <div className="px-4 pb-4 space-y-4">
                  {detailModal.thread_id && (
                    <LeadThreadPanel
                      embedded
                      threadId={detailModal.thread_id}
                      interview={detailModal}
                      fetchData={fetchData}
                      readOnly={true}
                      onUpdateDetail={(patch) =>
                        setDetailModal((prev) =>
                          prev ? { ...prev, ...patch } : null,
                        )
                      }
                    />
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-indigo-200/70 dark:border-indigo-500/25">
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
                    {/* Location + Weather */}
                    {(() => {
                      const profile = profiles.find(
                        (p) => p.id === detailModal.resume_profile_id,
                      );
                      if (!profile) return null;
                      if (!profile.location) {
                        return (
                          <div className="col-span-1 sm:col-span-2">
                            <InlineLocationEditor
                              profileId={profile.id}
                              onLocationUpdated={(newLoc) => {
                                setProfiles(profiles.map(p => 
                                  p.id === profile.id ? { ...p, location: newLoc } : p
                                ));
                              }}
                            />
                          </div>
                        );
                      }
                      return (
                        <div className="col-span-1 sm:col-span-2">
                          <WeatherCard location={profile.location} />
                        </div>
                      );
                    })()}
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
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/60 dark:border-white/[0.08] bg-white/35 dark:bg-white/[0.05] backdrop-blur-3xl">
              <button
                onClick={() => setIvOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  This interview
                </span>
                <ChevronDown
                  size={14}
                  className={`text-slate-500 transition-transform dark:text-slate-400 ${ivOpen ? "" : "-rotate-90"}`}
                />
              </button>
              {ivOpen && (
                <div className="px-4 pb-4 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        {formatInterviewDateEst(
                          detailModal.interview_date,
                          detailModal.time_est,
                        )}
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
                        <div className="mt-1 flex items-start gap-2">
                          <a
                            href={detailModal.interview_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-indigo-500 hover:text-indigo-400 break-all flex-1 min-w-0"
                          >
                            {detailModal.interview_link}
                          </a>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(
                                detailModal.interview_link!,
                              );
                              setLinkCopied(true);
                              setTimeout(() => setLinkCopied(false), 2000);
                            }}
                            className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white transition-colors"
                            title="Copy link"
                          >
                            {linkCopied ? (
                              <CheckCircle2
                                size={14}
                                className="text-emerald-500"
                              />
                            ) : (
                              <Copy size={14} />
                            )}
                          </button>
                        </div>
                      ) : (
                        <p className="mt-1 text-sm text-slate-400 dark:text-slate-600">
                          —
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="col-span-1 sm:col-span-2 border-t border-slate-100 dark:border-white/[0.06] pt-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                          Interview Document
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {detailModal.interview_doc_url ? (
                            <a
                              href={detailModal.interview_doc_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-500"
                            >
                              <Download size={13} /> Download
                            </a>
                          ) : (
                            <span className="text-sm text-slate-400 dark:text-slate-600">
                              Not uploaded
                            </span>
                          )}
                          {!cannotCRUD && (
                            <>
                              <input
                                id={`interview-doc-input-${detailModal.id}`}
                                type="file"
                                accept=".doc,.docx,.pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                                className="hidden"
                                onChange={(
                                  e: ChangeEvent<HTMLInputElement>,
                                ) => {
                                  const file = e.target.files?.[0];
                                  if (file)
                                    handleInterviewDocUpload(
                                      detailModal.id,
                                      file,
                                    );
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
                                disabled={
                                  uploadingInterviewId === detailModal.id
                                }
                              >
                                {uploadingInterviewId === detailModal.id
                                  ? "Uploading..."
                                  : detailModal.interview_doc_url
                                    ? "Replace"
                                    : "Upload"}
                              </button>
                            </>
                          )}
                        </div>
                        {uploadError &&
                          uploadingInterviewId === detailModal.id && (
                            <p className="mt-1 text-xs text-red-500">
                              {uploadError}
                            </p>
                          )}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider">
                          Resume (PDF)
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          {detailModal.resume_url ? (
                            <a
                              href={detailModal.resume_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500"
                            >
                              <Download size={13} /> Download
                            </a>
                          ) : (
                            <span className="text-sm text-slate-400 dark:text-slate-600">
                              Not uploaded
                            </span>
                          )}
                          {!cannotCRUD && (
                            <>
                              <input
                                id={`interview-resume-input-${detailModal.id}`}
                                type="file"
                                accept=".pdf,application/pdf"
                                className="hidden"
                                onChange={(
                                  e: ChangeEvent<HTMLInputElement>,
                                ) => {
                                  const file = e.target.files?.[0];
                                  if (file)
                                    handleInterviewResumeUpload(
                                      detailModal.id,
                                      file,
                                    );
                                }}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  document
                                    .getElementById(
                                      `interview-resume-input-${detailModal.id}`,
                                    )
                                    ?.click()
                                }
                                className="rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors"
                                disabled={
                                  uploadingInterviewId === detailModal.id
                                }
                              >
                                {uploadingInterviewId === detailModal.id
                                  ? "Uploading..."
                                  : detailModal.resume_url
                                    ? "Replace"
                                    : "Upload"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
            transform: pipelinePopover.flipAbove
              ? "translateY(-100%)"
              : undefined,
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
