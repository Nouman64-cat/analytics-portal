// API Configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const API_V1 = `${API_BASE_URL}/api/v1`;

// Navigation
export const NAV_ITEMS = [
  { label: "Dashboard", href: "/", icon: "LayoutDashboard" },
  { label: "Interviews", href: "/interviews", icon: "CalendarCheck" },
  { label: "Calendar", href: "/calendar", icon: "Calendar" },
  { label: "Companies", href: "/companies", icon: "Building2" },
  { label: "Candidates", href: "/candidates", icon: "Users" },
  { label: "Resume Profiles", href: "/profiles", icon: "FileUser" },
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

// Status colors for badges
export const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  converted: { bg: "bg-orange-500/10", text: "text-orange-400", dot: "bg-orange-400" },
  rejected: { bg: "bg-red-500/10", text: "text-red-400", dot: "bg-red-400" },
  dropped: { bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-400" },
  closed: { bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-400" },
  dead: { bg: "bg-stone-500/10", text: "text-stone-400", dot: "bg-stone-400" },
};

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
