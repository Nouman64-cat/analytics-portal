// API Configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const API_V1 = `${API_BASE_URL}/api/v1`;

// Navigation
export const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: "LayoutDashboard" },
  { label: "Leads", href: "/leads", icon: "Target" },
  { label: "Interviews", href: "/interviews", icon: "CalendarCheck" },
  { label: "Calendar", href: "/calendar", icon: "Calendar" },
  { label: "Companies", href: "/companies", icon: "Building2" },
  { label: "Candidates", href: "/candidates", icon: "Users" },
  { label: "Resume Profiles", href: "/resume-profiles", icon: "FileUser" },
  { label: "Business Devs", href: "/business-developers", icon: "Briefcase" },
  { label: "Activities", href: "/activities", icon: "History" },
  { label: "User Management", href: "/users", icon: "UserCog" },
  { label: "Database backup", href: "/backup", icon: "Database" },
  { label: "Profile", href: "/profile", icon: "User" },
] as const;

// Chart colors — premium palette
export const CHART_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#f43f5e", // rose
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#3b82f6", // blue
];

/**
 * Lead thread outcomes — shared by badges, Leads table, and stats card icon glows.
 * - closed: success (won / job closed)
 * - converted: progress toward success (not terminal yet)
 * - dropped: stopped; could not continue
 */
export const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  /** Distinct from blue “upcoming / in play”; reads as a milestone toward success. */
  converted: {
    bg: "bg-violet-500/15",
    text: "text-violet-800 dark:text-violet-300",
    dot: "bg-fuchsia-500",
  },
  rejected: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400" },
  dropped: {
    bg: "bg-amber-500/15",
    text: "text-amber-800 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  closed: {
    bg: "bg-emerald-500/15",
    text: "text-emerald-800 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  dead: { bg: "bg-stone-500/10", text: "text-stone-400", dot: "bg-stone-400" },
};

/** Stats card background glow (Tailwind); matches {@link getLeadOutcomeBadgeStyle} families. */
export const LEAD_STAT_CARD_GRADIENT = {
  total: "bg-gradient-to-br from-indigo-500 to-violet-600",
  /** In play: active / in_pipeline — distinct from success (closed). */
  active: "bg-gradient-to-br from-blue-500 to-cyan-600",
  converted: "bg-gradient-to-br from-violet-500 to-fuchsia-600",
  rejected: "bg-gradient-to-br from-rose-500 to-red-700",
  dropped: "bg-gradient-to-br from-amber-500 to-orange-600",
  /** Success */
  closed: "bg-gradient-to-br from-emerald-500 to-green-600",
  dead: "bg-gradient-to-br from-stone-500 to-neutral-700",
} as const;

/** Interviews page stat cards — Upcoming = blue/cyan; Converted = violet (not sky/blue). */
export const INTERVIEW_STATS_GRADIENT = {
  total: LEAD_STAT_CARD_GRADIENT.total,
  /** Scheduled / live — cool blue (avoid overlapping converted’s purple). */
  upcoming: "bg-gradient-to-br from-blue-600 to-cyan-500",
  unresponsed: LEAD_STAT_CARD_GRADIENT.dropped,
  converted: "bg-gradient-to-br from-violet-600 to-fuchsia-600",
  rejected: LEAD_STAT_CARD_GRADIENT.rejected,
  dead: LEAD_STAT_CARD_GRADIENT.dead,
} as const;

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
