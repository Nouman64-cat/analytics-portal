"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import InterviewAlertMonitor from "@/components/InterviewAlertMonitor";
import ChatWidget from "@/components/ChatWidget";
import BroadcastModalViewer from "@/components/BroadcastModalViewer";
import { useVoiceCommand, useVoiceContext } from "react-voice-action-router";
import {
  isAuthenticated,
  mustChangePassword,
  clearToken,
  getUserRole,
} from "@/lib/auth";
import { authService } from "@/lib/services";
import { hydrateSettingsCache } from "@/lib/settings";
import { DepartmentProvider } from "@/lib/DepartmentContext";

const PUBLIC_PATHS = [
  "/login",
  "/change-password",
  "/forgot-password",
  "/reset-password",
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [checked, setChecked] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { stopListening } = useVoiceContext();

  useVoiceCommand({
    id: "stop_listening",
    description: "Stops listening to the microphone, turns off voice control",
    phrase: "bye bye",
    action: () => stopListening()
  });

  useVoiceCommand({
    id: "open_sidebar",
    description: "Expands or opens the main navigation sidebar",
    phrase: "open sidebar",
    action: () => setCollapsed(false)
  });

  useVoiceCommand({
    id: "close_sidebar",
    description: "Collapses or closes the main navigation sidebar",
    phrase: "close sidebar",
    action: () => setCollapsed(true)
  });

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.innerWidth < 1280) {
      setCollapsed(true);
    }
  }, []);

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
    if (
      role === "manager" &&
      (pathname === "/" ||
        pathname === "/business-developers" ||
        pathname.startsWith("/activities"))
    ) {
      router.replace("/interviews");
      return;
    }
    if (role === "bd" && pathname.startsWith("/activities")) {
      router.replace("/interviews");
      return;
    }
    if (
      role === "bd-manager" &&
      (pathname.startsWith("/activities") ||
        pathname.startsWith("/users") ||
        pathname.startsWith("/backup"))
    ) {
      router.replace("/");
      return;
    }
    // Hydrate alarm setting from the server so the monitor has the correct
    // value immediately, even on first load or after a cache miss.
    authService
      .getMe()
      .then((user) => {
        hydrateSettingsCache(user.alarm_enabled);
      })
      .catch(() => {});

    setChecked(true);
  }, [pathname, router]);

  // Public pages render without the shell
  if (PUBLIC_PATHS.includes(pathname)) return <>{children}</>;

  // Wait for auth check before rendering protected content
  if (!checked) return null;

  return (
    <DepartmentProvider>
      <Header
        onMobileMenuOpen={() => setMobileOpen(true)}
        collapsed={collapsed}
        onSidebarToggle={() => setCollapsed((value) => !value)}
      />

      <Sidebar
        collapsed={collapsed}
        onCollapse={setCollapsed}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <main
        className={`flex-1 min-w-0 min-h-screen transition-all duration-300 pt-16 ${
          collapsed ? "md:ml-16" : "md:ml-[13.75rem]"
        }`}
      >
        <div className="px-4 py-8 md:px-8 md:py-10">{children}</div>
      </main>
      <InterviewAlertMonitor />
      <ChatWidget />
      <BroadcastModalViewer />
    </DepartmentProvider>
  );
}
