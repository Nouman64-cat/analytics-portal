import { STATUS_COLORS } from "./constants";

export function statusBadge(outcome: string | null | undefined) {
  const key = (outcome || "").toLowerCase();
  const meta = STATUS_COLORS[key] ?? { bg: "#94a3b826", text: "#475569", dot: "#94a3b8" };
  return { label: prettify(outcome), bg: meta.bg, color: meta.text, dot: meta.dot };
}

export function prettify(value: string | null | undefined): string {
  if (!value) return "—";
  return value
    .split(/[_\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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
