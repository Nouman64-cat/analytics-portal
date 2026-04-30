"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import InterviewAlertMonitor from "@/components/InterviewAlertMonitor";
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
    const role = getUserRole();
    if (role === "manager" && (pathname === "/" || pathname === "/business-developers" || pathname.startsWith("/activities"))) {
      router.replace("/interviews");
      return;
    }
    if (role === "bd" && pathname.startsWith("/activities")) {
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
      <Header 
        onMobileMenuOpen={() => setMobileOpen(true)} 
        collapsed={collapsed}
      />
      
      <Sidebar 
        collapsed={collapsed} 
        onCollapse={setCollapsed} 
        mobileOpen={mobileOpen} 
        onMobileClose={() => setMobileOpen(false)} 
      />

      <main
        className={`flex-1 min-w-0 min-h-screen transition-all duration-300 pt-16 ${
          collapsed ? "md:ml-[72px]" : "md:ml-[260px]"
        }`}
      >
        <div className="px-4 py-8 md:px-8 md:py-10">{children}</div>
      </main>
      <InterviewAlertMonitor />
    </>
  );
}
