import { getUserId } from "./auth";
import { authService } from "./services";

// localStorage is used as a fast-read cache so InterviewAlertMonitor
// doesn't need to await an API call on every 60-second poll.
function cacheKey(): string | null {
  const id = getUserId();
  return id ? `user-settings-${id}` : null;
}

interface SettingsCache {
  alarmEnabled: boolean;
  glassmorphismEnabled: boolean;
}

function readCache(): SettingsCache {
  if (typeof window === "undefined") return { alarmEnabled: false, glassmorphismEnabled: false };
  const key = cacheKey();
  if (!key) return { alarmEnabled: false, glassmorphismEnabled: false };
  const raw = localStorage.getItem(key);
  if (!raw) return { alarmEnabled: false, glassmorphismEnabled: false };
  try {
    const parsed = JSON.parse(raw);
    return {
      alarmEnabled: parsed.alarmEnabled ?? false,
      glassmorphismEnabled: parsed.glassmorphismEnabled ?? false,
    };
  } catch {
    return { alarmEnabled: false, glassmorphismEnabled: false };
  }
}

function writeCache(updates: Partial<SettingsCache>): void {
  if (typeof window === "undefined") return;
  const key = cacheKey();
  if (!key) return;
  const current = readCache();
  localStorage.setItem(key, JSON.stringify({ ...current, ...updates }));
}

export function getCachedAlarmEnabled(): boolean {
  return readCache().alarmEnabled;
}

export function getCachedGlassmorphism(): boolean {
  return readCache().glassmorphismEnabled;
}

export function applyGlassmorphism(enabled?: boolean): void {
  if (typeof document === "undefined") return;
  const value = enabled ?? getCachedGlassmorphism();
  if (value) {
    document.documentElement.dataset.glass = "true";
  } else {
    delete document.documentElement.dataset.glass;
  }
}

/** Save alarm setting to the server and update the local cache. */
export async function saveAlarmEnabled(enabled: boolean): Promise<void> {
  writeCache({ alarmEnabled: enabled });
  window.dispatchEvent(new CustomEvent("user-settings-changed", { detail: { alarmEnabled: enabled } }));
  await authService.updateSettings({ alarm_enabled: enabled });
}

/** Save glassmorphism setting to the server and apply it immediately. */
export async function saveGlassmorphism(enabled: boolean): Promise<void> {
  writeCache({ glassmorphismEnabled: enabled });
  applyGlassmorphism(enabled);
  await authService.updateSettings({ glassmorphism_enabled: enabled });
}

/** Hydrate the cache from the server (call once after login / on app load). */
export function hydrateSettingsCache(alarmEnabled: boolean, glassmorphismEnabled: boolean = false): void {
  writeCache({ alarmEnabled, glassmorphismEnabled });
  applyGlassmorphism(glassmorphismEnabled);
}

// Kept for backward compat — InterviewAlertMonitor calls this synchronously.
export function isAlarmEnabled(): boolean {
  return getCachedAlarmEnabled();
}
