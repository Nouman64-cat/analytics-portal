/** Launch dates (ISO, local) for features that should show a "New" tag. Defaults to 7
 * days visible; pass `days` to override (e.g. a bigger launch that deserves more runway). */
const NEW_FEATURE_LAUNCHES: Record<string, { launch: string; days?: number }> = {
  "/performance": { launch: "2026-08-16" },
  "/jarvis": { launch: "2026-08-26", days: 30 },
};

const DEFAULT_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export function isNewFeature(href: string): boolean {
  const entry = NEW_FEATURE_LAUNCHES[href];
  if (!entry) return false;
  const windowMs = (entry.days ?? DEFAULT_DAYS) * DAY_MS;
  return Date.now() - new Date(`${entry.launch}T00:00:00`).getTime() < windowMs;
}
