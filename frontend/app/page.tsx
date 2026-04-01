"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  Building2,
  Users,
  TrendingUp,
} from "lucide-react";
import { FaLinkedin, FaGithub } from "react-icons/fa";
import { dashboardService } from "@/lib/services";
import { recordToChartData, formatDate, formatTime } from "@/lib/utils";
import type { DashboardStats, RecentInterview } from "@/lib/types";
import StatsCard, { StatsGrid } from "@/components/StatsCard";
import { ChartCard, BarChartWidget, PieChartWidget } from "@/components/Charts";
import StatusBadge from "@/components/StatusBadge";
import { PageLoader, ErrorState, PageHeader } from "@/components/PageStates";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Company popover for recent interviews
  const [companyPopover, setCompanyPopover] = useState<{ interview: RecentInterview; x: number; y: number } | null>(null);
  const companyPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!companyPopover) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (companyPopoverRef.current && !companyPopoverRef.current.contains(e.target as Node)) {
        setCompanyPopover(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [companyPopover]);

  // Profile popover for recent interviews
  const [profilePopover, setProfilePopover] = useState<{ interview: RecentInterview; x: number; y: number } | null>(null);
  const profilePopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profilePopover) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (profilePopoverRef.current && !profilePopoverRef.current.contains(e.target as Node)) {
        setProfilePopover(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profilePopover]);

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
    else if (lower === "dead") key = "Dead";
    else key = "Other";
    statusMap[key] = (statusMap[key] || 0) + count;
  });
  const statusData = recordToChartData(statusMap);

  const totalResolved = (statusMap["Converted"] || 0) + (statusMap["Rejected"] || 0) + (statusMap["Dropped"] || 0) + (statusMap["Closed"] || 0);
  const globalConversionRate = totalResolved > 0 
    ? Math.round(((statusMap["Converted"] || 0) / totalResolved) * 100) 
    : 0;

  const STATUS_HEX_COLORS: Record<string, string> = {
    "Converted": "#f97316", // orange-500 — enthusiastic/energized
    "Rejected": "#ef4444",  // red-500
    "Dropped": "#f59e0b",   // amber-500
    "Closed": "#10b981",    // emerald-500 — success/job landed
    "Upcoming": "#3b82f6",  // blue-500
    "Unresponsed": "#94a3b8", // slate-400
    "Dead": "#78716c",      // stone-500 — warm grey, faded/inactive
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
              {stats.recent_interviews.slice(0, 5).map((interview) => (
                <div
                  key={interview.id}
                  className="flex items-center gap-4 rounded-xl bg-slate-100 dark:bg-white/[0.02] p-3.5 transition-colors hover:bg-slate-200 dark:hover:bg-white/[0.06]"
                >
                  <Link
                    href={`/interviews?id=${interview.id}`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 text-xs font-bold text-indigo-500 dark:text-indigo-400"
                  >
                    {interview.company?.[0] || "?"}
                  </Link>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                      <button
                        onClick={(e) => {
                          if (!interview.company_detail) return;
                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                          setProfilePopover(null);
                          setCompanyPopover({ interview, x: rect.left, y: rect.bottom + 6 });
                        }}
                        className={interview.company_detail ? "hover:underline cursor-pointer" : "cursor-default"}
                      >
                        {interview.company}
                      </button>
                      {" — "}{interview.role}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-500">
                      {interview.candidate} · Round {interview.round} · {formatDate(interview.date)}
                    </p>
                    {interview.resume_profile_name && (
                      <p className="text-xs mt-0.5">
                        <button
                          onClick={(e) => {
                            if (!interview.linkedin_url && !interview.github_url) return;
                            const rect = (e.target as HTMLElement).getBoundingClientRect();
                            setCompanyPopover(null);
                            setProfilePopover({ interview, x: rect.left, y: rect.bottom + 6 });
                          }}
                          className={
                            (interview.linkedin_url || interview.github_url)
                              ? "text-indigo-500 dark:text-indigo-400 hover:underline cursor-pointer"
                              : "text-slate-400 dark:text-slate-500 cursor-default"
                          }
                        >
                          {interview.resume_profile_name}
                        </button>
                      </p>
                    )}
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
                    <StatusBadge status={interview.computed_status} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Company detail popover */}
      {companyPopover && (
        <div
          ref={companyPopoverRef}
          style={{ position: "fixed", top: companyPopover.y, left: companyPopover.x, zIndex: 9999 }}
          className="w-72 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1a1d2a] shadow-2xl p-4"
        >
          <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
            {companyPopover.interview.company}
          </p>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
            {companyPopover.interview.company_detail}
          </p>
        </div>
      )}

      {/* Profile links popover */}
      {profilePopover && (
        <div
          ref={profilePopoverRef}
          style={{ position: "fixed", top: profilePopover.y, left: profilePopover.x, zIndex: 9999 }}
          className="w-72 rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#1a1d2a] shadow-2xl p-4"
        >
          <p className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
            {profilePopover.interview.resume_profile_name}
          </p>
          <div className="space-y-2">
            {profilePopover.interview.linkedin_url && (
              <a href={profilePopover.interview.linkedin_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 px-3 py-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors break-all">
                <FaLinkedin size={13} className="shrink-0" />
                LinkedIn Profile
              </a>
            )}
            {profilePopover.interview.github_url && (
              <a href={profilePopover.interview.github_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-white/[0.06] px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[0.10] transition-colors break-all">
                <FaGithub size={13} className="shrink-0" />
                GitHub Profile
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
