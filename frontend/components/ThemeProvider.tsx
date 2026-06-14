"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { applyAccentColor, saveAccentColor, type AccentId, ACCENT_OPTIONS } from "@/lib/accent";
import { applyGlassmorphism, hydrateSettingsCache } from "@/lib/settings";
import { authService } from "@/lib/services";
import { isAuthenticated } from "@/lib/auth";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  React.useEffect(() => {
    // Apply localStorage values immediately (no flicker)
    applyAccentColor();
    applyGlassmorphism();

    // Only sync from server when the user is actually logged in
    if (!isAuthenticated()) return;
    authService.getMe()
      .then((user) => {
        const serverAccent = user.accent_color as AccentId | null;
        if (serverAccent && ACCENT_OPTIONS.some((a) => a.id === serverAccent)) {
          saveAccentColor(serverAccent);
        }
        hydrateSettingsCache(user.alarm_enabled, user.glassmorphism_enabled);
      })
      .catch(() => { /* network error — keep local value */ });
  }, []);

  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
