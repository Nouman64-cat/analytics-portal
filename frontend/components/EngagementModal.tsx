"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import {
  Calendar,
  Clock,
  MapPin,
  Video,
  Users,
  Layers,
  Bell,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Trash2,
  X,
  FileText,
  Sparkles,
  ExternalLink,
  Save,
  Tag,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type {
  BusinessDeveloper,
  Candidate,
  Company,
  Department,
  Engagement,
  EngagementFormData,
  Interview,
} from "@/lib/types";
import { engagementsService } from "@/lib/services";
import {
  parseUtcDatetime,
  TIMEZONE_OPTIONS,
  formatTime,
  INTERVIEW_SCHEDULE_TZ,
} from "@/lib/utils";
import SearchableSelect from "@/components/SearchableSelect";

const STATUS_OPTIONS = [
  { id: "scheduled", label: "Scheduled", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20" },
  { id: "tentative", label: "Tentative", color: "text-amber-600 bg-amber-50 dark:bg-amber-500/10 dark:text-amber-400 border-amber-200 dark:border-amber-500/20" },
  { id: "completed", label: "Completed", color: "text-blue-600 bg-blue-50 dark:bg-blue-500/10 dark:text-blue-400 border-blue-200 dark:border-blue-500/20" },
  { id: "cancelled", label: "Cancelled", color: "text-rose-600 bg-rose-50 dark:bg-rose-500/10 dark:text-rose-400 border-rose-200 dark:border-rose-500/20" },
];

const SHOW_AS_OPTIONS = [
  { id: "busy", label: "Busy", dot: "bg-rose-500" },
  { id: "free", label: "Free", dot: "bg-emerald-500" },
  { id: "tentative", label: "Tentative", dot: "bg-amber-500" },
  { id: "oof", label: "Out of Office", dot: "bg-purple-500" },
];

const REMINDER_OPTIONS: { id: string; label: string; minutes: number | null }[] = [
  { id: "none", label: "No reminder", minutes: null },
  { id: "0", label: "0m (At event time)", minutes: 0 },
  { id: "5", label: "5 minutes before", minutes: 5 },
  { id: "10", label: "10 minutes before", minutes: 10 },
  { id: "15", label: "15 minutes before", minutes: 15 },
  { id: "30", label: "30 minutes before", minutes: 30 },
  { id: "60", label: "1 hour before", minutes: 60 },
  { id: "1440", label: "1 day before", minutes: 1440 },
];

const DURATION_PRESETS = [
  { label: "15m", mins: 15 },
  { label: "30m", mins: 30 },
  { label: "45m", mins: 45 },
  { label: "1h", mins: 60 },
  { label: "1.5h", mins: 90 },
  { label: "2h", mins: 120 },
];

const AGENDA_TEMPLATES = [
  {
    title: "Candidate Interview",
    content: "• 00-05m: Introductions & portal overview\n• 05-25m: Technical & behavioral evaluation\n• 25-30m: Candidate Q&A & next steps",
  },
  {
    title: "Client Sync",
    content: "• Pipeline status & open roles review\n• Feedback on recently submitted profiles\n• Action items & timeline alignment",
  },
  {
    title: "Prep Session",
    content: "• Review target job description & key requirements\n• Mock questions & elevator pitch practice\n• Logistics & audio/video check",
  },
];

const TIMELINE_START_HOUR = 7; // 7 AM
const TIMELINE_END_HOUR = 22; // 10 PM
const HOUR_ROW_HEIGHT = 48; // px per hour slot

function reminderIdForMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "none";
  const match = REMINDER_OPTIONS.find((o) => o.minutes === minutes);
  return match ? match.id : "none";
}

function toDatetimeLocalValue(d: Date, tz: string): string {
  return formatInTimeZone(d, tz, "yyyy-MM-dd'T'HH:mm");
}

function toDateValue(d: Date, tz: string): string {
  return formatInTimeZone(d, tz, "yyyy-MM-dd");
}

interface EngagementModalProps {
  open: boolean;
  onClose: () => void;
  engagement: Engagement | null;
  initialRange?: { start: Date; end: Date } | null;
  tz: string;
  candidates: Candidate[];
  companies: Company[];
  businessDevelopers: BusinessDeveloper[];
  departments: Department[];
  currentUserId?: string | null;
  isSuperadmin: boolean;
  defaultDepartmentId: string | null;
  existingEngagements?: Engagement[];
  existingInterviews?: Interview[];
  onCreated: (eng: Engagement) => void;
  onUpdated: (eng: Engagement) => void;
  onDeleted: (id: string) => void;
}

export default function EngagementModal({
  open,
  onClose,
  engagement,
  initialRange,
  tz,
  candidates,
  companies,
  businessDevelopers,
  departments,
  currentUserId,
  isSuperadmin,
  defaultDepartmentId,
  existingEngagements = [],
  existingInterviews = [],
  onCreated,
  onUpdated,
  onDeleted,
}: EngagementModalProps) {
  const isEdit = !!engagement;
  const canEdit = !isEdit || isSuperadmin || engagement?.organizer_id === currentUserId;

  const [isMaximized, setIsMaximized] = useState(false);
  const [activeTab, setActiveTab] = useState<"form" | "scheduler">("form");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isAllDay, setIsAllDay] = useState(false);
  const [startVal, setStartVal] = useState("");
  const [endVal, setEndVal] = useState("");
  const [location, setLocation] = useState("");
  const [meetingLink, setMeetingLink] = useState("");
  const [status, setStatus] = useState("scheduled");
  const [showAs, setShowAs] = useState("busy");
  const [reminderId, setReminderId] = useState("15");
  const [meetingTz, setMeetingTz] = useState(tz);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [candidateId, setCandidateId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [bdId, setBdId] = useState("");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dropdown menus in top toolbar
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showShowAsMenu, setShowShowAsMenu] = useState(false);
  const [showReminderMenu, setShowReminderMenu] = useState(false);
  const [showDeptMenu, setShowDeptMenu] = useState(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const schedulerScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    setDeleting(false);
    setMeetingTz(tz);
    setShowStatusMenu(false);
    setShowShowAsMenu(false);
    setShowReminderMenu(false);
    setShowDeptMenu(false);

    if (engagement) {
      setTitle(engagement.title);
      setDescription(engagement.description ?? "");
      setIsAllDay(engagement.is_all_day);
      const start = parseUtcDatetime(engagement.start_time);
      const end = parseUtcDatetime(engagement.end_time);
      setStartVal(engagement.is_all_day ? toDateValue(start, tz) : toDatetimeLocalValue(start, tz));
      setEndVal(engagement.is_all_day ? toDateValue(end, tz) : toDatetimeLocalValue(end, tz));
      setLocation(engagement.location ?? "");
      setMeetingLink(engagement.meeting_link ?? "");
      setStatus(engagement.status || "scheduled");
      setShowAs(engagement.show_as || "busy");
      setReminderId(reminderIdForMinutes(engagement.reminder_minutes));
      setDepartmentId(engagement.department_id);
      setCandidateId(engagement.candidate_id ?? "");
      setCompanyId(engagement.company_id ?? "");
      setBdId(engagement.bd_id ?? "");
    } else {
      const start = initialRange?.start ?? new Date();
      const end = initialRange?.end ?? new Date(start.getTime() + 30 * 60_000);
      setTitle("");
      setDescription("");
      setIsAllDay(false);
      setStartVal(toDatetimeLocalValue(start, tz));
      setEndVal(toDatetimeLocalValue(end, tz));
      setLocation("");
      setMeetingLink("");
      setStatus("scheduled");
      setShowAs("busy");
      setReminderId("15");
      setDepartmentId(defaultDepartmentId);
      setCandidateId("");
      setCompanyId("");
      setBdId("");
    }

    const timer = setTimeout(() => {
      titleInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [open, engagement, initialRange, defaultDepartmentId, tz]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (canEdit && !saving) {
          void handleSave();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, canEdit, saving, title, startVal, endVal, isAllDay, location, meetingLink, status, showAs, reminderId, departmentId, candidateId, companyId, bdId, meetingTz, description]);

  function parseFieldInZone(val: string, endOfDay: boolean, zone: string): Date {
    if (isAllDay) return fromZonedTime(`${val} ${endOfDay ? "23:59:59" : "00:00:00"}`, zone);
    return fromZonedTime(`${val.replace("T", " ")}:00`, zone);
  }

  function formatFieldInZone(d: Date, zone: string): string {
    return isAllDay ? toDateValue(d, zone) : toDatetimeLocalValue(d, zone);
  }

  function handleTzChange(newTz: string) {
    if (startVal) {
      const instant = parseFieldInZone(startVal, false, meetingTz);
      if (!Number.isNaN(instant.getTime())) setStartVal(formatFieldInZone(instant, newTz));
    }
    if (endVal) {
      const instant = parseFieldInZone(endVal, true, meetingTz);
      if (!Number.isNaN(instant.getTime())) setEndVal(formatFieldInZone(instant, newTz));
    }
    setMeetingTz(newTz);
  }

  function applyDuration(durationMins: number) {
    if (!startVal) return;
    const start = parseFieldInZone(startVal, false, meetingTz);
    if (Number.isNaN(start.getTime())) return;
    const newEnd = new Date(start.getTime() + durationMins * 60_000);
    setEndVal(formatFieldInZone(newEnd, meetingTz));
  }

  const calculatedDuration = useMemo(() => {
    if (!startVal || !endVal || isAllDay) return null;
    const start = parseFieldInZone(startVal, false, meetingTz);
    const end = parseFieldInZone(endVal, false, meetingTz);
    const diffMs = end.getTime() - start.getTime();
    if (diffMs <= 0) return null;
    const mins = Math.round(diffMs / 60_000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return remainMins > 0 ? `${hrs}h ${remainMins}m` : `${hrs}h`;
  }, [startVal, endVal, isAllDay, meetingTz]);

  const selectedDateIso = useMemo(() => {
    if (!startVal) return toDateValue(new Date(), meetingTz);
    return startVal.split("T")[0]!;
  }, [startVal, meetingTz]);

  const schedulerDateLabel = useMemo(() => {
    try {
      const start = parseFieldInZone(startVal || toDatetimeLocalValue(new Date(), meetingTz), false, meetingTz);
      return formatInTimeZone(start, meetingTz, "EEEE, MMMM d, yyyy");
    } catch {
      return "Selected Date";
    }
  }, [startVal, meetingTz]);

  function shiftDate(days: number) {
    if (!startVal) return;
    const start = parseFieldInZone(startVal, false, meetingTz);
    const end = parseFieldInZone(endVal || startVal, false, meetingTz);
    const newStart = new Date(start.getTime() + days * 86400000);
    const newEnd = new Date(end.getTime() + days * 86400000);
    setStartVal(formatFieldInZone(newStart, meetingTz));
    setEndVal(formatFieldInZone(newEnd, meetingTz));
  }

  // Pixel-perfect timeline data
  const timelineData = useMemo(() => {
    const totalHours = TIMELINE_END_HOUR - TIMELINE_START_HOUR + 1; // 16 slots (7 AM to 10 PM)

    let currentEventStartMin = -1;
    let currentEventEndMin = -1;
    if (startVal && endVal && !isAllDay) {
      try {
        const start = parseFieldInZone(startVal, false, meetingTz);
        const end = parseFieldInZone(endVal, false, meetingTz);
        const sH = Number(formatInTimeZone(start, meetingTz, "H"));
        const sM = Number(formatInTimeZone(start, meetingTz, "m"));
        const eH = Number(formatInTimeZone(end, meetingTz, "H"));
        const eM = Number(formatInTimeZone(end, meetingTz, "m"));
        currentEventStartMin = sH * 60 + sM - TIMELINE_START_HOUR * 60;
        currentEventEndMin = eH * 60 + eM - TIMELINE_START_HOUR * 60;
      } catch {}
    }

    // Other engagements on this date
    const dayOtherEngagements = existingEngagements
      .filter((e) => e.id !== engagement?.id && !e.is_all_day && e.status !== "cancelled")
      .map((e) => {
        try {
          const s = parseUtcDatetime(e.start_time);
          const end = parseUtcDatetime(e.end_time);
          const sDate = formatInTimeZone(s, meetingTz, "yyyy-MM-dd");
          if (sDate !== selectedDateIso) return null;
          const sH = Number(formatInTimeZone(s, meetingTz, "H"));
          const sM = Number(formatInTimeZone(s, meetingTz, "m"));
          const eH = Number(formatInTimeZone(end, meetingTz, "H"));
          const eM = Number(formatInTimeZone(end, meetingTz, "m"));
          const startMin = sH * 60 + sM - TIMELINE_START_HOUR * 60;
          const endMin = eH * 60 + eM - TIMELINE_START_HOUR * 60;
          return {
            id: e.id,
            title: e.title,
            status: e.status,
            startMin,
            endMin,
            topPx: (startMin / 60) * HOUR_ROW_HEIGHT,
            heightPx: Math.max(22, ((endMin - startMin) / 60) * HOUR_ROW_HEIGHT),
            timeStr: `${formatInTimeZone(s, meetingTz, "h:mm a")} - ${formatInTimeZone(end, meetingTz, "h:mm a")}`,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as {
        id: string;
        title: string;
        status: string;
        startMin: number;
        endMin: number;
        topPx: number;
        heightPx: number;
        timeStr: string;
      }[];

    // Interviews on this date
    const dayInterviews = existingInterviews
      .map((iv) => {
        try {
          if (!iv.interview_date) return null;
          const ymd = iv.interview_date.split("T")[0]!;
          if (ymd !== selectedDateIso) return null;
          const timeEst = iv.time_est || "12:00:00";
          const [h, m] = timeEst.split(":").map(Number);
          const utc = fromZonedTime(
            `${ymd} ${String(h).padStart(2, "0")}:${String(m || 0).padStart(2, "0")}:00`,
            INTERVIEW_SCHEDULE_TZ
          );
          const sH = Number(formatInTimeZone(utc, meetingTz, "H"));
          const sM = Number(formatInTimeZone(utc, meetingTz, "m"));
          const startMin = sH * 60 + sM - TIMELINE_START_HOUR * 60;
          const endMin = startMin + 45; // 45m block
          return {
            id: iv.id,
            title: `Interview: ${iv.candidate_name || "Candidate"} @ ${iv.company_name || "Company"}`,
            startMin,
            endMin,
            topPx: (startMin / 60) * HOUR_ROW_HEIGHT,
            heightPx: Math.max(22, (45 / 60) * HOUR_ROW_HEIGHT),
            timeStr: formatInTimeZone(utc, meetingTz, "h:mm a"),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean) as {
        id: string;
        title: string;
        startMin: number;
        endMin: number;
        topPx: number;
        heightPx: number;
        timeStr: string;
      }[];

    // Check for scheduling conflicts
    const conflicts: { title: string; timeStr: string }[] = [];
    if (currentEventStartMin >= 0 && currentEventEndMin > currentEventStartMin) {
      for (const eng of dayOtherEngagements) {
        if (currentEventStartMin < eng.endMin && currentEventEndMin > eng.startMin) {
          conflicts.push({ title: eng.title, timeStr: eng.timeStr });
        }
      }
      for (const iv of dayInterviews) {
        if (currentEventStartMin < iv.endMin && currentEventEndMin > iv.startMin) {
          conflicts.push({ title: iv.title, timeStr: iv.timeStr });
        }
      }
    }

    const currentTopPx = (currentEventStartMin / 60) * HOUR_ROW_HEIGHT;
    const currentHeightPx = Math.max(
      24,
      ((currentEventEndMin - currentEventStartMin) / 60) * HOUR_ROW_HEIGHT
    );

    return {
      totalHours,
      currentEventStartMin,
      currentEventEndMin,
      currentTopPx,
      currentHeightPx,
      dayOtherEngagements,
      dayInterviews,
      conflicts,
    };
  }, [selectedDateIso, startVal, endVal, isAllDay, meetingTz, existingEngagements, existingInterviews, engagement?.id]);

  // Auto-scroll timeline to the current meeting time
  useEffect(() => {
    if (timelineData.currentEventStartMin >= 0 && schedulerScrollRef.current) {
      const scrollTarget = Math.max(0, (timelineData.currentEventStartMin / 60 - 1) * HOUR_ROW_HEIGHT);
      schedulerScrollRef.current.scrollTo({ top: scrollTarget, behavior: "smooth" });
    }
  }, [timelineData.currentEventStartMin, selectedDateIso]);

  function handleTimelineSlotClick(hour: number, minute: number = 0) {
    if (!canEdit || isAllDay) return;
    const datePrefix = selectedDateIso;
    const sH = String(hour).padStart(2, "0");
    const sM = String(minute).padStart(2, "0");
    const newStartStr = `${datePrefix}T${sH}:${sM}`;
    setStartVal(newStartStr);

    const start = parseFieldInZone(newStartStr, false, meetingTz);
    const newEnd = new Date(start.getTime() + 30 * 60_000);
    setEndVal(formatFieldInZone(newEnd, meetingTz));
  }

  function buildPayload(): EngagementFormData | null {
    if (!title.trim()) {
      setError("Title is required.");
      return null;
    }
    const start = parseFieldInZone(startVal, false, meetingTz);
    const end = parseFieldInZone(isAllDay ? endVal || startVal : endVal, true, meetingTz);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setError("Please provide valid start and end times.");
      return null;
    }
    if (start > end) {
      setError("End time must be after start time.");
      return null;
    }
    const reminder = REMINDER_OPTIONS.find((o) => o.id === reminderId)?.minutes ?? null;
    return {
      title: title.trim(),
      description: description.trim() || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      is_all_day: isAllDay,
      location: location.trim() || null,
      meeting_link: meetingLink.trim() || null,
      status,
      show_as: showAs,
      reminder_minutes: reminder,
      department_id: departmentId,
      candidate_id: candidateId || null,
      company_id: companyId || null,
      bd_id: bdId || null,
    };
  }

  async function handleSave() {
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    setError(null);
    try {
      if (engagement) {
        const updated = await engagementsService.update(engagement.id, payload);
        onUpdated(updated as Engagement);
      } else {
        const created = await engagementsService.create(payload);
        onCreated(created as Engagement);
      }
      window.dispatchEvent(new CustomEvent("engagement-changed"));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save meeting");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!engagement) return;
    if (!window.confirm("Are you sure you want to delete this meeting?")) return;
    setDeleting(true);
    setError(null);
    try {
      await engagementsService.delete(engagement.id);
      onDeleted(engagement.id);
      window.dispatchEvent(new CustomEvent("engagement-changed"));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete meeting");
    } finally {
      setDeleting(false);
    }
  }

  const candidateOptions = candidates.map((c) => ({ id: c.id, label: c.name, sublabel: "Candidate" }));
  const companyOptions = companies.map((c) => ({ id: c.id, label: c.name, sublabel: "Company" }));
  const bdOptions = businessDevelopers.map((b) => ({ id: b.id, label: b.name, sublabel: "Business Dev" }));

  const currentStatusObj = STATUS_OPTIONS.find((s) => s.id === status) || STATUS_OPTIONS[0]!;
  const currentShowAsObj = SHOW_AS_OPTIONS.find((s) => s.id === showAs) || SHOW_AS_OPTIONS[0]!;
  const currentReminderObj = REMINDER_OPTIONS.find((r) => r.id === reminderId) || REMINDER_OPTIONS[4]!;
  const currentDeptObj = departments.find((d) => d.id === departmentId);

  if (!open) return null;

  const hasConflicts = timelineData.conflicts.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Main Window */}
      <div
        className={`relative z-10 flex flex-col overflow-hidden rounded-2xl sm:rounded-3xl bg-white dark:bg-[#11131c] shadow-2xl border border-slate-200/80 dark:border-white/[0.1] text-slate-900 dark:text-slate-100 transition-all duration-300 ${
          isMaximized
            ? "h-full w-full max-w-full rounded-none"
            : "h-[92vh] max-h-[860px] w-full max-w-6xl"
        }`}
      >
        {/* ── Top Window Bar (Title + Window Controls) ── */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200/80 dark:border-white/[0.08] bg-slate-50/80 dark:bg-white/[0.02] px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400">
              <Calendar size={15} />
            </span>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {isEdit ? (canEdit ? "Edit meeting" : "Meeting details") : "New meeting"}
            </h2>
            {engagement?.organizer_name && (
              <span className="hidden text-xs text-slate-400 dark:text-slate-500 sm:inline">
                • Organized by {engagement.organizer_name}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {/* Tab switch for mobile */}
            <div className="flex rounded-lg bg-slate-200/60 p-0.5 dark:bg-white/[0.06] md:hidden">
              <button
                type="button"
                onClick={() => setActiveTab("form")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  activeTab === "form"
                    ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Details
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("scheduler")}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  activeTab === "scheduler"
                    ? "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm"
                    : "text-slate-500"
                }`}
              >
                Scheduler
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsMaximized((m) => !m)}
              className="hidden h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-white transition-colors sm:flex"
              title={isMaximized ? "Restore window" : "Maximize window"}
            >
              {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 transition-colors"
              title="Close (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Action Ribbon / Toolbar ── */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141724] px-4 py-2 sm:px-6">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Event Badge */}
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100/80 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300">
              <span className="h-2 w-2 rounded-full bg-indigo-500" />
              Event
            </span>

            {/* Show As Dropdown */}
            <div className="relative">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setShowShowAsMenu((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.08] transition-all"
              >
                <span className={`h-2 w-2 rounded-full ${currentShowAsObj.dot}`} />
                <span>{currentShowAsObj.label}</span>
                <ChevronDown size={12} className="text-slate-400" />
              </button>

              {showShowAsMenu && (
                <div
                  className="absolute left-0 top-full z-30 mt-1 w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-white/[0.1] dark:bg-[#1c1f2e]"
                  onClick={() => setShowShowAsMenu(false)}
                >
                  {SHOW_AS_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setShowAs(opt.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                        showAs === opt.id
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300"
                          : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]"
                      }`}
                    >
                      <span className={`h-2 w-2 rounded-full ${opt.dot}`} />
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Reminder Dropdown */}
            <div className="relative">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setShowReminderMenu((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-indigo-300 hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-slate-300 dark:hover:bg-white/[0.08] transition-all"
              >
                <Bell size={13} className="text-amber-500" />
                <span>{currentReminderObj.label}</span>
                <ChevronDown size={12} className="text-slate-400" />
              </button>

              {showReminderMenu && (
                <div
                  className="absolute left-0 top-full z-30 mt-1 w-44 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-white/[0.1] dark:bg-[#1c1f2e]"
                  onClick={() => setShowReminderMenu(false)}
                >
                  {REMINDER_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setReminderId(opt.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                        reminderId === opt.id
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                          : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {reminderId === opt.id && <Check size={12} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Status Dropdown */}
            <div className="relative">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setShowStatusMenu((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all ${currentStatusObj.color}`}
              >
                <Tag size={12} />
                <span>{currentStatusObj.label}</span>
                <ChevronDown size={12} className="opacity-60" />
              </button>

              {showStatusMenu && (
                <div
                  className="absolute left-0 top-full z-30 mt-1 w-36 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-white/[0.1] dark:bg-[#1c1f2e]"
                  onClick={() => setShowStatusMenu(false)}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setStatus(opt.id)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                        status === opt.id
                          ? "bg-slate-100 text-slate-900 dark:bg-white/10 dark:text-white"
                          : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]"
                      }`}
                    >
                      <span className="capitalize">{opt.label}</span>
                      {status === opt.id && <Check size={12} />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Department scope */}
            {isSuperadmin && departments.length > 0 && (
              <div className="relative">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setShowDeptMenu((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200/80 bg-teal-50/60 px-2.5 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100/80 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300 transition-all"
                >
                  <Layers size={12} />
                  <span>{currentDeptObj ? currentDeptObj.name : "All Departments"}</span>
                  <ChevronDown size={12} className="opacity-60" />
                </button>

                {showDeptMenu && (
                  <div
                    className="absolute left-0 top-full z-30 mt-1 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-white/[0.1] dark:bg-[#1c1f2e]"
                    onClick={() => setShowDeptMenu(false)}
                  >
                    <button
                      type="button"
                      onClick={() => setDepartmentId(null)}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                        departmentId === null
                          ? "bg-teal-50 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300"
                          : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]"
                      }`}
                    >
                      <span>All departments</span>
                      {departmentId === null && <Check size={12} />}
                    </button>
                    {departments.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDepartmentId(d.id)}
                        className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs font-medium transition-colors ${
                          departmentId === d.id
                            ? "bg-teal-50 text-teal-700 dark:bg-teal-500/20 dark:text-teal-300"
                            : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]"
                        }`}
                      >
                        <span>{d.name}</span>
                        {departmentId === d.id && <Check size={12} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Action: Save Button */}
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                disabled={saving || deleting}
                onClick={() => void handleSave()}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-1.5 text-xs font-semibold text-white shadow-md shadow-indigo-500/25 hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] disabled:opacity-50 transition-all cursor-pointer"
              >
                <Save size={14} />
                <span>{saving ? "Saving…" : isEdit ? "Save changes" : "Save event"}</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Main Split View Body (Left: Form, Right: Mini Scheduler) ── */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Left Column: Form Details */}
          <div
            className={`flex-1 overflow-y-auto p-4 sm:p-6 md:border-r border-slate-200/80 dark:border-white/[0.08] ${
              activeTab === "scheduler" ? "hidden md:block" : "block"
            }`}
          >
            <div className="mx-auto max-w-2xl space-y-6">
              {/* Conflict Alert Banner */}
              {hasConflicts && (
                <div className="flex items-start gap-2.5 rounded-2xl bg-amber-50 p-3.5 text-xs font-medium text-amber-900 dark:bg-amber-500/10 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 animate-in fade-in duration-200">
                  <AlertTriangle size={16} className="shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">Scheduling Conflict Detected</p>
                    <p className="mt-0.5 text-amber-800 dark:text-amber-300/90">
                      This time overlaps with: <span className="font-semibold">{timelineData.conflicts.map((c) => `${c.title} (${c.timeStr})`).join(", ")}</span>. Check the scheduler on the right to pick a free slot.
                    </p>
                  </div>
                </div>
              )}

              {/* 1. Title Input */}
              <div className="relative flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Sparkles size={18} />
                </div>
                <div className="flex-1">
                  <input
                    ref={titleInputRef}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={!canEdit}
                    placeholder="Add title"
                    maxLength={500}
                    className="w-full border-b-2 border-slate-200 dark:border-white/10 bg-transparent py-1.5 text-lg sm:text-xl font-semibold text-slate-900 dark:text-white placeholder-slate-400 outline-none transition-colors focus:border-indigo-600 dark:focus:border-indigo-400"
                  />
                </div>
              </div>

              {/* 2. Attendees / Portal Entities */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-white/[0.07] dark:bg-white/[0.02] space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <Users size={14} className="text-indigo-500" />
                  <span>Participants & Related Entities</span>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      Candidate
                    </label>
                    <SearchableSelect
                      options={candidateOptions}
                      value={candidateId}
                      onChange={canEdit ? setCandidateId : () => {}}
                      disabled={!canEdit}
                      optional
                      placeholder="Add candidate…"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      Company
                    </label>
                    <SearchableSelect
                      options={companyOptions}
                      value={companyId}
                      onChange={canEdit ? setCompanyId : () => {}}
                      disabled={!canEdit}
                      optional
                      placeholder="Add company…"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      Business Developer
                    </label>
                    <SearchableSelect
                      options={bdOptions}
                      value={bdId}
                      onChange={canEdit ? setBdId : () => {}}
                      disabled={!canEdit}
                      optional
                      placeholder="Add BD…"
                    />
                  </div>
                </div>
              </div>

              {/* 3. Time, Date & Duration Selection */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-white/[0.07] dark:bg-white/[0.02] space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <Clock size={14} className="text-indigo-500" />
                    <span>Date & Schedule</span>
                  </div>

                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
                    <input
                      type="checkbox"
                      checked={isAllDay}
                      onChange={(e) => setIsAllDay(e.target.checked)}
                      disabled={!canEdit}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>All day</span>
                  </label>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Starts
                    </label>
                    <input
                      type={isAllDay ? "date" : "datetime-local"}
                      value={startVal}
                      onChange={(e) => setStartVal(e.target.value)}
                      disabled={!canEdit}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-900 shadow-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/[0.08] dark:bg-[#1a1d2d] dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Ends
                    </label>
                    <input
                      type={isAllDay ? "date" : "datetime-local"}
                      value={endVal}
                      onChange={(e) => setEndVal(e.target.value)}
                      disabled={!canEdit}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm font-medium text-slate-900 shadow-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/[0.08] dark:bg-[#1a1d2d] dark:text-white"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {!isAllDay && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] text-slate-400">Duration:</span>
                      {DURATION_PRESETS.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          disabled={!canEdit}
                          onClick={() => applyDuration(p.mins)}
                          className={`rounded-lg px-2 py-0.5 text-xs font-semibold transition-all ${
                            calculatedDuration === p.label
                              ? "bg-indigo-600 text-white shadow-sm"
                              : "bg-slate-200/70 text-slate-700 hover:bg-slate-300/70 dark:bg-white/[0.06] dark:text-slate-300 dark:hover:bg-white/[0.1]"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="relative ml-auto flex items-center gap-1">
                    <span className="text-[11px] text-slate-400">Zone:</span>
                    <select
                      value={meetingTz}
                      onChange={(e) => handleTzChange(e.target.value)}
                      disabled={!canEdit}
                      className="rounded-lg border border-slate-200 bg-white py-1 pl-2 pr-7 text-xs font-medium text-slate-700 outline-none hover:border-slate-300 dark:border-white/[0.08] dark:bg-[#1a1d2d] dark:text-slate-300"
                    >
                      {TIMEZONE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={12}
                      className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                  </div>
                </div>
              </div>

              {/* 4. Location & Meeting Link */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-white/[0.07] dark:bg-white/[0.02] space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <MapPin size={14} className="text-rose-500" />
                    <span>Location / Room</span>
                  </div>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={!canEdit}
                    placeholder="e.g. Interview Room 1 / Office"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/[0.08] dark:bg-[#1a1d2d] dark:text-white placeholder-slate-400"
                  />
                </div>

                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-white/[0.07] dark:bg-white/[0.02] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <Video size={14} className="text-violet-500" />
                      <span>Meeting link</span>
                    </div>
                    {meetingLink && (
                      <a
                        href={meetingLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        <span>Join</span>
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                  <input
                    type="url"
                    value={meetingLink}
                    onChange={(e) => setMeetingLink(e.target.value)}
                    disabled={!canEdit}
                    placeholder="https://teams.microsoft.com/… or Zoom"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs sm:text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/[0.08] dark:bg-[#1a1d2d] dark:text-white placeholder-slate-400"
                  />
                </div>
              </div>

              {/* 5. Description & Agenda Notes */}
              <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 dark:border-white/[0.07] dark:bg-white/[0.02] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <FileText size={14} className="text-indigo-500" />
                    <span>Agenda & Notes</span>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-400 hidden sm:inline">Templates:</span>
                      {AGENDA_TEMPLATES.map((tmpl) => (
                        <button
                          key={tmpl.title}
                          type="button"
                          onClick={() => {
                            setDescription((prev) =>
                              prev.trim() ? `${prev}\n\n${tmpl.content}` : tmpl.content
                            );
                          }}
                          className="rounded-md bg-slate-200/60 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-white/[0.05] dark:text-slate-400 dark:hover:bg-indigo-500/20 dark:hover:text-indigo-300 transition-colors"
                        >
                          +{tmpl.title}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={!canEdit}
                  rows={4}
                  placeholder="Add meeting agenda, talking points, preparation instructions, or candidate guidelines…"
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs sm:text-sm text-slate-900 shadow-sm outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/[0.08] dark:bg-[#1a1d2d] dark:text-white placeholder-slate-400 resize-none font-sans"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Pixel-Perfect Day Timeline & Conflict Visualizer */}
          <div
            className={`w-full md:w-80 lg:w-96 shrink-0 flex flex-col bg-slate-50/50 dark:bg-white/[0.01] ${
              activeTab === "form" ? "hidden md:flex" : "flex"
            }`}
          >
            {/* Header: Date navigation */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200/80 dark:border-white/[0.08] px-4 py-3 bg-white dark:bg-[#141724]">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => shiftDate(-1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06] transition-colors"
                  title="Previous Day"
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => shiftDate(1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06] transition-colors"
                  title="Next Day"
                >
                  <ChevronRight size={14} />
                </button>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {schedulerDateLabel}
                </span>
              </div>

              <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
                Scheduler
              </span>
            </div>

            {/* Scrollable Timeline */}
            <div ref={schedulerScrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4">
              <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
                <span>Click any row to set start time</span>
                {hasConflicts && (
                  <span className="font-bold text-amber-600 dark:text-amber-400">Conflict</span>
                )}
              </div>

              {/* Exact Timeline Grid Container */}
              <div
                className="relative border-l-2 border-slate-200 dark:border-white/[0.1] ml-11 my-1"
                style={{ height: `${timelineData.totalHours * HOUR_ROW_HEIGHT}px` }}
              >
                {/* 1. Hour Grid Rows */}
                {Array.from({ length: timelineData.totalHours }).map((_, idx) => {
                  const hour = TIMELINE_START_HOUR + idx;
                  const ampm = hour >= 12 ? "PM" : "AM";
                  const h12 = hour % 12 || 12;
                  const timeLabel = `${h12} ${ampm}`;

                  return (
                    <div
                      key={hour}
                      style={{ height: `${HOUR_ROW_HEIGHT}px` }}
                      className="group relative border-b border-slate-200/60 dark:border-white/[0.05] flex items-center cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10 transition-colors"
                      onClick={() => handleTimelineSlotClick(hour, 0)}
                    >
                      {/* Hour label on the left */}
                      <span className="absolute -left-11 -top-2 text-[10px] font-medium text-slate-400 group-hover:text-indigo-500 transition-colors select-none">
                        {timeLabel}
                      </span>

                      {/* Half-hour guide line */}
                      <div className="absolute left-0 right-0 top-1/2 border-t border-dashed border-slate-100 dark:border-white/[0.03] pointer-events-none" />

                      <span className="opacity-0 group-hover:opacity-100 text-[10px] text-indigo-500 font-medium transition-opacity pl-2">
                        + Set {timeLabel}
                      </span>
                    </div>
                  );
                })}

                {/* 2. Other Existing Engagements on this Day */}
                {timelineData.dayOtherEngagements.map((eng) => {
                  const isConflictWithCurrent =
                    timelineData.currentEventStartMin >= 0 &&
                    timelineData.currentEventStartMin < eng.endMin &&
                    timelineData.currentEventEndMin > eng.startMin;
                  const isCompleted = eng.status === "completed";

                  return (
                    <div
                      key={eng.id}
                      style={{
                        top: `${eng.topPx}px`,
                        height: `${eng.heightPx}px`,
                        left: isConflictWithCurrent ? "50%" : "4px",
                        right: "4px",
                        width: isConflictWithCurrent ? "calc(50% - 6px)" : "auto",
                      }}
                      className={`absolute z-10 rounded-lg p-1.5 shadow-sm overflow-hidden transition-all pointer-events-none border ${
                        isCompleted
                          ? "bg-emerald-100/95 dark:bg-emerald-950/80 border-emerald-300 dark:border-emerald-700/60 text-emerald-900 dark:text-emerald-200"
                          : "bg-indigo-100/90 dark:bg-indigo-950/70 border-indigo-300 dark:border-indigo-700/60 text-indigo-900 dark:text-indigo-200"
                      }`}
                    >
                      <p className="truncate text-[10px] font-bold leading-none flex items-center gap-1">
                        {isCompleted && <Check size={10} className="shrink-0 text-emerald-600 dark:text-emerald-400 stroke-[2.5]" />}
                        <span className="truncate">{eng.title}</span>
                      </p>
                      <p className="text-[9px] opacity-75 truncate mt-0.5">{eng.timeStr}</p>
                    </div>
                  );
                })}

                {/* 3. Existing Interviews on this Day */}
                {timelineData.dayInterviews.map((iv) => {
                  const isConflictWithCurrent =
                    timelineData.currentEventStartMin >= 0 &&
                    timelineData.currentEventStartMin < iv.endMin &&
                    timelineData.currentEventEndMin > iv.startMin;

                  return (
                    <div
                      key={iv.id}
                      style={{
                        top: `${iv.topPx}px`,
                        height: `${iv.heightPx}px`,
                        left: isConflictWithCurrent ? "50%" : "4px",
                        right: "4px",
                        width: isConflictWithCurrent ? "calc(50% - 6px)" : "auto",
                      }}
                      className="absolute z-10 rounded-lg bg-violet-100/90 dark:bg-violet-950/70 border border-violet-300 dark:border-violet-700/60 p-1.5 text-violet-900 dark:text-violet-200 shadow-sm overflow-hidden transition-all pointer-events-none"
                    >
                      <p className="truncate text-[10px] font-bold leading-none">{iv.title}</p>
                      <p className="text-[9px] opacity-75 truncate">{iv.timeStr}</p>
                    </div>
                  );
                })}

                {/* 4. Active Current Meeting Bar (Pixel-Perfect) */}
                {timelineData.currentEventStartMin >= 0 &&
                  timelineData.currentEventEndMin > timelineData.currentEventStartMin && (
                    <div
                      style={{
                        top: `${timelineData.currentTopPx}px`,
                        height: `${timelineData.currentHeightPx}px`,
                        left: hasConflicts ? "4px" : "4px",
                        right: hasConflicts ? "auto" : "4px",
                        width: hasConflicts ? "calc(50% - 6px)" : "auto",
                      }}
                      className={`absolute z-20 rounded-xl p-2 text-white shadow-lg ring-2 animate-in zoom-in-95 duration-150 overflow-hidden flex flex-col justify-between ${
                        hasConflicts
                          ? "bg-gradient-to-r from-amber-500 to-rose-500 shadow-amber-500/25 ring-amber-300 dark:ring-amber-400/40"
                          : "bg-gradient-to-r from-emerald-500 to-teal-500 dark:from-emerald-600 dark:to-teal-600 shadow-emerald-500/25 ring-emerald-300 dark:ring-emerald-400/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-[11px] font-bold leading-tight">
                          {title.trim() || "New Meeting"}
                        </span>
                        {calculatedDuration && (
                          <span className="rounded bg-black/25 px-1 py-0.2 text-[9px] font-semibold shrink-0">
                            {calculatedDuration}
                          </span>
                        )}
                      </div>

                      {timelineData.currentHeightPx > 36 && (
                        <p className="text-[9px] opacity-90 truncate leading-none mt-0.5">
                          {startVal && endVal
                            ? `${formatTime(startVal.split("T")[1])} - ${formatTime(endVal.split("T")[1])}`
                            : "Scheduled time"}
                        </p>
                      )}
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Bottom Action Footer ── */}
        <div className="flex shrink-0 items-center justify-between border-t border-slate-200/80 dark:border-white/[0.08] bg-slate-50/80 dark:bg-white/[0.02] px-4 py-3 sm:px-6">
          <div>
            {isEdit && canEdit ? (
              <button
                type="button"
                disabled={deleting || saving}
                onClick={() => void handleDelete()}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10 disabled:opacity-50 transition-colors"
              >
                <Trash2 size={14} />
                <span>{deleting ? "Deleting…" : "Delete meeting"}</span>
              </button>
            ) : (
              <span className="text-xs text-slate-400">
                Press <kbd className="rounded border border-slate-300 dark:border-white/20 bg-white dark:bg-white/5 px-1 py-0.5 text-[10px]">Ctrl+S</kbd> to save
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:bg-white/[0.08] transition-colors"
            >
              Discard
            </button>
            {canEdit && (
              <button
                type="button"
                disabled={saving || deleting}
                onClick={() => void handleSave()}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-semibold text-white shadow-md active:scale-[0.98] disabled:opacity-50 transition-all ${
                  hasConflicts
                    ? "bg-amber-600 hover:bg-amber-500 shadow-amber-500/20"
                    : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20"
                }`}
              >
                <Save size={14} />
                <span>
                  {saving
                    ? "Saving…"
                    : isEdit
                    ? "Save changes"
                    : hasConflicts
                    ? "Save despite conflict"
                    : "Save event"}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
