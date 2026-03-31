"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { isAuthenticated, mustChangePassword, clearToken, getUserRole } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/change-password"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [checked, setChecked] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

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
      <Sidebar collapsed={collapsed} onCollapse={setCollapsed} />
      <main
        className={`flex-1 min-h-screen transition-all duration-300 ${
          collapsed ? "ml-[72px]" : "ml-[260px]"
        }`}
      >
        <div className="px-6 py-8">{children}</div>
      </main>
    </>
  );
}
