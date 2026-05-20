"use client";

import { useEffect, useState, useCallback } from "react";
import { Menu, Layers } from "lucide-react";
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
const MULTI_DEPT_CAPABLE_ROLES = new Set(["superadmin", "manager", "bd", "bd-team-lead"]);
const NOTIFICATION_ROLES = new Set(["superadmin", "bd", "bd-team-lead"]);

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

  useEffect(() => { fetchUser(); }, [fetchUser]);

  useEffect(() => {
    if (!role || !MULTI_DEPT_CAPABLE_ROLES.has(role)) return;
    departmentsService.list()
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
    if (allowed === null || allowed === undefined) {
      // No explicit setting — bd is cross-dept by default, bd-team-lead is single-dept
      return role === "bd" ? allDepartments : [];
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

  const initials = user?.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "??";

  return (
    <header
      className="fixed top-0 right-0 z-30 h-16 bg-white/80 dark:bg-[#0c0e14]/80 backdrop-blur-md border-b border-slate-200 dark:border-white/[0.06] transition-all duration-300 left-0 md:left-auto"
      style={{ left: typeof window !== "undefined" && window.innerWidth >= 768 ? (collapsed ? "72px" : "260px") : "0" }}
    >
      <div className="flex h-full items-center justify-between px-4 md:px-8 gap-4">
        {/* Left: mobile menu */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMobileMenuOpen}
            className="md:hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors"
          >
            <Menu size={20} />
          </button>
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
                <svg className="h-3 w-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* Right: bell + avatar */}
        <div className="flex items-center gap-2 md:gap-4">
          <div className="flex h-10 items-center gap-1 border-l border-slate-200 dark:border-white/[0.06] pl-2 md:pl-4">
            {showNotifications && <NotificationBell />}
            <Link href="/profile" className="flex items-center gap-3 pl-1 md:pl-2 group">
              <div className="hidden md:block text-right">
                <p className="text-[13px] font-bold text-slate-900 dark:text-white group-hover:text-indigo-500 transition-colors">
                  {user?.full_name || "Loading..."}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">View Profile</p>
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
