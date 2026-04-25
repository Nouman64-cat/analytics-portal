"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { interviewsService, busyDaysService } from "@/lib/services";
import type { Interview, BusyDay } from "@/lib/types";
import {
  formatInterviewDateEst,
  formatTime,
  truncate,
} from "@/lib/utils";
import { getUserRole, getUserId } from "@/lib/auth";
import InterviewsCalendar from "@/components/InterviewsCalendar";
import Modal, { buttonPrimary, buttonSecondary } from "@/components/Modal";
import StatusBadge from "@/components/StatusBadge";
import {
  PageLoader,
  ErrorState,
  PageHeader,
} from "@/components/PageStates";

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
      <div className="mt-0.5 text-sm text-slate-900 dark:text-white">{children}</div>
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

const CAN_MARK_BUSY_ROLES = new Set(["superadmin", "team-member"]);

export default function CalendarPage() {
  const router = useRouter();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [busyDays, setBusyDays] = useState<BusyDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [preview, setPreview] = useState<Interview | null>(null);

  // Busy day modal state
  const [dayModal, setDayModal] = useState<{ date: string } | null>(null);
  const [busyReason, setBusyReason] = useState("");
  const [busyLoading, setBusyLoading] = useState(false);
  const [busyError, setBusyError] = useState<string | null>(null);

  const role = getUserRole();
  const currentUserId = getUserId();
  const canMarkBusy = role !== null && CAN_MARK_BUSY_ROLES.has(role);
  const isSuperadmin = role === "superadmin";

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [interviewData, busyData] = await Promise.all([
        interviewsService.list(),
        busyDaysService.list(),
      ]);
      setInterviews(interviewData);
      setBusyDays(busyData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load calendar data",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openInterviewPreview = useCallback((interview: Interview) => {
    setPreview(interview);
  }, []);

  const goToFullInterview = useCallback(() => {
    if (!preview) return;
    const id = preview.id;
    setPreview(null);
    router.push(`/interviews?id=${id}`);
  }, [preview, router]);

  const openDayModal = useCallback((date: string) => {
    setBusyReason("");
    setBusyError(null);
    setDayModal({ date });
  }, []);

  const closeDayModal = useCallback(() => {
    setDayModal(null);
    setBusyReason("");
    setBusyError(null);
  }, []);

  const handleMarkBusy = useCallback(async (date: string) => {
    setBusyLoading(true);
    setBusyError(null);
    try {
      const created = await busyDaysService.create({
        date,
        reason: busyReason.trim() || null,
      });
      setBusyDays((prev) => [...prev, created]);
      setBusyReason("");
    } catch (err) {
      setBusyError(err instanceof Error ? err.message : "Failed to mark busy");
    } finally {
      setBusyLoading(false);
    }
  }, [busyReason]);

  const handleRemoveBusy = useCallback(async (id: string) => {
    setBusyLoading(true);
    setBusyError(null);
    try {
      await busyDaysService.delete(id);
      setBusyDays((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      setBusyError(err instanceof Error ? err.message : "Failed to remove busy marker");
    } finally {
      setBusyLoading(false);
    }
  }, []);

  if (loading) return <PageLoader />;
  if (error) {
    return (
      <ErrorState message={error} onRetry={() => void fetchData()} />
    );
  }

  const dayBusyList = dayModal
    ? busyDays.filter((b) => b.date === dayModal.date)
    : [];
  const myBusyDay = dayBusyList.find((b) => b.user_id === currentUserId);

  return (
    <div className="mx-auto min-w-0 max-w-full space-y-6 sm:space-y-8">
      <PageHeader
        title="Interview calendar"
        subtitle="Days follow each interview's scheduled date (same calendar cell as Date (EST) on the interviews page). Times on the grid use Eastern Time (EST/ET). The preview shows both EST and PKT clock times."
      />
      <InterviewsCalendar
        interviews={interviews}
        onSelectInterview={openInterviewPreview}
        busyDays={busyDays}
        currentUserId={currentUserId ?? undefined}
        onDayClick={canMarkBusy ? openDayModal : undefined}
        onBusyBarClick={openDayModal}
      />

      {/* Interview preview modal */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview ? preview.company_name || "Interview" : "Interview"}
        size="sm"
      >
        {preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={preview.computed_status} />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {preview.round}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PreviewField label="Candidate">{preview.candidate_name || "—"}</PreviewField>
              <PreviewField label="Role">{preview.role}</PreviewField>
              <PreviewField label="Profile">
                {preview.resume_profile_name || "—"}
              </PreviewField>
              <PreviewField label="Business developer">
                {preview.bd_name || "—"}
              </PreviewField>
              <PreviewField label="Date (EST)">
                {formatInterviewDateEst(
                  preview.interview_date,
                  preview.time_est,
                )}
              </PreviewField>
              <PreviewField label="Time (EST / PKT)">
                {preview.time_est || preview.time_pkt ? (
                  <>
                    {formatTime(preview.time_est)}
                    <span className="text-slate-400"> · </span>
                    {formatTime(preview.time_pkt)}
                  </>
                ) : (
                  "—"
                )}
              </PreviewField>
            </div>
            {preview.salary_range ? (
              <PreviewField label="Salary range">
                {preview.salary_range}
              </PreviewField>
            ) : null}
            {preview.interview_link ? (
              <PreviewField label="Meeting link">
                <a
                  href={preview.interview_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 underline decoration-indigo-600/40 underline-offset-2 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
                >
                  {truncate(preview.interview_link, 48)}
                </a>
              </PreviewField>
            ) : null}
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 dark:border-white/[0.06] sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className={`${buttonSecondary} w-full justify-center sm:w-auto`}
              >
                Close
              </button>
              <button
                type="button"
                onClick={goToFullInterview}
                className={`${buttonPrimary} w-full justify-center sm:w-auto`}
              >
                <ExternalLink size={16} aria-hidden />
                Full details
              </button>
            </div>
          </div>
        )}
      </Modal>

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
                  {dayBusyList.length === 1 ? "1 person is busy" : `${dayBusyList.length} people are busy`}
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
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {isOwn ? "You" : bd.user_name}
                            </p>
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
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Your availability
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  You are available on this day.
                </p>
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
              <p className="text-xs text-red-600 dark:text-red-400">{busyError}</p>
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
    </div>
  );
}
