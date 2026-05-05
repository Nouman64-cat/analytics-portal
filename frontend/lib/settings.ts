import { getUserId } from "./auth";
import { authService } from "./services";

// localStorage is used as a fast-read cache so InterviewAlertMonitor
// doesn't need to await an API call on every 60-second poll.
function cacheKey(): string | null {
  const id = getUserId();
  return id ? `user-settings-${id}` : null;
}

export function getCachedAlarmEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const key = cacheKey();
  if (!key) return true;
  const raw = localStorage.getItem(key);
  if (raw === null) return false; // default until first API load
  try { return JSON.parse(raw).alarmEnabled ?? false; } catch { return false; }
}

function writeCache(alarmEnabled: boolean): void {
  if (typeof window === "undefined") return;
  const key = cacheKey();
  if (!key) return;
  localStorage.setItem(key, JSON.stringify({ alarmEnabled }));
}

/** Save setting to the server and update the local cache. */
export async function saveAlarmEnabled(enabled: boolean): Promise<void> {
  writeCache(enabled);
  window.dispatchEvent(new CustomEvent("user-settings-changed", { detail: { alarmEnabled: enabled } }));
  await authService.updateSettings({ alarm_enabled: enabled });
}

/** Hydrate the cache from the server (call once after login / on app load). */
export function hydrateSettingsCache(alarmEnabled: boolean): void {
  writeCache(alarmEnabled);
}

// Kept for backward compat — InterviewAlertMonitor calls this synchronously.
export function isAlarmEnabled(): boolean {
  return getCachedAlarmEnabled();
}
