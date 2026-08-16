"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowLeft,
  TrendingUp,
  Target,
  Users,
  Award,
  AlertTriangle,
  Activity,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  AreaChart,
  Area,
  ResponsiveContainer,
} from "recharts";
import { candidatesService, leadsService, interviewsService } from "@/lib/services";
import { PageLoader, ErrorState } from "@/components/PageStates";
import { getUserRole } from "@/lib/auth";
import CandidateAvatar from "@/components/CandidateAvatar";
import { useDepartmentContext } from "@/lib/DepartmentContext";
import type { Candidate, LeadListItem, Interview } from "@/lib/types";
import { format, parseISO, startOfMonth } from "date-fns";

// ─── Tooltip Styles ─────────────────────────────────────────
const TOOLTIP_STYLE = {
  backgroundColor: "#1a1d2e",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: "12px",
  color: "#fff",
  fontSize: "12px",
  boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
} as const;

const BAR_CURSOR_STYLE = { fill: "rgba(100,100,120,0.08)" } as const;

// ─── Color Palette ───────────────────────────────────────────
const OUTCOME_COLORS: Record<string, string> = {
  closed: "#10b981",
  progressed: "#8b5cf6",
  rejected: "#ef4444",
  unresponsive: "#f59e0b",
  dropped: "#3b82f6",
};

function pct(count: number, denom: number): number {
  return denom > 0 ? Math.round((count / denom) * 1000) / 10 : 0;
}

// ─── Stat Card ───────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon: React.ReactNode;
}

function StatCard({ label, value, sub, color, icon }: StatCardProps) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] p-5 shadow-sm dark:shadow-none transition-transform hover:scale-[1.02]"
      style={{ boxShadow: `0 0 24px ${color}18` }}
    >
      <div
        className="absolute inset-0 opacity-[0.04] dark:opacity-[0.08] rounded-2xl"
        style={{ background: `radial-gradient(circle at top right, ${color}, transparent 70%)` }}
      />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {label}
          </span>
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: `${color}18`, color }}
          >
            {icon}
          </div>
        </div>
        <div className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">{value}</div>
        {sub && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sub}</div>}
      </div>
    </div>
  );
}

// ─── Chart Card ─────────────────────────────────────────────
interface ChartCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

function ChartCard({ title, subtitle, children, className }: ChartCardProps) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] shadow-sm dark:shadow-none p-5 ${className ?? ""}`}
    >
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        )}
      </div>
      {children}
    </div>
  );
}

// ─── Donut With Center Label (theme-aware) ───────────────────
interface DonutWithCenterProps {
  data: { name: string; value: number; key: string }[];
  total: number;
}

function DonutWithCenter({ data, total }: DonutWithCenterProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const centerLabelColor = isDark ? "#94a3b8" : "#64748b";
  const centerValueColor = isDark ? "#ffffff" : "#0f172a";
  const legendTextColor = isDark ? "#94a3b8" : "#64748b";

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={72}
          outerRadius={108}
          paddingAngle={3}
          dataKey="value"
          stroke="none"
        >
          {data.map((entry, i) => (
            <Cell key={i} fill={OUTCOME_COLORS[entry.key] ?? "#6366f1"} />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend
          verticalAlign="bottom"
          height={36}
          formatter={(value: string) => (
            <span style={{ fontSize: 11, color: legendTextColor }}>{value}</span>
          )}
        />
        <text
          x="50%"
          y="43%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={centerLabelColor}
          fontSize={11}
        >
          Total
        </text>
        <text
          x="50%"
          y="54%"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={centerValueColor}
          fontSize={26}
          fontWeight="bold"
        >
          {total}
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function CandidatePerformancePage() {
  const { candidateId } = useParams<{ candidateId: string }>();
  const router = useRouter();
  const { departmentId } = useDepartmentContext();
  const role = getUserRole();
  const hasAccess =
    role === "superadmin" || role === "dept-lead" || role === "bd-team-lead";

  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [leads, setLeads] = useState<LeadListItem[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"leads" | "interviews">("leads");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const deptParam = departmentId ? { department_id: departmentId } : {};
      const [candidatesData, leadsPage, interviewsData] = await Promise.all([
        candidatesService.list({ department_id: departmentId }),
        leadsService.list({ page: 1, page_size: 5000, candidate_id: candidateId, ...deptParam }),
        interviewsService.list(departmentId ? { department_id: departmentId } : undefined),
      ]);
      const found = candidatesData.find((c) => c.id === candidateId);
      setCandidate(found ?? null);
      setLeads(leadsPage.items);
      setInterviews(interviewsData.filter((i) => i.candidate_id === candidateId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load candidate data");
    } finally {
      setLoading(false);
    }
  }, [candidateId, departmentId]);

  useEffect(() => {
    if (hasAccess) fetchData();
    else setLoading(false);
  }, [fetchData, hasAccess]);

  // ── Leads Metrics ────────────────────────────────────────
  const leadsMetrics = useMemo(() => {
    const total = leads.length;
    const dropped = leads.filter((l) => l.lead_outcome === "dropped").length;
    const legit = total - dropped;
    const closed = leads.filter((l) => l.lead_outcome === "closed").length;
    const rejected = leads.filter(
      (l) => l.lead_outcome === "rejected" || l.lead_outcome === "dead"
    ).length;
    const unresponsive = leads.filter((l) => l.lead_outcome === "unresponsive").length;
    const progressed = leads.filter((l) => l.lead_outcome === "active").length;
    return { total, legit, closed, rejected, unresponsive, progressed, dropped };
  }, [leads]);

  // ── Interviews Metrics ───────────────────────────────────
  const interviewsMetrics = useMemo(() => {
    const total = interviews.length;
    const dropped = interviews.filter((i) => i.lead_outcome === "dropped").length;
    const legit = total - dropped;
    let closed = 0,
      rejected = 0,
      unresponsive = 0,
      progressed = 0;
    interviews.forEach((i) => {
      const label = i.computed_status.toLowerCase();
      if (label === "upcoming") return;
      else if (label === "unresponsed") unresponsive++;
      else if (label.includes("converted") || label.includes("progressed")) progressed++;
      else if (label.includes("rejected")) rejected++;
      else if (label === "dead") rejected++;
      else if (label.includes("closed")) closed++;
    });
    return { total, legit, closed, rejected, unresponsive, progressed, dropped };
  }, [interviews]);

  const m = activeTab === "leads" ? leadsMetrics : interviewsMetrics;

  // ── Donut Data ───────────────────────────────────────────
  const donutData = useMemo(
    () =>
      [
        { name: "Closed", value: m.closed, key: "closed" },
        { name: "Progressed", value: m.progressed, key: "progressed" },
        { name: "Rejected", value: m.rejected, key: "rejected" },
        { name: "Unresponsive", value: m.unresponsive, key: "unresponsive" },
        { name: "Dropped", value: m.dropped, key: "dropped" },
      ].filter((d) => d.value > 0),
    [m]
  );

  // ── Monthly Activity ─────────────────────────────────────
  const monthlyData = useMemo(() => {
    // Use "yyyy-MM" as the map key so we can sort chronologically,
    // and store the human-readable "MMM yy" separately as the display label.
    const map = new Map<string, { month: string; leads: number; interviews: number }>();
    leads.forEach((l) => {
      const dateStr = l.lead_arrival_date ?? l.first_interview_date;
      if (!dateStr) return;
      try {
        const d = startOfMonth(parseISO(dateStr));
        const sortKey = format(d, "yyyy-MM");
        const label = format(d, "MMM yy");
        const entry = map.get(sortKey) ?? { month: label, leads: 0, interviews: 0 };
        entry.leads++;
        map.set(sortKey, entry);
      } catch {
        // skip malformed dates
      }
    });
    interviews.forEach((i) => {
      const dateStr = i.interview_date;
      if (!dateStr) return;
      try {
        const d = startOfMonth(parseISO(dateStr));
        const sortKey = format(d, "yyyy-MM");
        const label = format(d, "MMM yy");
        const entry = map.get(sortKey) ?? { month: label, leads: 0, interviews: 0 };
        entry.interviews++;
        map.set(sortKey, entry);
      } catch {
        // skip malformed dates
      }
    });
    // Sort by the ISO sortable key (chronological), then return only the display values.
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [leads, interviews]);


  // ── Rate Bar Data ────────────────────────────────────────
  const rateData = useMemo(() => {
    const denom = m.legit > 0 ? m.legit : 1;
    const totalDenom = m.total > 0 ? m.total : 1;
    return [
      { name: "Closing", value: pct(m.closed, denom), fill: OUTCOME_COLORS.closed },
      { name: "Progressed", value: pct(m.progressed, denom), fill: OUTCOME_COLORS.progressed },
      { name: "Rejection", value: pct(m.rejected, denom), fill: OUTCOME_COLORS.rejected },
      { name: "Unresponsive", value: pct(m.unresponsive, denom), fill: OUTCOME_COLORS.unresponsive },
      { name: "Dropped", value: pct(m.dropped, totalDenom), fill: OUTCOME_COLORS.dropped },
    ];
  }, [m]);

  // ── Recent Items ─────────────────────────────────────────
  const recentLeads = useMemo(
    () =>
      [...leads]
        .sort((a, b) => {
          const da = a.last_interview_date ?? a.first_interview_date ?? "";
          const db = b.last_interview_date ?? b.first_interview_date ?? "";
          return db.localeCompare(da);
        })
        .slice(0, 8),
    [leads]
  );

  const recentInterviews = useMemo(
    () =>
      [...interviews]
        .sort((a, b) => (b.interview_date ?? "").localeCompare(a.interview_date ?? ""))
        .slice(0, 8),
    [interviews]
  );

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-slate-500">Access Denied</p>
      </div>
    );
  }

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;
  if (!candidate)
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-slate-500">Candidate not found.</p>
      </div>
    );

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-4">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
          aria-label="Back to performance"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-3 min-w-0 flex-1">
          <CandidateAvatar candidate={candidate} size={48} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white truncate">
              {candidate.name}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {candidate.is_active ? (
                <span className="text-emerald-500 font-medium">Active</span>
              ) : (
                <span className="text-slate-400">Inactive</span>
              )}
              {candidate.department_name && <> · {candidate.department_name}</>}
            </p>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-1.5 rounded-full bg-slate-100 dark:bg-white/[0.06] p-1 shrink-0">
          {(["leads", "interviews"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI Stat Cards ──────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total" value={m.total} sub={`${m.legit} legit`} color="#6366f1" icon={<Target size={14} />} />
        <StatCard label="Closed" value={m.closed} sub={`${pct(m.closed, m.legit)}% rate`} color="#10b981" icon={<Award size={14} />} />
        <StatCard label="Progressed" value={m.progressed} sub={`${pct(m.progressed, m.legit)}% rate`} color="#8b5cf6" icon={<TrendingUp size={14} />} />
        <StatCard label="Rejected" value={m.rejected} sub={`${pct(m.rejected, m.legit)}% rate`} color="#ef4444" icon={<AlertTriangle size={14} />} />
        <StatCard label="Unresponsive" value={m.unresponsive} sub={`${pct(m.unresponsive, m.legit)}% rate`} color="#f59e0b" icon={<Users size={14} />} />
        <StatCard label="Dropped" value={m.dropped} sub={`${pct(m.dropped, m.total)}% of total`} color="#3b82f6" icon={<Activity size={14} />} />
      </div>

      {/* ── Charts Row 1: Donut + Rate Bars ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Donut Chart */}
        <ChartCard title="Outcome Breakdown" subtitle={`Distribution of ${activeTab} outcomes`}>
          {donutData.length === 0 ? (
            <div className="flex items-center justify-center h-[260px] text-slate-400 text-sm">
              No outcome data yet
            </div>
          ) : (
            <DonutWithCenter data={donutData} total={m.total} />
          )}
        </ChartCard>

        {/* Horizontal Bar Chart — Rates */}
        <ChartCard title="Performance Rates" subtitle="% by outcome (of legit leads)">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={rateData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.04)"
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={110}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={BAR_CURSOR_STYLE}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22}>
                {rateData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── Monthly Activity Area Chart ──────────────────── */}
      <ChartCard title="Monthly Activity" subtitle="Leads and interviews over time">
        {monthlyData.length === 0 ? (
          <div className="flex items-center justify-center h-[240px] text-slate-400 text-sm">
            No time-series data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthlyData} margin={{ top: 5, right: 16, left: -10, bottom: 5 }}>
              <defs>
                <linearGradient id="leadsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="interviewsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis
                dataKey="month"
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend
                verticalAlign="top"
                height={36}
                formatter={(value: string) => (
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>{value}</span>
                )}
              />
              <Area
                type="monotone"
                dataKey="leads"
                name="Leads"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#leadsGrad)"
                dot={{ r: 4, strokeWidth: 0, fill: "#6366f1" }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
              <Area
                type="monotone"
                dataKey="interviews"
                name="Interviews"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#interviewsGrad)"
                dot={{ r: 4, strokeWidth: 0, fill: "#10b981" }}
                activeDot={{ r: 6, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ── Recent Activity Table ────────────────────────── */}
      <ChartCard
        title={`Recent ${activeTab === "leads" ? "Leads" : "Interviews"}`}
        subtitle={`Latest ${activeTab} activity for this candidate`}
      >
        {activeTab === "leads" ? (
          recentLeads.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">No leads found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-2 font-semibold">Company</th>
                    <th className="px-3 py-2 font-semibold">Role</th>
                    <th className="px-3 py-2 font-semibold">Outcome</th>
                    <th className="px-3 py-2 font-semibold">Interviews</th>
                    <th className="px-3 py-2 font-semibold">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {recentLeads.map((lead) => (
                    <tr
                      key={lead.thread_id}
                      className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">
                        {lead.company_name ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                        {lead.primary_role ?? "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <OutcomeBadge outcome={lead.lead_outcome} />
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 tabular-nums">
                        {lead.interview_count}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 text-xs tabular-nums">
                        {lead.last_interview_date
                          ? formatShortDate(lead.last_interview_date)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : recentInterviews.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-8">No interviews found</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2 font-semibold">Company</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                  <th className="px-3 py-2 font-semibold">Round</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentInterviews.map((interview) => (
                  <tr
                    key={interview.id}
                    className="border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-white">
                      {interview.company_name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
                      {interview.role ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">
                      {interview.round ?? "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={computedStatusStyle(interview.computed_status)}
                      >
                        {interview.computed_status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 text-xs tabular-nums">
                      {interview.interview_date ? formatShortDate(interview.interview_date) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function formatShortDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

const OUTCOME_BADGE_STYLES: Record<string, { bg: string; text: string }> = {
  closed: { bg: "rgba(16,185,129,0.15)", text: "#10b981" },
  active: { bg: "rgba(99,102,241,0.15)", text: "#818cf8" },
  rejected: { bg: "rgba(239,68,68,0.12)", text: "#f87171" },
  dead: { bg: "rgba(100,116,139,0.12)", text: "#94a3b8" },
  unresponsive: { bg: "rgba(245,158,11,0.15)", text: "#fbbf24" },
  dropped: { bg: "rgba(59,130,246,0.12)", text: "#60a5fa" },
};

function OutcomeBadge({ outcome }: { outcome: string }) {
  const style = OUTCOME_BADGE_STYLES[outcome] ?? {
    bg: "rgba(148,163,184,0.1)",
    text: "#94a3b8",
  };
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {outcome}
    </span>
  );
}

function computedStatusStyle(status: string): React.CSSProperties {
  const s = status.toLowerCase();
  if (s.includes("closed")) return { backgroundColor: "rgba(16,185,129,0.15)", color: "#10b981" };
  if (s.includes("reject") || s === "dead")
    return { backgroundColor: "rgba(239,68,68,0.12)", color: "#f87171" };
  if (s.includes("convert") || s.includes("progress"))
    return { backgroundColor: "rgba(139,92,246,0.15)", color: "#a78bfa" };
  if (s === "upcoming") return { backgroundColor: "rgba(99,102,241,0.12)", color: "#818cf8" };
  if (s === "unresponsed") return { backgroundColor: "rgba(245,158,11,0.15)", color: "#fbbf24" };
  return { backgroundColor: "rgba(148,163,184,0.1)", color: "#94a3b8" };
}
