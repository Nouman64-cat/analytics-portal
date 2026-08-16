/** Launch dates (ISO, local) for features that should show a "New" tag for 7 days. */
const NEW_FEATURE_LAUNCHES: Record<string, string> = {
  "/performance": "2026-08-16",
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function isNewFeature(href: string): boolean {
  const launch = NEW_FEATURE_LAUNCHES[href];
  if (!launch) return false;
  return Date.now() - new Date(`${launch}T00:00:00`).getTime() < SEVEN_DAYS_MS;
}
