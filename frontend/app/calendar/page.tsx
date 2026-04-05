"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { interviewsService } from "@/lib/services";
import type { Interview } from "@/lib/types";
import InterviewsCalendar from "@/components/InterviewsCalendar";
import {
  PageLoader,
  ErrorState,
  PageHeader,
} from "@/components/PageStates";

export default function CalendarPage() {
  const router = useRouter();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const openInterview = useCallback(
    (interview: Interview) => {
      router.push(`/interviews?id=${interview.id}`);
    },
    [router],
  );

  if (loading) return <PageLoader />;
  if (error) {
    return (
      <ErrorState message={error} onRetry={() => void fetchData()} />
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Interview calendar"
        subtitle="Scheduled interviews by day. Click an entry to open details on the interviews page."
      />
      <InterviewsCalendar
        interviews={interviews}
        onSelectInterview={openInterview}
      />
    </div>
  );
}
