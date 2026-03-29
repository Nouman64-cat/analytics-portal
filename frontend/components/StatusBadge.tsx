"use client";

import { getStatusStyle, getStatusLabel } from "@/lib/utils";

interface StatusBadgeProps {
  status: string | null | undefined;
  dateStr?: string | null;
}

export default function StatusBadge({ status, dateStr }: StatusBadgeProps) {
  const style = getStatusStyle(status, dateStr);
  const label = getStatusLabel(status, dateStr);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${style.bg} ${style.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {label}
    </span>
  );
}
