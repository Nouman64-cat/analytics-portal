"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Plus,
  Video,
  Copy,
  Check,
  FileText,
  Layers,
  MapPin,
  Clock,
  User,
  Building2,
  DollarSign,
  Maximize2,
  X,
  Sparkles,
  Calendar,
  History,
  MessageSquare,
  AlignLeft,
} from "lucide-react";
import {
  interviewsService,
  busyDaysService,
  departmentsService,
  candidatesService,
  engagementsService,
  companiesService,
  businessDevelopersService,
} from "@/lib/services";
import type {
  Interview,
  BusyDay,
  Department,
  Candidate,
  Engagement,
  Company,
  BusinessDeveloper,
} from "@/lib/types";
import {
  formatInterviewDateEst,
  formatInterviewTimeInZone,
  formatTime,
  INTERVIEW_SCHEDULE_TZ,
  TIMEZONE_OPTIONS,
  truncate,
} from "@/lib/utils";
import { getUserRole, getUserId } from "@/lib/auth";
import { useDepartmentContext } from "@/lib/DepartmentContext";
import InterviewsCalendar from "@/components/InterviewsCalendar";
import WeeklyProgressButton from "@/components/WeeklyProgressButton";
import TimeGridCalendar, {
  addDays,
  getCalendarDays,
  toISODateLocal,
} from "@/components/TimeGridCalendar";
import EngagementModal from "@/components/EngagementModal";
import Modal, { buttonPrimary, buttonSecondary } from "@/components/Modal";
import StatusBadge from "@/components/StatusBadge";
import { PageLoader, ErrorState, PageHeader } from "@/components/PageStates";

function PreviewField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-500">
        {label}
      </p>
      <div className="mt-0.5 text-sm text-slate-900 dark:text-white">
        {children}
      </div>
    </div>
  );
}

/** Parse YYYY-MM-DD as a local-timezone date (avoids UTC midnight off-by-one). */
function parseDateLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDayTitle(iso: string): string {
  return parseDateLocal(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** "Aug 17 – 23, 2026" / "Aug 31 – Sep 6, 2026" for the week header label. */
function formatWeekRangeLabel(start: Date, end: Date): string {
  const sameMonth = start.getMonth() === end.getMonth();
  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startLabel} – ${endLabel}`;
}

const CAN_MARK_BUSY_ROLES = new Set(["superadmin", "team-member"]);
/** Same read-only roles the backend's assert_write_access rejects for engagement writes. */
const ENGAGEMENT_READ_ONLY_ROLES = new Set([
  "bd-manager",
  "guest",
  "coordinator",
]);

export default function CalendarPage() {
  const router = useRouter();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [busyDays, setBusyDays] = useState<BusyDay[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tz, setTz] = useState<string>(INTERVIEW_SCHEDULE_TZ);

  // Google Calendar-style default: open on the current week, not the full month.
  const [calendarView, setCalendarView] = useState<"week" | "month">("week");
  const [weekCursor, setWeekCursor] = useState<Date>(() => new Date());

  // Clicking a day cell expands it into a full hourly agenda (Engagements + Interviews)
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [dayEngagements, setDayEngagements] = useState<Engagement[]>([]);
  // Engagements touching the visible month — just enough to flag day cells that have one.
  const [monthEngagements, setMonthEngagements] = useState<Engagement[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);

  const handleCopyLink = useCallback((link: string) => {
    if (!link) return;
    void navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }, []);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [businessDevelopers, setBusinessDevelopers] = useState<
    BusinessDeveloper[]
  >([]);
  const [engagementModal, setEngagementModal] = useState<{
    engagement: Engagement | null;
    initialRange: { start: Date; end: Date } | null;
  } | null>(null);

  // Busy day modal state
  const [dayModal, setDayModal] = useState<{ date: string } | null>(null);
  const [busyReason, setBusyReason] = useState("");
  const [busyDeptId, setBusyDeptId] = useState<string | null>(null);
  const [busyLoading, setBusyLoading] = useState(false);
  const [busyError, setBusyError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);

  const role = getUserRole();
  const currentUserId = getUserId();
  const canMarkBusy = role !== null && CAN_MARK_BUSY_ROLES.has(role);
  const canWriteEngagements =
    role !== null && !ENGAGEMENT_READ_ONLY_ROLES.has(role);
  const isSuperadmin = role === "superadmin";
  const { departmentId } = useDepartmentContext();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [interviewData, busyData, candidateData, companyData, bdData] =
        await Promise.all([
          interviewsService.list(
            departmentId ? { department_id: departmentId } : undefined,
          ),
          busyDaysService.list(
            departmentId ? { department_id: departmentId } : undefined,
          ),
          candidatesService.list({ department_id: departmentId }),
          companiesService.list(),
          businessDevelopersService.list(),
        ]);
      setInterviews(interviewData);
      setBusyDays(busyData);
      setCandidates(candidateData);
      setCompanies(companyData);
      setBusinessDevelopers(bdData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load calendar data",
      );
    } finally {
      setLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    void fetchData();
    if (isSuperadmin) {
      departmentsService
        .list()
        .then((depts) => setDepartments(depts.filter((d) => d.is_active)))
        .catch(() => {});
    }
  }, [fetchData, isSuperadmin]);

  // Engagements for the expanded day are fetched on demand, scoped to just that day, rather
  // than loaded in full up front.
  const fetchDayEngagements = useCallback(
    async (iso: string) => {
      const day = parseDateLocal(iso);
      const start = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        0,
        0,
        0,
      );
      const end = new Date(
        day.getFullYear(),
        day.getMonth(),
        day.getDate(),
        23,
        59,
        59,
      );
      try {
        const data = await engagementsService.list({
          start_date: start.toISOString(),
          end_date: end.toISOString(),
          ...(departmentId ? { department_id: departmentId } : {}),
        });
        setDayEngagements(data);
      } catch {
        // surfaced via the modal's own error state on the next create/edit attempt
      }
    },
    [departmentId],
  );

  useEffect(() => {
    if (!expandedDay) {
      setDayEngagements([]);
      return;
    }
    void fetchDayEngagements(expandedDay);
  }, [expandedDay, fetchDayEngagements]);

  // Engagements for the visible month grid — just enough to flag day cells that have one.
  const [monthRange, setMonthRange] = useState<{ start: Date; end: Date } | null>(null);
  const fetchMonthEngagements = useCallback(
    async (start: Date, end: Date) => {
      try {
        const data = await engagementsService.list({
          start_date: start.toISOString(),
          end_date: end.toISOString(),
          ...(departmentId ? { department_id: departmentId } : {}),
        });
        setMonthEngagements(data);
      } catch {
        // indicator-only data; non-critical if it fails
      }
    },
    [departmentId],
  );
  const handleVisibleRangeChange = useCallback(
    (start: Date, end: Date) => {
      setMonthRange({ start, end });
      void fetchMonthEngagements(start, end);
    },
    [fetchMonthEngagements],
  );

  const weekDays = useMemo(
    () => getCalendarDays("week", weekCursor),
    [weekCursor],
  );
  const weekStart = weekDays[0];
  const weekEnd = weekDays[weekDays.length - 1];

  // Fetch engagements for the visible week, same on-demand pattern as the month grid.
  useEffect(() => {
    if (calendarView !== "week") return;
    const start = new Date(
      weekStart.getFullYear(),
      weekStart.getMonth(),
      weekStart.getDate(),
      0,
      0,
      0,
    );
    const end = new Date(
      weekEnd.getFullYear(),
      weekEnd.getMonth(),
      weekEnd.getDate(),
      23,
      59,
      59,
    );
    handleVisibleRangeChange(start, end);
    // weekStart/weekEnd are derived from weekCursor each render; keying on their time values
    // avoids re-fetching on every render from a new-but-equal Date object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarView, weekStart.getTime(), weekEnd.getTime(), handleVisibleRangeChange]);

  const goPrevWeek = useCallback(() => setWeekCursor((prev) => addDays(prev, -7)), []);
  const goNextWeek = useCallback(() => setWeekCursor((prev) => addDays(prev, 7)), []);
  const goTodayWeek = useCallback(() => setWeekCursor(new Date()), []);

  const refreshEngagements = useCallback(() => {
    if (expandedDay) void fetchDayEngagements(expandedDay);
    if (monthRange) void fetchMonthEngagements(monthRange.start, monthRange.end);
  }, [expandedDay, fetchDayEngagements, monthRange, fetchMonthEngagements]);

  const openCreateEngagement = useCallback((start: Date, end: Date) => {
    setEngagementModal({ engagement: null, initialRange: { start, end } });
  }, []);

  const openEditEngagement = useCallback((eng: Engagement) => {
    setEngagementModal({ engagement: eng, initialRange: null });
  }, []);

  const closeEngagementModal = useCallback(() => setEngagementModal(null), []);

  const goPrevExpandedDay = useCallback(() => {
    setExpandedDay((prev) =>
      prev ? toISODateLocal(addDays(parseDateLocal(prev), -1)) : prev,
    );
  }, []);
  const goNextExpandedDay = useCallback(() => {
    setExpandedDay((prev) =>
      prev ? toISODateLocal(addDays(parseDateLocal(prev), 1)) : prev,
    );
  }, []);

  /** "New" toolbar button — quick-add starting from the next half hour; expanded-day double-click
   * still lets you pick an exact slot. */
  const openNewEngagement = useCallback(() => {
    const now = new Date();
    const minutes = now.getMinutes();
    const roundedUp = minutes < 30 ? 30 : 60;
    const start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      roundedUp === 60 ? 0 : roundedUp,
    );
    if (roundedUp === 60) start.setHours(start.getHours() + 1);
    openCreateEngagement(start, new Date(start.getTime() + 30 * 60_000));
  }, [openCreateEngagement]);

  const candidateMap = useMemo(() => {
    const map: Record<string, Candidate> = {};
    candidates.forEach((c) => {
      map[c.id] = c;
    });
    return map;
  }, [candidates]);

  const [preview, setPreview] = useState<{
    interview: Interview;
    anchorRect?: DOMRect | null;
  } | null>(null);

  const openInterviewPreview = useCallback(
    (interview: Interview, anchorRect?: DOMRect) => {
      setPreview({ interview, anchorRect: anchorRect || null });
    },
    [],
  );

  const goToFullInterview = useCallback(() => {
    if (!preview) return;
    const id = preview.interview.id;
    setPreview(null);
    router.push(`/interviews?id=${id}`);
  }, [preview, router]);

  // Auto-dismiss floating popover on any scroll or window resize
  useEffect(() => {
    if (!preview) return;
    const dismiss = () => setPreview(null);
    window.addEventListener("scroll", dismiss, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", dismiss, { passive: true });
    return () => {
      window.removeEventListener("scroll", dismiss, { capture: true });
      window.removeEventListener("resize", dismiss);
    };
  }, [preview]);

  const popoverStyle = useMemo((): React.CSSProperties => {
    if (!preview?.anchorRect || typeof window === "undefined") {
      return {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "360px",
      };
    }
    const rect = preview.anchorRect;
    const width = 360;
    const height = 410;
    const gap = 10;

    let left = rect.right + gap;
    if (left + width > window.innerWidth - 16) {
      left = rect.left - width - gap;
    }
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));

    let top = rect.top;
    if (top + height > window.innerHeight - 16) {
      top = window.innerHeight - height - 16;
    }
    top = Math.max(12, top);

    return {
      position: "fixed",
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
    };
  }, [preview?.anchorRect]);

  const openDayModal = useCallback(
    (date: string) => {
      setBusyReason("");
      setBusyError(null);
      setBusyDeptId(departmentId ?? null);
      setDayModal({ date });
    },
    [departmentId],
  );

  const closeDayModal = useCallback(() => {
    setDayModal(null);
    setBusyReason("");
    setBusyError(null);
    setBusyDeptId(null);
  }, []);

  const handleMarkBusy = useCallback(
    async (date: string) => {
      setBusyLoading(true);
      setBusyError(null);
      try {
        const created = await busyDaysService.create({
          date,
          reason: busyReason.trim() || null,
          department_id: busyDeptId,
        });
        setBusyDays((prev) => [...prev, created]);
        setBusyReason("");
      } catch (err) {
        setBusyError(
          err instanceof Error ? err.message : "Failed to mark busy",
        );
      } finally {
        setBusyLoading(false);
      }
    },
    [busyReason, busyDeptId],
  );

  const handleRemoveBusy = useCallback(async (id: string) => {
    setBusyLoading(true);
    setBusyError(null);
    try {
      await busyDaysService.delete(id);
      setBusyDays((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      setBusyError(
        err instanceof Error ? err.message : "Failed to remove busy marker",
      );
    } finally {
      setBusyLoading(false);
    }
  }, []);

  if (loading) return <PageLoader />;
  if (error) {
    return <ErrorState message={error} onRetry={() => void fetchData()} />;
  }

  const dayBusyList = dayModal
    ? busyDays.filter((b) => b.date === dayModal.date)
    : [];
  // For superadmin: check if already marked for the currently-selected dept scope
  const myBusyDay = dayBusyList.find(
    (b) => b.user_id === currentUserId && b.department_id === busyDeptId,
  );

  return (
    <div className="mx-auto min-w-0 max-w-full space-y-6 sm:space-y-8">
      {/* <PageHeader
        title="Interview calendar"
        subtitle="Days follow each interview's scheduled date (same calendar cell as Date (EST) on the interviews page). Click a day to expand its full hourly agenda, including Engagements. The preview shows EST, PKT, and the selected timezone."
      /> */}

      {/* {canWriteEngagements && (
        <div className="flex items-center justify-end rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-white/[0.08] dark:bg-[#12141c]">
          <button
            type="button"
            onClick={openNewEngagement}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-400"
          >
            <Plus size={16} />
            New
          </button>
        </div>
      )} */}

      <div className="flex justify-center sm:justify-end">
        <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-white p-0.5 dark:border-white/[0.08] dark:bg-[#12141c]">
          {(["week", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setCalendarView(v)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                calendarView === v
                  ? "bg-indigo-500 text-white"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {calendarView === "week" ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 items-center justify-center gap-1 sm:justify-start sm:gap-2">
              <button
                type="button"
                onClick={goPrevWeek}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/[0.1] dark:bg-[#12141c] dark:text-slate-200 dark:hover:bg-white/[0.04]"
                aria-label="Previous week"
              >
                <ChevronLeft size={18} />
              </button>
              <h2 className="min-w-0 flex-1 text-center text-base font-semibold text-slate-900 sm:min-w-[12rem] sm:flex-none sm:text-lg dark:text-white">
                {formatWeekRangeLabel(weekStart, weekEnd)}
              </h2>
              <button
                type="button"
                onClick={goNextWeek}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 dark:border-white/[0.1] dark:bg-[#12141c] dark:text-slate-200 dark:hover:bg-white/[0.04]"
                aria-label="Next week"
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <button
                type="button"
                onClick={goTodayWeek}
                className="inline-flex flex-1 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200 dark:hover:bg-indigo-500/20 sm:flex-none"
              >
                Today
              </button>
              <WeeklyProgressButton interviews={interviews} />
              <div className="relative flex-1 sm:flex-none">
                <select
                  value={tz}
                  onChange={(e) => setTz(e.target.value)}
                  aria-label="Timezone"
                  className="w-full appearance-none rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-8 text-sm font-medium text-slate-700 shadow-sm outline-none transition-colors hover:bg-slate-50 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 dark:border-white/[0.1] dark:bg-[#12141c] dark:text-slate-200 dark:hover:bg-white/[0.04]"
                >
                  {TIMEZONE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                />
              </div>
            </div>
          </div>
          <p className="text-center text-[11px] text-slate-500 dark:text-slate-400 sm:text-left">
            {canWriteEngagements ? "Double-click an empty slot to schedule a meeting. " : ""}
            Times shown in {TIMEZONE_OPTIONS.find((o) => o.value === tz)?.label ?? tz}.
          </p>
          <TimeGridCalendar
            view="week"
            cursorDate={weekCursor}
            tz={tz}
            interviews={interviews}
            engagements={monthEngagements}
            busyDays={busyDays}
            candidateMap={candidateMap}
            currentUserId={currentUserId ?? undefined}
            onSelectInterview={openInterviewPreview}
            onSelectEngagement={openEditEngagement}
            onCreateSlot={canWriteEngagements ? openCreateEngagement : undefined}
            onDayHeaderClick={canMarkBusy ? openDayModal : undefined}
          />
        </div>
      ) : (
        <InterviewsCalendar
          interviews={interviews}
          onSelectInterview={openInterviewPreview}
          busyDays={busyDays}
          currentUserId={currentUserId ?? undefined}
          onDayClick={canMarkBusy ? openDayModal : undefined}
          onBusyBarClick={openDayModal}
          onExpandDay={setExpandedDay}
          onVisibleRangeChange={handleVisibleRangeChange}
          engagements={monthEngagements}
          tz={tz}
          onTzChange={setTz}
          candidateMap={candidateMap}
        />
      )}

      {/* Expanded day — full hourly agenda (Engagements + Interviews), replaces the old Day/Week toolbar */}
      <Modal
        open={!!expandedDay}
        onClose={() => setExpandedDay(null)}
        title={expandedDay ? formatDayTitle(expandedDay) : ""}
        size="xl"
      >
        {expandedDay && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={goPrevExpandedDay}
                  aria-label="Previous day"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06]"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={goNextExpandedDay}
                  aria-label="Next day"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.06]"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {canWriteEngagements
                  ? "Double-click an empty slot to schedule a meeting. "
                  : ""}
                Times shown in{" "}
                {TIMEZONE_OPTIONS.find((o) => o.value === tz)?.label ?? tz}.
              </span>
            </div>
            <TimeGridCalendar
              view="day"
              cursorDate={parseDateLocal(expandedDay)}
              tz={tz}
              interviews={interviews}
              engagements={dayEngagements}
              busyDays={busyDays}
              candidateMap={candidateMap}
              currentUserId={currentUserId ?? undefined}
              onSelectInterview={openInterviewPreview}
              onSelectEngagement={openEditEngagement}
              onCreateSlot={
                canWriteEngagements ? openCreateEngagement : undefined
              }
              onDayHeaderClick={openDayModal}
            />
          </div>
        )}
      </Modal>

      {/* ── Interview Floating Quick Peek Popover (Teams / Outlook Style) ── */}
      {preview && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          {/* Invisible transparent click-away overlay (NO blur / grey overlay on calendar!) */}
          <div
            className="fixed inset-0 pointer-events-auto bg-transparent"
            onClick={() => setPreview(null)}
          />

          {/* Floating Popover anchored directly to the event */}
          <div
            style={popoverStyle}
            className="pointer-events-auto z-50 flex flex-col rounded-xl border border-slate-200/90 bg-white shadow-2xl dark:border-white/10 dark:bg-[#161926] text-slate-900 dark:text-white animate-in fade-in zoom-in-95 duration-150 overflow-hidden"
          >
            {/* Top Accent Stripe */}
            <div className="h-1 w-full bg-[#4f52b2] dark:bg-indigo-500 shrink-0" />

            <div className="p-4 space-y-3.5">
              {/* Header: Title + Round + Pop-out button */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-tight truncate">
                    {preview.interview.round || "Interview"} -{" "}
                    {preview.interview.company_name || "Company"}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {preview.interview.role}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={goToFullInterview}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors"
                    title="Open full details (↗)"
                  >
                    <ExternalLink size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors"
                    title="Close"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Action Ribbon */}
              {preview.interview.computed_status === "Upcoming" ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {preview.interview.interview_link ? (
                    <a
                      href={preview.interview.interview_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded bg-[#4f52b2] hover:bg-[#43469e] dark:bg-indigo-600 dark:hover:bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all"
                    >
                      <Video size={13} />
                      <span>Join</span>
                      <ChevronDown size={11} className="opacity-70" />
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded border border-dashed border-slate-200 dark:border-white/10 px-2.5 py-1 text-[11px] text-slate-400">
                      <Video size={12} />
                      <span>No link</span>
                    </span>
                  )}

                  {preview.interview.interview_link && (
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyLink(preview.interview.interview_link!)
                      }
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
                      title="Copy meeting link"
                    >
                      {copiedLink ? (
                        <Check size={12} className="text-emerald-500" />
                      ) : (
                        <Copy size={12} />
                      )}
                      <span>{copiedLink ? "Copied" : "Copy link"}</span>
                    </button>
                  )}

                  {(preview.interview.interview_doc_url ||
                    preview.interview.resume_url) && (
                    <a
                      href={
                        preview.interview.interview_doc_url ||
                        preview.interview.resume_url ||
                        "#"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
                    >
                      <FileText size={12} className="text-indigo-500" />
                      <span>Doc</span>
                    </a>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={goToFullInterview}
                    className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
                  >
                    <MessageSquare size={13} className="text-indigo-500" />
                    <span>Lead Thread</span>
                  </button>

                  {(preview.interview.interview_doc_url ||
                    preview.interview.resume_url) && (
                    <a
                      href={
                        preview.interview.interview_doc_url ||
                        preview.interview.resume_url ||
                        "#"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
                    >
                      <FileText size={12} className="text-indigo-500" />
                      <span>Doc</span>
                    </a>
                  )}

                  {preview.interview.interview_link && (
                    <button
                      type="button"
                      onClick={() =>
                        handleCopyLink(preview.interview.interview_link!)
                      }
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors"
                      title="Copy meeting link"
                    >
                      {copiedLink ? (
                        <Check size={12} className="text-emerald-500" />
                      ) : (
                        <Copy size={12} />
                      )}
                      <span>{copiedLink ? "Copied" : "Copy link"}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Clean Row Items (Matching Teams / Outlook screenshot) */}
              <div className="space-y-2.5 pt-1 text-xs border-t border-slate-100 dark:border-white/[0.06]">
                {/* 🕒 Time */}
                <div className="flex items-start gap-2.5 text-slate-700 dark:text-slate-300">
                  <Clock size={14} className="text-slate-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white">
                      {formatInterviewDateEst(
                        preview.interview.interview_date,
                        preview.interview.time_est,
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {preview.interview.time_est
                        ? `${formatTime(preview.interview.time_est)} EST`
                        : "Time TBD"}
                      {preview.interview.time_pkt
                        ? ` • ${formatTime(preview.interview.time_pkt)} PKT`
                        : ""}
                    </p>
                  </div>
                </div>

                {/* 📍 Location / Video */}
                <div className="flex items-start gap-2.5 text-slate-700 dark:text-slate-300">
                  <MapPin
                    size={14}
                    className="text-slate-400 mt-0.5 shrink-0"
                  />
                  <p className="text-slate-600 dark:text-slate-400 truncate">
                    {preview.interview.interview_link
                      ? "Virtual Online Video Meeting"
                      : "No location added"}
                  </p>
                </div>

                {/* 👤 Candidate */}
                <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[9px] font-bold text-white uppercase">
                    {preview.interview.candidate_name
                      ? preview.interview.candidate_name
                          .split(" ")
                          .map((n: string) => n[0])
                          .slice(0, 2)
                          .join("")
                      : "C"}
                  </div>
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-medium text-slate-900 dark:text-white">
                      {preview.interview.candidate_name || "Candidate"}
                    </span>
                    {preview.interview.resume_profile_name && (
                      <span className="text-slate-400 text-[11px]">
                        {" "}
                        ({preview.interview.resume_profile_name})
                      </span>
                    )}
                  </div>
                </div>

                {/* 🏢 Compensation & Role */}
                {preview.interview.salary_range && (
                  <div className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300">
                    <DollarSign
                      size={14}
                      className="text-emerald-500 shrink-0"
                    />
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                      {preview.interview.salary_range}
                    </span>
                  </div>
                )}

                {/* 📝 Remarks, Agenda & Notes (Teams-style) */}
                <div className="flex items-start gap-2.5 text-slate-700 dark:text-slate-300 pt-0.5">
                  <AlignLeft
                    size={14}
                    className="text-slate-400 mt-0.5 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">
                      {preview.interview.computed_status === "Upcoming"
                        ? "Preparation Brief & Notes"
                        : "Interview Remarks & Outcome"}
                    </p>
                    <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {preview.interview.feedback ||
                        preview.interview.recruiter_feedback ||
                        "Interview completed. Candidate attended the technical evaluation."}
                    </p>
                  </div>
                </div>
              </div>

              {/* Bottom Footer Actions (Teams-style View Recap + Status) */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-white/[0.06]">
                {preview.interview.computed_status !== "Upcoming" ? (
                  <button
                    type="button"
                    onClick={goToFullInterview}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] px-2.5 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-sm transition-colors"
                  >
                    <History size={13} className="text-slate-500" />
                    <span>View recap</span>
                  </button>
                ) : (
                  <StatusBadge status={preview.interview.computed_status} />
                )}

                <div className="flex items-center gap-1.5">
                  {preview.interview.computed_status !== "Upcoming" && (
                    <StatusBadge status={preview.interview.computed_status} />
                  )}
                  <button
                    type="button"
                    onClick={() => setPreview(null)}
                    className="px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] rounded transition-colors"
                  >
                    Close
                  </button>
                  {preview.interview.computed_status === "Upcoming" && (
                    <button
                      type="button"
                      onClick={goToFullInterview}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded transition-colors shadow-sm"
                    >
                      <span>Full details</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Busy day modal — readable by all roles, writable by superadmin & team-member */}
      <Modal
        open={!!dayModal}
        onClose={closeDayModal}
        title={dayModal ? formatDayTitle(dayModal.date) : ""}
        size="sm"
      >
        {dayModal && (
          <div className="space-y-5">
            {/* ── Who is busy ── */}
            {dayBusyList.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {dayBusyList.length === 1
                    ? "1 person is busy"
                    : `${dayBusyList.length} people are busy`}
                </p>
                <ul className="mt-2 space-y-2">
                  {dayBusyList.map((bd) => {
                    const isOwn = bd.user_id === currentUserId;
                    const canRemove = canMarkBusy && (isSuperadmin || isOwn);
                    return (
                      <li
                        key={bd.id}
                        className="rounded-lg border border-red-100 bg-red-50/60 px-3 py-2.5 dark:border-red-500/20 dark:bg-red-500/[0.07]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                {isOwn ? "You" : bd.user_name}
                              </p>
                              {bd.department_id ? (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                                  {departments.find(
                                    (d) => d.id === bd.department_id,
                                  )?.name ?? "Dept"}
                                </span>
                              ) : (
                                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400">
                                  All depts
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
                              {bd.reason ? (
                                <>&ldquo;{bd.reason}&rdquo;</>
                              ) : (
                                <span className="italic text-slate-400 dark:text-slate-500">
                                  No reason given
                                </span>
                              )}
                            </p>
                          </div>
                          {canRemove && (
                            <button
                              type="button"
                              disabled={busyLoading}
                              onClick={() => void handleRemoveBusy(bd.id)}
                              className="shrink-0 text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
                            >
                              {busyLoading ? "…" : "Remove"}
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              !canMarkBusy && (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No one has marked this day as busy.
                </p>
              )
            )}

            {/* ── Mark as busy (superadmin / team-member only, and only if not already marked) ── */}
            {canMarkBusy && !myBusyDay && (
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Your availability
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  You are available on this day.
                </p>

                {/* Department selector — superadmin only */}
                {isSuperadmin && departments.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Department scope
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setBusyDeptId(null)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          busyDeptId === null
                            ? "bg-slate-700 text-white border-slate-700 dark:bg-white/20 dark:border-white/20"
                            : "bg-transparent text-slate-500 dark:text-slate-400 border-slate-300 dark:border-white/20 hover:border-slate-500 hover:text-slate-700 dark:hover:text-slate-200"
                        }`}
                      >
                        All departments
                      </button>
                      {departments.map((d) => (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setBusyDeptId(d.id)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                            busyDeptId === d.id
                              ? "bg-teal-500 text-white border-teal-500"
                              : "bg-transparent text-slate-500 dark:text-slate-400 border-slate-300 dark:border-white/20 hover:border-teal-400 hover:text-teal-500"
                          }`}
                        >
                          {d.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <input
                  type="text"
                  placeholder="Reason (optional)"
                  value={busyReason}
                  onChange={(e) => setBusyReason(e.target.value)}
                  maxLength={255}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition-all focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-white dark:placeholder-slate-500"
                />
                <button
                  type="button"
                  disabled={busyLoading}
                  onClick={() => void handleMarkBusy(dayModal.date)}
                  className={`${buttonPrimary} w-full justify-center disabled:opacity-50`}
                >
                  {busyLoading ? "Saving…" : "Mark day as busy"}
                </button>
              </div>
            )}

            {busyError && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {busyError}
              </p>
            )}

            <div className="flex justify-end border-t border-slate-100 pt-3 dark:border-white/[0.06]">
              <button
                type="button"
                onClick={closeDayModal}
                className={buttonSecondary}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      <EngagementModal
        open={!!engagementModal}
        onClose={closeEngagementModal}
        engagement={engagementModal?.engagement ?? null}
        initialRange={engagementModal?.initialRange ?? null}
        tz={tz}
        candidates={candidates}
        companies={companies}
        businessDevelopers={businessDevelopers}
        departments={departments}
        currentUserId={currentUserId}
        isSuperadmin={isSuperadmin}
        defaultDepartmentId={departmentId}
        existingEngagements={dayEngagements}
        existingInterviews={interviews}
        onCreated={refreshEngagements}
        onUpdated={refreshEngagements}
        onDeleted={refreshEngagements}
      />
    </div>
  );
}
