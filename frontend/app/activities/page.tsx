"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, History } from "lucide-react";

import { activitiesService } from "@/lib/services";
import type { ActivityLog } from "@/lib/types";
import { PageLoader, ErrorState, EmptyState, PageHeader } from "@/components/PageStates";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

function formatActivityTime(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ActivitiesPage() {
  const [items, setItems] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const limit = DEFAULT_PAGE_SIZE;
  const offset = (page - 1) * limit;

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / limit)), [total, limit]);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await activitiesService.list({ limit, offset });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load activities");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivities();
  }, [page]);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchActivities} />;

  return (
    <div className="space-y-6 animate-fade-in">
      <PageHeader
        title="Activities"
        subtitle="Read-only audit feed of portal actions"
      />

      {items.length === 0 ? (
        <EmptyState message="No activities yet" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c]">
          <div className="divide-y divide-slate-200 dark:divide-white/[0.06]">
            {items.map((activity) => (
              <div key={activity.id} className="px-5 py-4 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                    <History size={15} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-900 dark:text-white">
                      {activity.message}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      By <span className="font-medium">{activity.actor_email}</span> · {formatActivityTime(activity.created_at)}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                      {activity.entity_type} · {activity.action}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-200 dark:border-white/[0.06] px-4 py-3 sm:px-6">
              <p className="text-sm text-slate-700 dark:text-slate-400">
                Showing{" "}
                <span className="font-medium">{offset + 1}</span> to{" "}
                <span className="font-medium">{Math.min(offset + items.length, total)}</span> of{" "}
                <span className="font-medium">{total}</span>
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/[0.1] px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 disabled:opacity-50"
                >
                  <ChevronLeft size={14} />
                  Prev
                </button>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 dark:border-white/[0.1] px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 disabled:opacity-50"
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

