"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { interviewsService } from "@/lib/services";
import type { Interview } from "@/lib/types";
import {
  formatInterviewDateEst,
  formatTime,
  truncate,
} from "@/lib/utils";
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

export default function CalendarPage() {
  const router = useRouter();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Interview | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await interviewsService.list();
      setInterviews(data);
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

  const openInterviewPreview = useCallback((interview: Interview) => {
    setPreview(interview);
  }, []);

  const goToFullInterview = useCallback(() => {
    if (!preview) return;
    const id = preview.id;
    setPreview(null);
    router.push(`/interviews?id=${id}`);
  }, [preview, router]);

  if (loading) return <PageLoader />;
  if (error) {
    return (
      <ErrorState message={error} onRetry={() => void fetchData()} />
    );
  }

  return (
    <div className="mx-auto min-w-0 max-w-full space-y-6 sm:space-y-8">
      <PageHeader
        title="Interview calendar"
        subtitle="Days follow each interview’s scheduled date (same calendar cell as Date (EST) on the interviews page). Times on the grid use Eastern Time (EST/ET). The preview shows both EST and PKT clock times."
      />
      <InterviewsCalendar
        interviews={interviews}
        onSelectInterview={openInterviewPreview}
      />

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
    </div>
  );
}
