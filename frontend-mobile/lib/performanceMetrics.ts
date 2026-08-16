import type { LeadListItem, Interview } from "./types";

/**
 * Terminology note: leads use outcome "active" for in-progress opportunities (labeled
 * "Progressed" in the UI); interviews use computed_status containing "converted" or
 * "progressed" for the same concept. Mirrors frontend/app/performance/page.tsx exactly.
 */
export interface OutcomeMetrics {
  total: number;
  legit: number;
  closed: number;
  rejected: number;
  progressed: number;
  unresponsive: number;
  dropped: number;
  finalRounds: number;
}

export function pct(count: number, denom: number): number {
  return denom > 0 ? Math.round((count / denom) * 1000) / 10 : 0;
}

export function computeLeadsMetrics(rows: LeadListItem[]): OutcomeMetrics {
  const total = rows.length;
  const dropped = rows.filter((l) => l.lead_outcome === "dropped").length;
  const legit = total - dropped;
  const closed = rows.filter((l) => l.lead_outcome === "closed").length;
  const rejected = rows.filter((l) => l.lead_outcome === "rejected" || l.lead_outcome === "dead").length;
  const unresponsive = rows.filter((l) => l.lead_outcome === "unresponsive").length;
  const progressed = rows.filter((l) => l.lead_outcome === "active").length;
  const finalRounds = rows.filter((l) => l.last_round?.toLowerCase().includes("final")).length;
  return { total, legit, closed, rejected, progressed, unresponsive, dropped, finalRounds };
}

export function computeInterviewsMetrics(rows: Interview[]): OutcomeMetrics {
  const total = rows.length;
  const dropped = rows.filter((i) => i.lead_outcome === "dropped").length;
  const legit = total - dropped;
  let closed = 0;
  let rejected = 0;
  let unresponsive = 0;
  let progressed = 0;
  rows.forEach((i) => {
    const label = i.computed_status.toLowerCase();
    if (label === "upcoming") return;
    else if (label === "unresponsed") unresponsive++;
    else if (label.includes("converted") || label.includes("progressed")) progressed++;
    else if (label.includes("rejected")) rejected++;
    else if (label === "dead") rejected++;
    else if (label.includes("closed")) closed++;
    // "dropped" computed_status rows are already captured via lead_outcome above
  });
  const finalRounds = rows.filter((i) => i.round?.toLowerCase().includes("final")).length;
  return { total, legit, closed, rejected, progressed, unresponsive, dropped, finalRounds };
}

/** label + fill color, in display order — matches frontend's METRIC_ORDER/METRIC_STYLE. */
export const METRIC_STYLE = [
  { key: "closed", label: "Closing", color: "#10b981" },
  { key: "progressed", label: "Progressed", color: "#8b5cf6" },
  { key: "rejected", label: "Rejection", color: "#ef4444" },
  { key: "unresponsive", label: "Unresponsed", color: "#f59e0b" },
] as const;

export const DROPPED_COLOR = "#3b82f6";

export const PERFORMANCE_ROLES = new Set(["superadmin", "dept-lead", "bd-team-lead"]);
