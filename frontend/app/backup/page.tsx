"use client";

import { useCallback, useEffect, useState } from "react";
import { Database, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { backupService } from "@/lib/services";
import { getUserRole } from "@/lib/auth";
import type { DatabaseBackupListItem, DatabaseBackupResult } from "@/lib/types";
import { PageLoader, ErrorState, PageHeader } from "@/components/PageStates";
import { buttonPrimary, buttonSecondary } from "@/components/Modal";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export default function BackupPage() {
  const role = getUserRole();
  const isSuperadmin = role === "superadmin";

  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [items, setItems] = useState<DatabaseBackupListItem[]>([]);
  const [listUnavailableReason, setListUnavailableReason] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<DatabaseBackupResult | null>(null);

  const loadList = useCallback(async () => {
    if (!isSuperadmin) return;
    try {
      setListError(null);
      const res = await backupService.list();
      setItems(res.items);
      setListUnavailableReason(res.list_unavailable_reason ?? null);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to list backups");
      setListUnavailableReason(null);
    }
  }, [isSuperadmin]);

  useEffect(() => {
    if (!isSuperadmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    loadList().finally(() => setLoading(false));
  }, [isSuperadmin, loadList]);

  const runBackup = async () => {
    setRunError(null);
    setLastResult(null);
    setRunning(true);
    try {
      const res = await backupService.create();
      setLastResult(res);
      await loadList();
    } catch (e) {
      setRunError(e instanceof Error ? e.message : "Backup failed");
    } finally {
      setRunning(false);
    }
  };

  if (!isSuperadmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Database backup"
          subtitle="PostgreSQL dump uploaded to your configured S3 bucket."
        />
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-amber-500/25 bg-amber-500/5 px-6 py-16 text-center">
          <ShieldAlert className="h-12 w-12 text-amber-500" aria-hidden />
          <p className="max-w-md text-sm text-slate-600 dark:text-slate-400">
            Access denied. Only superadmins can create backups and view stored files.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return <PageLoader />;
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Database backup"
        subtitle="Runs pg_dump on the server, gzips the SQL, and uploads to S3 (prefix backups/). The pg_dump client major version must be ≥ the database server (set PG_DUMP_PATH in backend .env if you have multiple versions)."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadList()}
              disabled={running}
              className={buttonSecondary}
            >
              <RefreshCw size={16} className="inline-block -mt-0.5 mr-1.5" aria-hidden />
              Refresh list
            </button>
            <button
              type="button"
              onClick={() => void runBackup()}
              disabled={running}
              className={buttonPrimary}
            >
              {running ? (
                <Loader2 size={16} className="inline-block animate-spin mr-2" aria-hidden />
              ) : (
                <Database size={16} className="inline-block -mt-0.5 mr-2" aria-hidden />
              )}
              Run backup now
            </button>
          </div>
        }
      />

      {runError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {runError}
        </div>
      )}

      {lastResult && (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          <p className="font-medium text-emerald-50">Backup completed</p>
          <p className="mt-1 text-emerald-200/90">
            Stored as <code className="rounded bg-black/20 px-1.5 py-0.5 text-xs">{lastResult.s3_key}</code> in bucket{" "}
            <code className="rounded bg-black/20 px-1.5 py-0.5 text-xs">{lastResult.bucket}</code> ({formatBytes(lastResult.size_bytes)}).
          </p>
        </div>
      )}

      {listError && (
        <ErrorState message={listError} onRetry={() => void loadList()} />
      )}

      {!listError && listUnavailableReason && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100/90">
          <p className="font-medium text-amber-900 dark:text-amber-50">Backup list unavailable</p>
          <p className="mt-1 text-amber-900/90 dark:text-amber-100/80">{listUnavailableReason}</p>
        </div>
      )}

      {!listError && (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/[0.08] bg-white dark:bg-[#12141c] shadow-sm">
          <div className="border-b border-slate-200 dark:border-white/[0.06] px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent backups in S3</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Newest first (up to 50 objects matching <code className="text-[11px]">backups/*.sql.gz</code>)
            </p>
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              No backup files found yet. Run a backup to create the first object.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-white/[0.06] text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-3 font-medium">S3 key</th>
                    <th className="px-4 py-3 font-medium">Size</th>
                    <th className="px-4 py-3 font-medium">Last modified (UTC)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/[0.06]">
                  {items.map((row) => (
                    <tr key={row.s3_key} className="text-slate-800 dark:text-slate-200">
                      <td className="px-4 py-3 font-mono text-xs break-all">{row.s3_key}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {row.size_bytes != null ? formatBytes(row.size_bytes) : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">
                        {row.last_modified ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
