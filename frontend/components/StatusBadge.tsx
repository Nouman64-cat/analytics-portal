"use client";

import { getStatusStyle, getStatusLabel } from "@/lib/utils";

interface StatusBadgeProps {
  status: string | null | undefined;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const style = getStatusStyle(status);
  const label = getStatusLabel(status);

  const isUpcoming = label.toLowerCase() === "upcoming";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${style.bg} ${style.text}`}
    >
      {isUpcoming ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${style.dot} opacity-75`} />
          <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${style.dot}`} />
        </span>
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} />
      )}
      {label}
    </span>
  );
}
