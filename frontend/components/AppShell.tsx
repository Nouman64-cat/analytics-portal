"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { isAuthenticated, mustChangePassword, clearToken, getUserRole } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/change-password"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (PUBLIC_PATHS.includes(pathname)) {
      setChecked(true);
      return;
    }
    if (!isAuthenticated()) {
      clearToken();
      router.replace("/login");
      return;
    }
    if (mustChangePassword()) {
      router.replace("/change-password");
      return;
    }
    if (getUserRole() === "manager" && (pathname === "/" || pathname === "/business-developers")) {
      router.replace("/interviews");
      return;
    }
    setChecked(true);
  }, [pathname, router]);

  // Public pages render without the shell
  if (PUBLIC_PATHS.includes(pathname)) return <>{children}</>;

  // Wait for auth check before rendering protected content
  if (!checked) return null;

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 bg-slate-50 dark:bg-[#0c0e14] border-b border-slate-200 dark:border-white/[0.06] flex items-center gap-3 px-4">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.06] transition-colors"
        >
          <Menu size={20} />
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-[10px] font-bold text-white shadow-md">
          AI
        </div>
        <span className="text-sm font-semibold text-slate-800 dark:text-white tracking-tight">AI Interviews Portal</span>
      </div>

      <Sidebar collapsed={collapsed} onCollapse={setCollapsed} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <main
        className={`flex-1 min-w-0 min-h-screen transition-all duration-300 pt-14 md:pt-0 ${
          collapsed ? "md:ml-[72px]" : "md:ml-[260px]"
        }`}
      >
        <div className="px-4 py-6 md:px-6 md:py-8">{children}</div>
      </main>
    </>
  );
}
