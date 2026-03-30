"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  Building2,
  Users,
  TrendingUp,
} from "lucide-react";
import { dashboardService } from "@/lib/services";
import { recordToChartData, formatDate, formatTime } from "@/lib/utils";
import type { DashboardStats } from "@/lib/types";
import StatsCard, { StatsGrid } from "@/components/StatsCard";
import { ChartCard, BarChartWidget, PieChartWidget } from "@/components/Charts";
import StatusBadge from "@/components/StatusBadge";
import { PageLoader, ErrorState, PageHeader } from "@/components/PageStates";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await dashboardService.getStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchStats} />;
  if (!stats) return null;

  const companyData = recordToChartData(stats.interviews_by_company).slice(0, 12);
  const candidateData = recordToChartData(stats.interviews_by_candidate);

  // Normalize statuses for the pie chart
  const statusMap: Record<string, number> = {};
  Object.entries(stats.interviews_by_status).forEach(([status, count]) => {
    const lower = status.trim().toLowerCase();
    let key = "Other";
    if (lower.includes("converted")) key = "Converted";
    else if (lower.includes("rejected")) key = "Rejected";
    else if (lower.includes("dropped")) key = "Dropped";
    else if (lower.includes("closed")) key = "Closed";
    else if (lower === "upcoming") key = "Upcoming";
    else if (lower === "unresponsed" || lower === "no status" || lower === "") key = "Unresponsed";
    else key = "Other";
    statusMap[key] = (statusMap[key] || 0) + count;
  });
  const statusData = recordToChartData(statusMap);

  const totalResolved = (statusMap["Converted"] || 0) + (statusMap["Rejected"] || 0) + (statusMap["Dropped"] || 0) + (statusMap["Closed"] || 0);
  const globalConversionRate = totalResolved > 0 
    ? Math.round(((statusMap["Converted"] || 0) / totalResolved) * 100) 
    : 0;

  const STATUS_HEX_COLORS: Record<string, string> = {
    "Converted": "#10b981", // emerald-500
    "Rejected": "#ef4444",  // red-500
    "Dropped": "#f59e0b",   // amber-500
    "Closed": "#64748b",    // slate-500
    "Upcoming": "#3b82f6",  // blue-500
    "Unresponsed": "#94a3b8", // slate-400
    "Other": "#8b5cf6",     // violet-500
  };

  return (
    <div className="space-y-8 animate-fade-in">
      <PageHeader
        title="Dashboard"
        subtitle="Overview of your interview pipeline"
      />

      {/* Stats Cards */}
      <StatsGrid>
        <StatsCard
          title="Total Interviews"
          value={stats.total_interviews}
          icon={CalendarCheck}
          gradient="bg-gradient-to-br from-indigo-500 to-purple-600"
        />
        <StatsCard
          title="Companies"
          value={stats.total_companies}
          icon={Building2}
          gradient="bg-gradient-to-br from-cyan-500 to-blue-600"
        />
        <StatsCard
          title="Candidates"
          value={stats.total_candidates}
          icon={Users}
          gradient="bg-gradient-to-br from-emerald-500 to-teal-600"
        />
        <StatsCard
          title="Conversion Rate"
          value={`${globalConversionRate}%`}
          icon={TrendingUp}
          gradient="bg-gradient-to-br from-amber-500 to-orange-600"
        />
      </StatsGrid>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard
            title="Interviews by Company"
            subtitle={`Top ${companyData.length} companies`}
          >
            <BarChartWidget data={companyData} color="#818cf8" height={320} />
          </ChartCard>
        </div>
        <div>
          <ChartCard title="Status Distribution" subtitle="All interviews">
            <PieChartWidget data={statusData} height={320} colorMapping={STATUS_HEX_COLORS} />
          </ChartCard>
        </div>
      </div>

      {/* Candidate distribution + Recent */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div>
          <div className="space-y-6">
            <ChartCard title="Interviews by Candidate">
              <BarChartWidget data={candidateData} color="#a78bfa" height={220} />
            </ChartCard>
            
            <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-5">
              <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
                Candidate Conversion
              </h3>
              <div className="space-y-4">
                {Object.entries(stats.candidate_metrics || {}).map(([name, metrics]) => (
                  <div key={name}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{name}</span>
                      <span className="text-sm font-bold text-slate-900 dark:text-white">{metrics.rate}%</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-white/[0.04] rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-emerald-400 h-full rounded-full transition-all duration-1000" 
                        style={{ width: `${Math.max(1, metrics.rate)}%` }}
                      ></div>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {metrics.converted} out of {metrics.total_resolved} resolved (Total: {metrics.total})
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-5">
            <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
              Recent Interviews
            </h3>
            <div className="space-y-3">
              {stats.recent_interviews.map((interview) => (
                <Link
                  href={`/interviews?id=${interview.id}`}
                  key={interview.id}
                  className="flex items-center gap-4 rounded-xl bg-slate-100 dark:bg-white/[0.02] p-3.5 transition-colors hover:bg-slate-200 dark:hover:bg-white/[0.06] cursor-pointer"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-xs font-bold text-indigo-500 dark:text-indigo-400">
                    {interview.company?.[0] || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      {interview.company} — {interview.role}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-500">
                      {interview.candidate} · Round {interview.round} · {formatDate(interview.date)}
                    </p>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      {interview.time_est && (
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          EST {formatTime(interview.time_est)}
                        </span>
                      )}
                      {interview.time_est && interview.time_pkt && (
                        <span className="text-[11px] text-slate-300 dark:text-slate-600">·</span>
                      )}
                      {interview.time_pkt && (
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          PKT {formatTime(interview.time_pkt)}
                        </span>
                      )}
                      {interview.bd_name && (
                        <>
                          {(interview.time_est || interview.time_pkt) && (
                            <span className="text-[11px] text-slate-300 dark:text-slate-600">·</span>
                          )}
                          <span className="text-[11px] text-indigo-400 dark:text-indigo-400">
                            {interview.bd_name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <StatusBadge status={interview.status} dateStr={interview.date} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
