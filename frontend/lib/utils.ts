import { STATUS_COLORS } from "./constants";

/**
 * Format an ISO date string to a human-readable format.
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a time string (HH:MM:SS) to 12-hour format.
 */
export function formatTime(timeStr: string | null | undefined): string {
  if (!timeStr) return "—";
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

/**
 * Get status badge styling based on status text.
 */
export function getStatusStyle(status: string | null | undefined, dateStr?: string | null) {
  const label = getStatusLabel(status, dateStr).toLowerCase();
  
  if (label.includes("converted")) return STATUS_COLORS.converted;
  if (label.includes("rejected")) return STATUS_COLORS.rejected;
  if (label.includes("closed")) return STATUS_COLORS.closed;
  if (label === "upcoming") return { bg: "bg-blue-500/10", text: "text-blue-400", dot: "bg-blue-400" };
  
  return STATUS_COLORS.pending;
}

/**
 * Get a short label for a status string.
 */
export function getStatusLabel(status: string | null | undefined, dateStr?: string | null): string {
  if (!status || status.trim() === "") {
    if (dateStr) {
      const d = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d > today) {
        return "Upcoming";
      }
    }
    return "Unresponsed";
  }
  if (status.length > 50) return status.substring(0, 47) + "...";
  return status;
}

/**
 * Truncate text to a max length with ellipsis.
 */
export function truncate(text: string | null | undefined, max: number = 80): string {
  if (!text) return "—";
  if (text.length <= max) return text;
  return text.substring(0, max - 3) + "...";
}

/**
 * Convert a record to chart-friendly array of {name, value}.
 */
export function recordToChartData(record: Record<string, number>): { name: string; value: number }[] {
  return Object.entries(record)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/**
 * Capitalize the first letter of each word.
 */
export function titleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}
