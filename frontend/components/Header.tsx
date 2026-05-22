"use client";

import { useEffect, useState, useCallback } from "react";
import { Menu, Sun, Moon, ChevronLeft, ChevronRight } from "lucide-react";
import { useTheme } from "next-themes";
import { authService } from "@/lib/services";
import type { User as UserType } from "@/lib/types";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { getUserRole } from "@/lib/auth";
import NotificationBell from "@/components/NotificationBell";

interface HeaderProps {
  onMobileMenuOpen: () => void;
  collapsed: boolean;
  onSidebarToggle: () => void;
}

const NOTIFICATION_ROLES = new Set([
  "superadmin",
  "bd",
  "bd-team-lead",
  "bd-manager",
]);

const CLOCKS = [
  {
    tz: "America/New_York",
    pill: "bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30",
    labelColor: "text-indigo-500 dark:text-indigo-400",
    timeColor: "text-indigo-900 dark:text-indigo-100",
  },
  {
    tz: "America/Chicago",
    pill: "bg-rose-50 dark:bg-rose-500/15 border border-rose-200 dark:border-rose-500/30",
    labelColor: "text-rose-500 dark:text-rose-400",
    timeColor: "text-rose-900 dark:text-rose-100",
  },
  {
    tz: "America/Edmonton",
    pill: "bg-sky-50 dark:bg-sky-500/15 border border-sky-200 dark:border-sky-500/30",
    labelColor: "text-sky-500 dark:text-sky-400",
    timeColor: "text-sky-900 dark:text-sky-100",
  },
  {
    tz: "America/Los_Angeles",
    pill: "bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30",
    labelColor: "text-emerald-600 dark:text-emerald-400",
    timeColor: "text-emerald-900 dark:text-emerald-100",
  },
  {
    tz: "Asia/Karachi",
    pill: "bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/30",
    labelColor: "text-amber-600 dark:text-amber-400",
    timeColor: "text-amber-900 dark:text-amber-100",
  },
];

function LiveClocks() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!now) return null;

  const fmt = (tz: string) =>
    now.toLocaleTimeString("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

  const abbr = (tz: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? tz;

  return (
    <div className="hidden lg:flex items-center gap-1.5">
      {CLOCKS.map(({ tz, pill, labelColor, timeColor }) => (
        <div
          key={tz}
          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 ${pill}`}
        >
          <span
            className={`text-[12px] font-bold uppercase tracking-widest leading-none ${labelColor}`}
          >
            {abbr(tz)}
          </span>
          <span
            className={`text-[14px] font-mono font-bold tabular-nums leading-none ${timeColor}`}
          >
            {fmt(tz)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Header({
  onMobileMenuOpen,
  collapsed,
  onSidebarToggle,
}: HeaderProps) {
  const [user, setUser] = useState<UserType | null>(null);
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const role = getUserRole();
  const showNotifications = role ? NOTIFICATION_ROLES.has(role) : false;

  const fetchUser = useCallback(async () => {
    try {
      const data = await authService.getMe();
      setUser(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const getPageTitle = () => {
    if (pathname === "/") return "Dashboard Overview";
    if (pathname.includes("/interviews")) return "Interviews Management";
    if (pathname.includes("/calendar")) return "Interview Schedule";
    if (pathname.includes("/companies")) return "Company Partners";
    if (pathname.includes("/candidates")) return "Candidates Pipeline";
    if (pathname.startsWith("/resume-profiles")) return "Resume Profiles";
    if (pathname.includes("/business-developers")) return "Team Business Devs";
    if (pathname.includes("/activities")) return "Activity Logs";
    if (pathname.includes("/users")) return "User Management";
    if (pathname.includes("/departments")) return "Departments";
    if (pathname.includes("/profile")) return "Account Settings";
    return "RizViz Analytics";
  };

  const initials =
    user?.full_name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "??";

  return (
    <header
      className={`fixed top-0 right-0 z-30 h-16 bg-white/80 dark:bg-[#0c0e14]/80 backdrop-blur-md border-b border-slate-200 dark:border-white/[0.06] transition-all duration-300 left-0 ${collapsed ? "md:left-16" : "md:left-[13.75rem]"}`}
    >
      <div className="flex h-full items-center justify-between px-4 md:px-8 gap-4">
        {/* Left: desktop collapse toggle + mobile menu + clocks */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onSidebarToggle}
            className="hidden md:inline-flex items-center justify-center rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          </button>
          <button
            onClick={onMobileMenuOpen}
            className="md:hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors"
          >
            <Menu size={20} />
          </button>
          <LiveClocks />
        </div>

        {/* Right: theme switcher, bell + avatar */}
        <div className="flex items-center gap-2 md:gap-4">
          {mounted && (
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors"
              title={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          )}
          <div className="flex h-10 items-center gap-1 border-l border-slate-200 dark:border-white/[0.06] pl-2 md:pl-4">
            {showNotifications && <NotificationBell />}
            <Link
              href="/profile"
              className="flex items-center gap-3 pl-1 md:pl-2 group"
            >
              <div className="hidden md:block text-right">
                <p className="text-[13px] font-bold text-slate-900 dark:text-white group-hover:text-indigo-500 transition-colors">
                  {user?.full_name || "Loading..."}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  View Profile
                </p>
              </div>
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white shadow-md group-hover:scale-105 transition-transform">
                {initials}
              </div>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
