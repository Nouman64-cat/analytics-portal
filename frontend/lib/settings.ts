import { getUserId } from "./auth";
import { authService } from "./services";

export type AlarmSound = "beep" | "chime" | "ping" | "pulse" | "siren";
export type AlarmStyle = "fullscreen" | "toast";

function cacheKey(): string | null {
  const id = getUserId();
  return id ? `user-settings-${id}` : null;
}

interface SettingsCache {
  alarmEnabled: boolean;
  alarmSound: AlarmSound;
  alarmStyle: AlarmStyle;
  glassmorphismEnabled: boolean;
}

function readCache(): SettingsCache {
  if (typeof window === "undefined")
    return { alarmEnabled: false, alarmSound: "beep", alarmStyle: "fullscreen", glassmorphismEnabled: false };
  const key = cacheKey();
  if (!key)
    return { alarmEnabled: false, alarmSound: "beep", alarmStyle: "fullscreen", glassmorphismEnabled: false };
  const raw = localStorage.getItem(key);
  if (!raw)
    return { alarmEnabled: false, alarmSound: "beep", alarmStyle: "fullscreen", glassmorphismEnabled: false };
  try {
    const parsed = JSON.parse(raw);
    return {
      alarmEnabled: parsed.alarmEnabled ?? false,
      alarmSound: (parsed.alarmSound as AlarmSound) ?? "beep",
      alarmStyle: (parsed.alarmStyle as AlarmStyle) ?? "fullscreen",
      glassmorphismEnabled: parsed.glassmorphismEnabled ?? false,
    };
  } catch {
    return { alarmEnabled: false, alarmSound: "beep", alarmStyle: "fullscreen", glassmorphismEnabled: false };
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

export function getCachedAlarmSound(): AlarmSound {
  return readCache().alarmSound;
}

export function getCachedAlarmStyle(): AlarmStyle {
  return readCache().alarmStyle;
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

export async function saveAlarmEnabled(enabled: boolean): Promise<void> {
  writeCache({ alarmEnabled: enabled });
  window.dispatchEvent(new CustomEvent("user-settings-changed", { detail: { alarmEnabled: enabled } }));
  await authService.updateSettings({ alarm_enabled: enabled });
}

export async function saveAlarmSound(sound: AlarmSound): Promise<void> {
  writeCache({ alarmSound: sound });
  window.dispatchEvent(new CustomEvent("user-settings-changed", { detail: { alarmSound: sound } }));
  await authService.updateSettings({ alarm_sound: sound });
}

export async function saveAlarmStyle(style: AlarmStyle): Promise<void> {
  writeCache({ alarmStyle: style });
  window.dispatchEvent(new CustomEvent("user-settings-changed", { detail: { alarmStyle: style } }));
  await authService.updateSettings({ alarm_style: style });
}

export async function saveGlassmorphism(enabled: boolean): Promise<void> {
  writeCache({ glassmorphismEnabled: enabled });
  applyGlassmorphism(enabled);
  await authService.updateSettings({ glassmorphism_enabled: enabled });
}

export function hydrateSettingsCache(
  alarmEnabled: boolean,
  glassmorphismEnabled: boolean = false,
  alarmSound: AlarmSound = "beep",
  alarmStyle: AlarmStyle = "fullscreen",
): void {
  writeCache({ alarmEnabled, glassmorphismEnabled, alarmSound, alarmStyle });
  applyGlassmorphism(glassmorphismEnabled);
}

// Kept for backward compat — InterviewAlertMonitor calls this synchronously.
export function isAlarmEnabled(): boolean {
  return getCachedAlarmEnabled();
}
