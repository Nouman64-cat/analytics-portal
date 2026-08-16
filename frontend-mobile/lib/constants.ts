// API Configuration — read from frontend-mobile/.env (EXPO_PUBLIC_ vars are inlined at build time)
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:8000";
export const API_V1 = `${API_BASE_URL}/api/v1`;

export type NavIcon =
  | "grid-outline"
  | "locate-outline"
  | "bar-chart-outline"
  | "checkmark-done-circle-outline"
  | "calendar-outline"
  | "business-outline"
  | "people-outline"
  | "pie-chart-outline"
  | "document-text-outline"
  | "briefcase-outline"
  | "time-outline"
  | "layers-outline"
  | "person-outline"
  | "server-outline"
  | "megaphone-outline"
  | "person-circle-outline"
  | "settings-outline"
  | "chatbubbles-outline";

export const NAV_ITEMS: { label: string; href: string; icon: NavIcon }[] = [
  { label: "Dashboard", href: "/", icon: "grid-outline" },
  { label: "Leads", href: "/leads", icon: "locate-outline" },
  { label: "Stats", href: "/stats", icon: "bar-chart-outline" },
  { label: "Interviews", href: "/interviews", icon: "checkmark-done-circle-outline" },
  { label: "Calendar", href: "/calendar", icon: "calendar-outline" },
  { label: "Companies", href: "/companies", icon: "business-outline" },
  { label: "Candidates", href: "/candidates", icon: "people-outline" },
  { label: "Performance", href: "/performance", icon: "pie-chart-outline" },
  { label: "Resume Profiles", href: "/resume-profiles", icon: "document-text-outline" },
  { label: "Business Devs", href: "/business-developers", icon: "briefcase-outline" },
  { label: "Activities", href: "/activities", icon: "time-outline" },
  { label: "Departments", href: "/departments", icon: "layers-outline" },
  { label: "User Management", href: "/users", icon: "person-outline" },
  { label: "Database Backup", href: "/backup", icon: "server-outline" },
  { label: "Announcements", href: "/announcements", icon: "megaphone-outline" },
  { label: "Chat Assistant", href: "/chat", icon: "chatbubbles-outline" },
  { label: "Profile", href: "/profile", icon: "person-circle-outline" },
  { label: "Settings", href: "/settings", icon: "settings-outline" },
];

// Chart / accent palette — mirrors frontend/lib/constants.ts CHART_COLORS
export const CHART_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
];

export const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  converted: { bg: "#8b5cf626", text: "#7c3aed", dot: "#d946ef" },
  active: { bg: "#3b82f626", text: "#2563eb", dot: "#3b82f6" },
  rejected: { bg: "#ef444426", text: "#dc2626", dot: "#f87171" },
  dropped: { bg: "#f59e0b26", text: "#b45309", dot: "#f59e0b" },
  closed: { bg: "#10b98126", text: "#047857", dot: "#10b981" },
  dead: { bg: "#78716c26", text: "#57534e", dot: "#a8a29e" },
};

export const DEFAULT_PAGE_SIZE = 20;
