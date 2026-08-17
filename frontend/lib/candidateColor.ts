/** Palette used to derive a stable fallback color for candidates without one set. */
export const CANDIDATE_COLOR_PALETTE = [
  "#6366f1", // indigo
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#f43f5e", // rose
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#f59e0b", // amber
  "#f97316", // orange
  "#ec4899", // pink
  "#84cc16", // lime
  "#a855f7", // purple
  "#0ea5e9", // sky
  "#d946ef", // fuchsia
] as const;

function hashToColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const index = Math.abs(hash) % CANDIDATE_COLOR_PALETTE.length;
  return CANDIDATE_COLOR_PALETTE[index];
}

/**
 * A candidate's color: their own `color` if set, otherwise a deterministic pick
 * from the palette based on their id, so every candidate reads as visually
 * distinct even before anyone has manually assigned a color.
 */
export function getCandidateColor(candidate: { id: string; color?: string | null }): string {
  if (candidate.color) return candidate.color;
  return hashToColor(candidate.id);
}

/** Same deterministic palette pick, for resume profiles (which have no `color` field). */
export function getProfileColor(profile: { id: string }): string {
  return hashToColor(profile.id);
}

/** Same deterministic palette pick, for business developers (which have no `color` field). */
export function getBdColor(bd: { id: string }): string {
  return hashToColor(bd.id);
}
