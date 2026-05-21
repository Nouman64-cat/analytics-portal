"use client";

import { useEffect, useState, useCallback } from "react";
import { Menu, Layers, Clock } from "lucide-react";
import { authService, departmentsService } from "@/lib/services";
import type { User as UserType, Department } from "@/lib/types";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { getUserRole } from "@/lib/auth";
import { useDepartmentContext } from "@/lib/DepartmentContext";
import NotificationBell from "@/components/NotificationBell";

interface HeaderProps {
  onMobileMenuOpen: () => void;
  collapsed: boolean;
}

const CROSS_DEPT_ROLES = new Set(["superadmin", "manager"]);
const MULTI_DEPT_CAPABLE_ROLES = new Set([
  "superadmin",
  "manager",
  "bd",
  "bd-team-lead",
  "bd-manager",
]);
const NOTIFICATION_ROLES = new Set([
  "superadmin",
  "bd",
  "bd-team-lead",
  "bd-manager",
]);

const CLOCKS = [
  {
    tz: "America/New_York",
    label: "ET",
    labelColor: "text-indigo-500 dark:text-indigo-400",
    timeColor: "text-indigo-700 dark:text-indigo-300",
  },
  {
    tz: "America/Chicago",
    label: "CT",
    labelColor: "text-rose-500 dark:text-rose-400",
    timeColor: "text-rose-700 dark:text-rose-300",
  },
  {
    tz: "America/Edmonton",
    label: "MT",
    labelColor: "text-sky-500 dark:text-sky-400",
    timeColor: "text-sky-700 dark:text-sky-300",
  },
  {
    tz: "America/Los_Angeles",
    label: "PT",
    labelColor: "text-emerald-500 dark:text-emerald-400",
    timeColor: "text-emerald-700 dark:text-emerald-300",
  },
  {
    tz: "Asia/Karachi",
    label: "PKT",
    labelColor: "text-amber-500 dark:text-amber-400",
    timeColor: "text-amber-700 dark:text-amber-300",
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
      second: "2-digit",
      hour12: true,
    });

  const abbr = (tz: string) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? tz;

  return (
    <div className="hidden lg:flex items-center gap-1 border border-slate-200 dark:border-white/[0.08] rounded-xl px-3 py-1.5 bg-slate-50/70 dark:bg-white/[0.03]">
      <Clock
        size={11}
        className="text-slate-400 dark:text-slate-500 mr-1 shrink-0"
      />
      {CLOCKS.map(({ tz, labelColor, timeColor }, i) => (
        <div key={tz} className="flex items-center gap-1">
          {i > 0 && (
            <span className="text-slate-200 dark:text-white/10 select-none">
              ·
            </span>
          )}
          <div className="text-center">
            <span
              className={`block text-[9px] font-semibold uppercase tracking-wider leading-none mb-0.5 ${labelColor}`}
            >
              {abbr(tz)}
            </span>
            <span
              className={`block text-[11px] font-mono font-medium tabular-nums leading-none ${timeColor}`}
            >
              {fmt(tz)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Header({ onMobileMenuOpen, collapsed }: HeaderProps) {
  const [user, setUser] = useState<UserType | null>(null);
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const pathname = usePathname();
  const role = getUserRole();
  const showNotifications = role ? NOTIFICATION_ROLES.has(role) : false;
  const { departmentId, setDepartmentId } = useDepartmentContext();

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
    if (!role || !MULTI_DEPT_CAPABLE_ROLES.has(role)) return;
    departmentsService
      .list()
      .then((depts) => setAllDepartments(depts.filter((d) => d.is_active)))
      .catch(() => {});
  }, [role]);

  // Compute which departments to show in the switcher for this user
  const departments = (() => {
    if (!role || !MULTI_DEPT_CAPABLE_ROLES.has(role)) return [];
    // Superadmin / manager: always all depts
    if (CROSS_DEPT_ROLES.has(role)) return allDepartments;
    // BD / BD-team-lead: governed by allowed_dept_ids
    const allowed = user?.allowed_dept_ids;
    if (allowed === undefined) {
      // User profile not loaded yet — show nothing to avoid flashing wrong depts
      return [];
    }
    if (allowed === null) {
      // Explicit null: no restriction set, use role default
      return role === "bd" || role === "bd-manager" ? allDepartments : [];
    }
    if (allowed.length === 0) return allDepartments; // [] = All
    return allDepartments.filter((d) => allowed.includes(d.id));
  })();

  const showSwitcher = departments.length > 1;

  // Auto-select first department when list loads and nothing valid is selected
  useEffect(() => {
    if (departments.length === 0) return;
    const isValid = departments.some((d) => d.id === departmentId);
    if (!isValid) setDepartmentId(departments[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departments]);

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
      className={`fixed top-0 right-0 z-30 h-16 bg-white/80 dark:bg-[#0c0e14]/80 backdrop-blur-md border-b border-slate-200 dark:border-white/[0.06] transition-all duration-300 left-0 ${collapsed ? "md:left-[4.5rem]" : "md:left-[16.25rem]"}`}
    >
      <div className="flex h-full items-center justify-between px-4 md:px-8 gap-4">
        {/* Left: mobile menu + clocks */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMobileMenuOpen}
            className="md:hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors"
          >
            <Menu size={20} />
          </button>
          <LiveClocks />
        </div>

        {/* Center: dept selector for multi-dept users */}
        {showSwitcher && (
          <div className="flex-1 flex justify-center">
            <div className="relative flex items-center gap-2">
              <Layers size={14} className="text-indigo-400 shrink-0" />
              <select
                value={departmentId ?? ""}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="appearance-none rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] pl-2 pr-7 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer"
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                <svg
                  className="h-3 w-3 text-slate-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* Right: bell + avatar */}
        <div className="flex items-center gap-2 md:gap-4">
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
