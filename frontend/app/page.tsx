"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  CalendarCheck,
  Building2,
  Users,
  TrendingUp,
  Eye,
  Target,
  CheckCircle2,
} from "lucide-react";
import { FaLinkedin, FaGithub } from "react-icons/fa";
import { dashboardService, profilesService } from "@/lib/services";
import { recordToChartData, formatDate, formatTime } from "@/lib/utils";
import type { DashboardStats, RecentInterview, ResumeProfile } from "@/lib/types";

/** Merge interview API fields with full resume profile (same source as interviews page). */
function mergeResumeProfileLinks(
  interview: RecentInterview,
  profiles: ResumeProfile[],
) {
  const p = profiles.find((x) => x.id === interview.resume_profile_id);
  return {
    linkedin_url: p?.linkedin_url ?? interview.linkedin_url ?? null,
    github_url: p?.github_url ?? interview.github_url ?? null,
    portfolio_url: p?.portfolio_url ?? interview.portfolio_url ?? null,
    resume_url: p?.resume_url ?? interview.resume_url ?? null,
  };
}
import StatsCard, { StatsGrid } from "@/components/StatsCard";
import { ChartCard, BarChartWidget, PieChartWidget } from "@/components/Charts";
import StatusBadge from "@/components/StatusBadge";
import { PageLoader, ErrorState, PageHeader } from "@/components/PageStates";

function toChronologicalChartData(record: Record<string, number>) {
  return Object.entries(record)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ({ name, value }));
}

function formatIsoWeekToWeekdayRange(isoWeekKey: string): string {
  const m = isoWeekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return isoWeekKey;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (!year || !week) return isoWeekKey;

  // ISO week start (Monday): Jan 4 is always in ISO week 1.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1..7 where Monday=1
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));

  const monday = new Date(mondayWeek1);
  monday.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);

  const label = (d: Date) =>
    d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  return `${label(monday)} - ${label(friday)}`;
}

function getRecentInterviewCardStyle(status: string | null | undefined): string {
  const s = (status || "").toLowerCase();
  if (s.includes("closed")) {
    return "border-emerald-200/80 dark:border-emerald-400/30 bg-gradient-to-r from-emerald-50 to-white dark:from-emerald-500/15 dark:to-[#141a24] hover:from-emerald-100/80 hover:to-white dark:hover:from-emerald-500/25 dark:hover:to-[#18202a]";
  }
  if (s.includes("converted")) {
    return "border-orange-200/80 dark:border-orange-400/30 bg-gradient-to-r from-orange-50 to-white dark:from-orange-500/15 dark:to-[#171822] hover:from-orange-100/80 hover:to-white dark:hover:from-orange-500/25 dark:hover:to-[#1b1b26]";
  }
  if (s.includes("rejected")) {
    return "border-red-200/80 dark:border-red-400/30 bg-gradient-to-r from-red-50 to-white dark:from-red-500/15 dark:to-[#1a1720] hover:from-red-100/80 hover:to-white dark:hover:from-red-500/25 dark:hover:to-[#221823]";
  }
  if (s.includes("dropped")) {
    return "border-amber-200/80 dark:border-amber-400/30 bg-gradient-to-r from-amber-50 to-white dark:from-amber-500/15 dark:to-[#1b1a20] hover:from-amber-100/80 hover:to-white dark:hover:from-amber-500/25 dark:hover:to-[#222025]";
  }
  if (s === "upcoming") {
    return "border-blue-200/80 dark:border-blue-400/30 bg-gradient-to-r from-blue-50 to-white dark:from-blue-500/15 dark:to-[#141a26] hover:from-blue-100/80 hover:to-white dark:hover:from-blue-500/25 dark:hover:to-[#182030]";
  }
  return "border-slate-200/80 dark:border-white/[0.08] bg-gradient-to-r from-white to-slate-50 dark:from-[#181c27] dark:to-[#131722] hover:border-indigo-200 dark:hover:border-indigo-400/30 hover:from-indigo-50/50 hover:to-white dark:hover:from-indigo-500/10 dark:hover:to-[#171b27]";
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [profiles, setProfiles] = useState<ResumeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [leadsFrequencyView, setLeadsFrequencyView] = useState<"weekly" | "monthly">("weekly");

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
      const [data, profs] = await Promise.all([
        dashboardService.getStats(),
        profilesService.list().catch(() => [] as ResumeProfile[]),
      ]);
      setStats(data);
      setProfiles(profs);
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

  const popoverProfileLinks = profilePopover
    ? mergeResumeProfileLinks(profilePopover.interview, profiles)
    : null;

  const candidateData = recordToChartData(stats.interviews_by_candidate);
  const leadsWeeklyData = toChronologicalChartData(stats.leads_frequency_weekly || {}).map((d) => ({
    ...d,
    name: formatIsoWeekToWeekdayRange(d.name),
  }));
  const leadsMonthlyData = toChronologicalChartData(stats.leads_frequency_monthly || {});
  const leadsChartData = leadsFrequencyView === "weekly" ? leadsWeeklyData : leadsMonthlyData;

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

  const totalConverted = (statusMap["Converted"] || 0) + (statusMap["Closed"] || 0);
  const totalResolved = totalConverted + (statusMap["Rejected"] || 0) + (statusMap["Dropped"] || 0);
  const globalConversionRate = totalResolved > 0 
    ? Math.round((totalConverted / totalResolved) * 100) 
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
      <StatsGrid cols={5}>
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
          title="Jobs Closed"
          value={stats.total_jobs_closed}
          icon={CheckCircle2}
          gradient="bg-gradient-to-br from-emerald-500 to-green-600"
        />
        <StatsCard
          title="Conversion Rate"
          value={`${globalConversionRate}%`}
          icon={TrendingUp}
          gradient="bg-gradient-to-br from-amber-500 to-orange-600"
        />
      </StatsGrid>

      {/* Status + Recent interviews */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-stretch">
        <ChartCard title="Status Distribution" subtitle="All interviews" className="h-full">
          <PieChartWidget data={statusData} height={360} colorMapping={STATUS_HEX_COLORS} />
        </ChartCard>
        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-5 h-full">
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
            Recent Interviews
          </h3>
          <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
            {stats.recent_interviews.slice(0, 5).map((interview) => {
              const pl = mergeResumeProfileLinks(interview, profiles);
              return (
              <div
                key={interview.id}
                className={`flex items-center gap-4 rounded-xl p-3.5 shadow-sm transition-all ${getRecentInterviewCardStyle(interview.computed_status)}`}
              >
                <Link
                  href={`/interviews?id=${interview.id}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/25 to-purple-500/25 text-xs font-bold text-indigo-600 dark:text-indigo-300 ring-1 ring-indigo-200/70 dark:ring-indigo-400/20"
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
                          if (
                            !pl.linkedin_url &&
                            !pl.github_url &&
                            !pl.portfolio_url &&
                            !pl.resume_url
                          )
                            return;
                          const rect = (e.target as HTMLElement).getBoundingClientRect();
                          setCompanyPopover(null);
                          setProfilePopover({ interview, x: rect.left, y: rect.bottom + 6 });
                        }}
                        className={
                          (pl.linkedin_url ||
                            pl.github_url ||
                            pl.portfolio_url ||
                            pl.resume_url)
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
              );
            })}
          </div>
        </div>
      </div>

      {/* Lead frequency */}
      <div className="grid grid-cols-1">
        <ChartCard
          title="Leads Frequency"
          subtitle={
            leadsFrequencyView === "weekly"
              ? "Leads grouped by Monday-Friday range"
              : "Leads grouped by month"
          }
        >
          <div className="mb-3 flex justify-end">
            <select
              value={leadsFrequencyView}
              onChange={(e) =>
                setLeadsFrequencyView(e.target.value as "weekly" | "monthly")
              }
              className="rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#12141c] px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 outline-none transition-all hover:border-slate-300 dark:hover:border-white/[0.12] focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
            >
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <BarChartWidget
            data={leadsChartData}
            color={leadsFrequencyView === "weekly" ? "#22c55e" : "#0ea5e9"}
            height={300}
          />
        </ChartCard>
      </div>

      {/* Candidate charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-stretch">
        <ChartCard title="Interviews by Candidate" className="h-full">
          <BarChartWidget data={candidateData} color="#a78bfa" height={360} />
        </ChartCard>

        <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-5 h-full">
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">
            Candidate Conversion
          </h3>
          <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
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
            {popoverProfileLinks?.linkedin_url && (
              <a href={popoverProfileLinks.linkedin_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-500/10 px-3 py-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors break-all">
                <FaLinkedin size={13} className="shrink-0" />
                LinkedIn Profile
              </a>
            )}
            {popoverProfileLinks?.github_url && (
              <a href={popoverProfileLinks.github_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-white/[0.06] px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[0.10] transition-colors break-all">
                <FaGithub size={13} className="shrink-0" />
                GitHub Profile
              </a>
            )}
            {popoverProfileLinks?.portfolio_url && (
              <a href={popoverProfileLinks.portfolio_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-fuchsia-50 dark:bg-fuchsia-500/10 px-3 py-2 text-xs text-fuchsia-600 dark:text-fuchsia-300 hover:bg-fuchsia-100 dark:hover:bg-fuchsia-500/20 transition-colors break-all">
                <Target size={13} className="shrink-0" />
                Portfolio
              </a>
            )}
            {popoverProfileLinks?.resume_url && (
              <a href={popoverProfileLinks.resume_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors break-all">
                <Eye size={13} className="shrink-0" />
                Resume (PDF)
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
