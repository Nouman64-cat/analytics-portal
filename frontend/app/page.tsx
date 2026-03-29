"use client";

import { useEffect, useState } from "react";
import {
  CalendarCheck,
  Building2,
  Users,
  TrendingUp,
} from "lucide-react";
import { dashboardService } from "@/lib/services";
import { recordToChartData, formatDate } from "@/lib/utils";
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
    const lower = status.toLowerCase();
    let key = "Pending";
    if (lower.includes("converted")) key = "Converted";
    else if (lower.includes("rejected")) key = "Rejected";
    else if (lower.includes("closed")) key = "Closed";
    else if (lower === "no status") key = "Pending";
    else key = "Other";
    statusMap[key] = (statusMap[key] || 0) + count;
  });
  const statusData = recordToChartData(statusMap);

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
          value={`${Math.round(
            ((statusMap["Converted"] || 0) / stats.total_interviews) * 100
          )}%`}
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
            <PieChartWidget data={statusData} height={320} />
          </ChartCard>
        </div>
      </div>

      {/* Candidate distribution + Recent */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div>
          <ChartCard title="Interviews by Candidate">
            <BarChartWidget data={candidateData} color="#a78bfa" height={280} />
          </ChartCard>
        </div>
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-white/[0.06] bg-[#12141c] p-5">
            <h3 className="mb-4 text-sm font-semibold text-white">
              Recent Interviews
            </h3>
            <div className="space-y-3">
              {stats.recent_interviews.map((interview) => (
                <div
                  key={interview.id}
                  className="flex items-center gap-4 rounded-xl bg-white/[0.02] p-3.5 transition-colors hover:bg-white/[0.04]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-xs font-bold text-indigo-300">
                    {interview.company?.[0] || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {interview.company} — {interview.role}
                    </p>
                    <p className="text-xs text-slate-500">
                      {interview.candidate} · Round {interview.round} ·{" "}
                      {formatDate(interview.date)}
                    </p>
                  </div>
                  <StatusBadge status={interview.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
