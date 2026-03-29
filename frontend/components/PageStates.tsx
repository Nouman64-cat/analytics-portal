"use client";

import { Loader2 } from "lucide-react";

export function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center">
      <Loader2 size={32} className="animate-spin text-indigo-400" />
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[40vh] flex-col items-center justify-center gap-2">
      <div className="h-16 w-16 rounded-2xl bg-white/[0.03] flex items-center justify-center">
        <span className="text-2xl">📋</span>
      </div>
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex h-[40vh] flex-col items-center justify-center gap-3">
      <div className="h-16 w-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
        <span className="text-2xl">⚠️</span>
      </div>
      <p className="text-sm text-red-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg bg-white/[0.06] px-4 py-2 text-xs font-medium text-white hover:bg-white/[0.1] transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
        {subtitle && (
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}
