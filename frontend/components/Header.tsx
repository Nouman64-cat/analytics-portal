"use client";

import { useEffect, useState, useCallback } from "react";
import { User, Shield, Bell, Search, Menu } from "lucide-react";
import { authService } from "@/lib/services";
import type { User as UserType } from "@/lib/types";
import { usePathname } from "next/navigation";
import Link from "next/link";

interface HeaderProps {
  onMobileMenuOpen: () => void;
  collapsed: boolean;
}

export default function Header({ onMobileMenuOpen, collapsed }: HeaderProps) {
  const [user, setUser] = useState<UserType | null>(null);
  const pathname = usePathname();

  const fetchUser = useCallback(async () => {
    try {
      const data = await authService.getMe();
      setUser(data);
    } catch (err) {
      console.error("Failed to fetch user in header", err);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Map pathname to title
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
    if (pathname.includes("/profile")) return "Account Settings";
    return "RizViz Analytics";
  };

  const initials = user?.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || "??";

  return (
    <header className="fixed top-0 right-0 z-30 h-16 bg-white/80 dark:bg-[#0c0e14]/80 backdrop-blur-md border-b border-slate-200 dark:border-white/[0.06] transition-all duration-300 left-0 md:left-auto"
      style={{ left: typeof window !== 'undefined' && window.innerWidth >= 768 ? (collapsed ? '72px' : '260px') : '0' }}
    >
      <div className="flex h-full items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-4">
          <button
            onClick={onMobileMenuOpen}
            className="md:hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.05] transition-colors"
          >
            <Menu size={20} />
          </button>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <div className="flex h-10 items-center gap-1 border-l border-slate-200 dark:border-white/[0.06] pl-2 md:pl-4">
            <button className="hidden sm:flex rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white transition-all">
              <Bell size={20} />
            </button>
            
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
