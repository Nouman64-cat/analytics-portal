"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, AlertTriangle, X, Clock } from "lucide-react";
import Link from "next/link";
import { notificationsService } from "@/lib/services";
import type { UnresponsiveLeadNotification } from "@/lib/types";

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<UnresponsiveLeadNotification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const data = await notificationsService.getUnresponsiveLeads();
      setNotifications(data);
    } catch {
      // silently ignore — could be network error or permissions
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close panel when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const count = notifications.length;

  function getDaysLabel(days: number) {
    if (days >= 25) return { label: `${days}d`, cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" };
    if (days >= 20) return { label: `${days}d`, cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" };
    return { label: `${days}d`, cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" };
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => { setOpen((v) => !v); if (!open) fetchNotifications(); }}
        className="relative hidden sm:flex rounded-xl p-2.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.05] hover:text-slate-900 dark:hover:text-white transition-all"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white shadow-sm">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-80 rounded-2xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#13151f] shadow-xl shadow-black/10 z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 dark:border-white/[0.06] bg-amber-50 dark:bg-amber-950/30">
            <div className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-amber-500 shrink-0" />
              <span className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">
                Follow-up Required
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="max-h-80 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
                Loading…
              </div>
            ) : count === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-slate-400">
                <Bell size={24} className="opacity-40" />
                <span className="text-sm">No follow-ups needed</span>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-white/[0.04]">
                {notifications.map((n) => {
                  const { label, cls } = getDaysLabel(n.days_unresponsive);
                  return (
                    <li key={n.thread_id} className="px-4 py-3 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold text-slate-900 dark:text-white truncate">
                            {n.company_name}
                          </p>
                          <p className="text-[12px] text-slate-500 dark:text-slate-400 truncate">
                            {n.role}
                            {n.candidate_name ? ` · ${n.candidate_name}` : ""}
                          </p>
                        </div>
                        <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
                          <Clock size={10} />
                          {label}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          {count > 0 && (
            <div className="border-t border-slate-100 dark:border-white/[0.06] px-4 py-2.5 bg-slate-50 dark:bg-white/[0.02]">
              <Link
                href="/leads?outcome=unresponsive"
                onClick={() => setOpen(false)}
                className="block text-center text-[12px] font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
              >
                View all unresponsive leads →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
