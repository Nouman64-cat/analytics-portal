interface BadgeStyle {
  bg: string;
  color: string;
  dot: string;
}

const SLATE: BadgeStyle = { bg: "#64748b1a", color: "#475569", dot: "#94a3b8" };
const BLUE: BadgeStyle = { bg: "#3b82f626", color: "#1d4ed8", dot: "#3b82f6" };
const AMBER: BadgeStyle = { bg: "#f59e0b26", color: "#b45309", dot: "#f59e0b" };
const RED: BadgeStyle = { bg: "#ef444426", color: "#dc2626", dot: "#f87171" };
const EMERALD: BadgeStyle = { bg: "#10b98126", color: "#047857", dot: "#10b981" };
const STONE: BadgeStyle = { bg: "#78716c26", color: "#57534e", dot: "#a8a29e" };
const VIOLET: BadgeStyle = { bg: "#8b5cf626", color: "#7c3aed", dot: "#d946ef" };

export function prettify(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .split(/[_\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Interview round status (Interview.computed_status). Mirrors frontend/lib/utils.ts
 * getStatusLabel/getStatusStyle: "converted" is user-facing as "Progressed" — an interview
 * round that has moved forward isn't "converted", the lead thread it belongs to is.
 */
export function interviewStatusBadge(status: string | null | undefined): { label: string; bg: string; color: string; dot: string } {
  const raw = status?.trim() || "";
  const label = !raw ? "Unresponsed" : raw.toLowerCase() === "converted" ? "Progressed" : raw;
  const lower = label.toLowerCase();

  let style = SLATE;
  if (lower === "unresponsed") style = AMBER;
  else if (lower === "upcoming") style = BLUE;
  else if (lower.includes("converted") || lower.includes("progressed")) style = VIOLET;
  else if (lower.includes("rejected")) style = RED;
  else if (lower.includes("dropped")) style = AMBER;
  else if (lower.includes("closed")) style = EMERALD;
  else if (lower === "dead") style = STONE;

  return { label, ...style };
}

/**
 * Lead thread outcome (LeadListItem.lead_outcome). The display TEXT should come from the
 * backend's own `lead_status_label` field (already human-readable, e.g. "Converted") rather
 * than being re-derived here — this function only supplies the color for a given raw outcome.
 * Mirrors frontend/lib/utils.ts getLeadOutcomeBadgeStyle.
 */
export function leadOutcomeStyle(outcome: string | null | undefined): BadgeStyle {
  const o = (outcome || "").toLowerCase();
  if (o === "active" || o === "in_pipeline") return BLUE;
  if (o === "unresponsive") return AMBER;
  if (o === "rejected") return RED;
  if (o === "dropped") return AMBER;
  if (o === "closed") return EMERALD;
  if (o === "dead") return STONE;
  if (o === "converted") return VIOLET;
  return SLATE;
}

export function leadOutcomeBadge(outcome: string | null | undefined, label: string | null | undefined) {
  return { label: label || "—", ...leadOutcomeStyle(outcome) };
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
