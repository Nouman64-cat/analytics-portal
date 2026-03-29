"use client";

import { getStatusStyle, getStatusLabel } from "@/lib/utils";

interface StatusBadgeProps {
  status: string | null | undefined;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = getStatusStyle(status);
  const label = getStatusLabel(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${style.bg} ${style.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      {label}
    </span>
  );
}
