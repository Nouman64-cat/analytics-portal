"use client";

import { useCallback, useEffect, useState } from "react";
import { messagesService } from "@/lib/services";

const POLL_INTERVAL_MS = 20 * 1000;

/** Small unread-count dot for the "Messages" sidebar nav item. No dropdown preview —
 * messaging has its own full page, unlike NotificationBell. */
export default function MessagesNavBadge() {
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchCount = useCallback(async () => {
    try {
      const { unread_count } = await messagesService.getUnreadCount();
      setUnreadCount(unread_count);
    } catch {
      // silently ignore — badge just stays at its last known value
    }
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchCount]);

  if (unreadCount <= 0) return null;

  return (
    <span className="ml-auto inline-flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold leading-none text-white dark:bg-indigo-500">
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  );
}
