"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authService } from "@/lib/services";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authService.forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0a0b10] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Forgot Password</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {submitted
              ? "Check your inbox for a reset link."
              : "Enter your email and we'll send you a reset link."}
          </p>
        </div>

        {submitted ? (
          <div className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-5 sm:p-8 shadow-sm text-center space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              If <span className="font-medium text-slate-900 dark:text-white">{email}</span> is
              registered, a password reset link has been sent. The link expires in 1 hour.
            </p>
            <a
              href="/login"
              className="inline-block text-sm text-indigo-500 hover:text-indigo-400 transition-colors"
            >
              Back to sign in
            </a>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] p-5 sm:p-8 shadow-sm space-y-5"
          >
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@example.com"
                className="w-full rounded-xl border border-slate-200 dark:border-white/[0.08] bg-slate-50 dark:bg-white/[0.03] px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none transition focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-400 dark:placeholder:text-slate-600"
              />
            </div>

            {error && (
              <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 size={15} className="animate-spin" />}
              {loading ? "Sending…" : "Send Reset Link"}
            </button>

            <p className="text-center text-xs text-slate-500 dark:text-slate-500">
              <a href="/login" className="text-indigo-500 hover:text-indigo-400 transition-colors">
                Back to sign in
              </a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
