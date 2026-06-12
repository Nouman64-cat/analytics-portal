"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import {
  LayoutDashboard,
  CalendarCheck,
  Calendar,
  Building2,
  Users,
  FileUser,
  Briefcase,
  History,
  LogOut,
  UserCog,
  User,
  Database,
  Target,
  Settings2,
  Layers,
  BarChart2,
  ChevronDown,
  Megaphone,
} from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import { clearToken, getUserRole, getCanBroadcast } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { authService, departmentsService } from "@/lib/services";
import type { User as UserType, Department } from "@/lib/types";
import { useDepartmentContext } from "@/lib/DepartmentContext";
import { useVoiceContext } from "react-voice-action-router";

interface SidebarProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const CROSS_DEPT_ROLES = new Set(["superadmin", "manager", "guest"]);
const MULTI_DEPT_CAPABLE_ROLES = new Set(["superadmin", "manager", "guest", "bd", "bd-team-lead", "bd-manager", "team-member", "dept-lead"]);

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  CalendarCheck,
  Calendar,
  Building2,
  Users,
  FileUser,
  Briefcase,
  History,
  UserCog,
  User,
  Database,
  Target,
  Settings2,
  Layers,
  BarChart2,
  Megaphone,
};

export default function Sidebar({
  collapsed,
  onCollapse,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const handleLogout = () => {
    clearToken();
    router.replace("/login");
  };

  const role = getUserRole();
  const canBroadcast = getCanBroadcast();
  const { departmentId, setDepartmentId } = useDepartmentContext();
  const [allDepartments, setAllDepartments] = useState<Department[]>([]);
  const [userProfile, setUserProfile] = useState<UserType | null>(null);

  useEffect(() => {
    if (!role || !MULTI_DEPT_CAPABLE_ROLES.has(role)) return;
    departmentsService.list().then((d) => setAllDepartments(d.filter((x) => x.is_active))).catch(() => {});
    authService.getMe().then(setUserProfile).catch(() => {});
  }, [role]);

  const departments = useMemo((): Department[] => {
    if (!role || !MULTI_DEPT_CAPABLE_ROLES.has(role)) return [];
    if (CROSS_DEPT_ROLES.has(role)) return allDepartments;
    if (role === "bd" && userProfile?.linked_to_superadmin) return allDepartments;

    const allowed = userProfile?.allowed_dept_ids;

    // BD manager: full cross-dept access
    if (role === "bd-manager") {
      if (allowed === null || allowed === undefined) return allDepartments;
      if (allowed.length === 0) return allDepartments;
      return allDepartments.filter((d) => allowed.includes(d.id));
    }

    // team-member and dept-lead: show switcher only if allowed_dept_ids has 2+ depts
    if (role === "team-member" || role === "dept-lead") {
      if (!allowed || allowed.length === 0) return [];
      return allDepartments.filter((d) => allowed.includes(d.id));
    }

    // BD / BD_TEAM_LEAD
    if (allowed === undefined) return [];
    if (allowed === null) return role === "bd" || role === "bd-manager" ? allDepartments : [];
    if (allowed.length === 0) return allDepartments;
    return allDepartments.filter((d) => allowed.includes(d.id));
  }, [role, allDepartments, userProfile]);

  // Auto-select first valid department
  useEffect(() => {
    if (departments.length === 0) return;
    if (!departments.some((d) => d.id === departmentId)) setDepartmentId(departments[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departments]);

  const voiceCtx = useVoiceContext();

  // Register dynamic voice commands for department switching
  useEffect(() => {
    if (!voiceCtx || departments.length <= 1) return;

    const ids: string[] = [];

    departments.forEach((dept) => {
      const id = `switch_dept_${dept.id}`;
      ids.push(id);
      voiceCtx.register({
        id,
        phrase: `switch to ${dept.name}`,
        description: `Switches the current active department context to ${dept.name}`,
        action: () => setDepartmentId(dept.id),
      });
    });

    return () => {
      ids.forEach((id) => voiceCtx.unregister(id));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departments, setDepartmentId]);

  const showSwitcher = departments.length > 1;
  const HIDDEN_BY_ROLE: Record<string, string[]> = {
    manager: [
      "/",
      "/business-developers",
      "/activities",
      "/users",
      "/backup",
      "/departments",
      "/announcements",
    ],
    bd: ["/activities", "/users", "/backup", "/departments", "/stats", "/business-developers", "/announcements"],
    "team-member": [
      "/candidates",
      "/business-developers",
      "/users",
      "/backup",
      "/departments",
      "/stats",
      "/announcements",
    ],
    "dept-lead": [
      "/business-developers",
      "/activities",
      "/backup",
      "/departments",
      "/announcements",
    ],
    "bd-team-lead": ["/activities", "/backup", "/departments", "/announcements"],
    "bd-manager": ["/activities", "/users", "/backup", "/announcements"],
  };
  const hiddenHrefs = useMemo(() => {
    if (!role) return [];
    let hidden: string[];
    if (role === "bd" && userProfile?.linked_to_superadmin) {
      hidden = ["/backup", "/users"];
    } else {
      hidden = [...(HIDDEN_BY_ROLE[role] || [])];
    }
    // Users granted broadcast access can always see /announcements
    if (canBroadcast) {
      const idx = hidden.indexOf("/announcements");
      if (idx !== -1) hidden.splice(idx, 1);
    }
    return hidden;
  }, [role, userProfile, canBroadcast]);
  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => !hiddenHrefs.includes(item.href)),
    [hiddenHrefs],
  );

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onMobileClose}
        />
      )}
      <aside
        className={`fixed left-0 top-0 z-40 h-screen border-r border-slate-200 dark:border-white/[0.06] bg-slate-50 dark:bg-[#0c0e14] flex flex-col transition-all duration-300
        ${collapsed ? "w-16" : "w-[220px]"}
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        md:translate-x-0`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 dark:border-white/[0.06] px-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white shadow-md">
            NE
          </div>
          {!collapsed && (
            <span className="text-sm font-semibold text-slate-800 dark:text-white tracking-tight">
              Interviews Portal
            </span>
          )}
        </div>

        {/* Department switcher */}
        {showSwitcher && (
          <div className="px-3 py-2 border-b border-slate-200 dark:border-white/[0.06]">
            {collapsed ? (
              <div
                className="flex justify-center py-1"
                title={departments.find((d) => d.id === departmentId)?.name ?? "Department"}
              >
                <Layers size={17} className="text-indigo-400" />
              </div>
            ) : (
              <div className="relative">
                <Layers size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                <select
                  value={departmentId ?? ""}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full appearance-none rounded-lg border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] pl-7 pr-6 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 cursor-pointer"
                >
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = ICON_MAP[item.icon];
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200
                ${
                  isActive
                    ? "bg-gradient-to-r from-indigo-50 to-indigo-100 dark:from-indigo-500/15 dark:to-purple-500/10 text-indigo-700 dark:text-white shadow-sm dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white"
                }
                ${collapsed ? "justify-center px-0" : ""}
              `}
                title={collapsed ? item.label : undefined}
              >
                <Icon
                  size={18}
                  className={`shrink-0 ${
                    isActive
                      ? "text-indigo-600 dark:text-indigo-400"
                      : "text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300"
                  }`}
                />
                {!collapsed && <span>{item.label}</span>}
                {isActive && !collapsed && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer Actions */}
        <div className="mt-auto border-t border-slate-200 dark:border-white/[0.06] p-3 space-y-1">
          {/* Logout */}
          <button
            onClick={handleLogout}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 text-red-500/80 dark:text-red-400/80 hover:bg-red-500/10 hover:text-red-500 dark:hover:text-red-400 ${collapsed ? "justify-center px-0" : ""}`}
            title={collapsed ? "Sign out" : undefined}
          >
            <LogOut size={18} className="shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
