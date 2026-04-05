"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface SidebarProps {
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}
import {
  LayoutDashboard,
  CalendarCheck,
  Calendar,
  Building2,
  Users,
  FileUser,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import { clearToken, getUserRole } from "@/lib/auth";
import { useRouter } from "next/navigation";

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard,
  CalendarCheck,
  Calendar,
  Building2,
  Users,
  FileUser,
  Briefcase,
};

export default function Sidebar({ collapsed, onCollapse, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = () => {
    clearToken();
    router.replace("/login");
  };

  const role = getUserRole();
  const MANAGER_HIDDEN_HREFS = ["/", "/business-developers"];
  const visibleNavItems = role === "manager"
    ? NAV_ITEMS.filter((item) => !MANAGER_HIDDEN_HREFS.includes(item.href))
    : NAV_ITEMS;

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
        ${collapsed ? "w-[72px]" : "w-[260px]"}
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        md:translate-x-0`}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 dark:border-white/[0.06] px-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-xs font-bold text-white shadow-md">
          AI
        </div>
        {!collapsed && (
          <span className="text-sm font-semibold text-slate-800 dark:text-white tracking-tight">
            AI Interviews Portal
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {visibleNavItems.map((item) => {
          const Icon = ICON_MAP[item.icon];
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200
                ${isActive
                  ? "bg-gradient-to-r from-indigo-50 to-indigo-100 dark:from-indigo-500/15 dark:to-purple-500/10 text-indigo-700 dark:text-white shadow-sm dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white"
                }
                ${collapsed ? "justify-center px-0" : ""}
              `}
              title={collapsed ? item.label : undefined}
            >
              <Icon
                size={18}
                className={`shrink-0 ${isActive
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
        {/* Theme Toggle */}
        {mounted && (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white ${collapsed ? "justify-center px-0" : ""}`}
            title={collapsed ? "Toggle Theme" : undefined}
          >
            {theme === "dark" ? (
              <Sun size={18} className="shrink-0" />
            ) : (
              <Moon size={18} className="shrink-0" />
            )}
            {!collapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
          </button>
        )}

        {/* Collapse button — hidden on mobile */}
        <button
          onClick={() => onCollapse(!collapsed)}
          className={`hidden md:flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-200 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white ${collapsed ? "justify-center px-0" : ""}`}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span>Collapse Sidebar</span>}
        </button>

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
