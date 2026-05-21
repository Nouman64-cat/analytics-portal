export const ACCENT_OPTIONS = [
  { id: "indigo",  label: "Indigo",  hex: "#6366f1" },
  { id: "blue",    label: "Blue",    hex: "#3b82f6" },
  { id: "violet",  label: "Violet",  hex: "#8b5cf6" },
  { id: "rose",    label: "Rose",    hex: "#f43f5e" },
  { id: "emerald", label: "Emerald", hex: "#10b981" },
  { id: "teal",    label: "Teal",    hex: "#14b8a6" },
  { id: "cyan",    label: "Cyan",    hex: "#06b6d4" },
  { id: "amber",   label: "Amber",   hex: "#f59e0b" },
  { id: "orange",  label: "Orange",  hex: "#f97316" },
] as const;

export type AccentId = (typeof ACCENT_OPTIONS)[number]["id"];

const STORAGE_KEY = "app-accent-color";
const DEFAULT: AccentId = "indigo";

export function getAccentColor(): AccentId {
  if (typeof window === "undefined") return DEFAULT;
  const stored = localStorage.getItem(STORAGE_KEY) as AccentId | null;
  return stored && ACCENT_OPTIONS.some((a) => a.id === stored) ? stored : DEFAULT;
}

export function getAccentHex(id: AccentId = getAccentColor()): string {
  return ACCENT_OPTIONS.find((a) => a.id === id)?.hex ?? "#6366f1";
}

export function applyAccentColor(id: AccentId = getAccentColor()): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.accent = id;
}

export function saveAccentColor(id: AccentId): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, id);
  applyAccentColor(id);
  window.dispatchEvent(new CustomEvent("accent-changed", { detail: { id } }));
}

/** Persist accent to the server (call after saveAccentColor). */
export async function persistAccentColor(id: AccentId, alarmEnabled: boolean): Promise<void> {
  // Lazy import to avoid circular deps
  const { authService } = await import("./services");
  await authService.updateSettings({ alarm_enabled: alarmEnabled, accent_color: id });
}
