"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, Eye, EyeOff, Sparkles, Mail, KeyRound, ShieldCheck, Heart, LogIn, BarChart3,
} from "lucide-react";
import { authService } from "@/lib/services";
import { setToken, isAuthenticated } from "@/lib/auth";
import JellyBlob from "@/components/JellyBlob";

/* ─── Themed form input ──────────────────────────────── */
function FormInput({
  id, label, type, value, onChange, placeholder, required, autoFocus,
  icon: Icon, rightSlot,
}: {
  id: string; label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder: string;
  required?: boolean; autoFocus?: boolean;
  icon: React.ElementType; rightSlot?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"
      >
        {label}
      </label>
      <div
        className={`relative flex items-center rounded-xl border transition-all duration-200 ${
          focused
            ? "border-pink-300 bg-white shadow-[0_0_0_4px_rgba(244,114,182,0.15)]"
            : "border-slate-200 bg-white hover:border-slate-300"
        }`}
      >
        <div
          className={`flex-shrink-0 flex items-center justify-center w-11 h-full pl-3.5 transition-colors duration-200 ${
            focused ? "text-pink-500" : "text-slate-400"
          }`}
        >
          <Icon size={16} />
        </div>
        <div
          className={`w-px self-stretch my-2.5 transition-colors duration-200 ${
            focused ? "bg-pink-200" : "bg-slate-200"
          }`}
        />
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="flex-1 bg-transparent px-3.5 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 min-w-0"
        />
        {rightSlot && <div className="pr-3">{rightSlot}</div>}
      </div>
    </div>
  );
}

/* ─── Login Page ──────────────────────────────────────── */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [squishes, setSquishes] = useState(0);

  useEffect(() => {
    if (isAuthenticated()) router.replace("/");
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await authService.login(email, password);
      setToken(data.access_token, data.must_change_password);
      router.replace(data.must_change_password ? "/change-password" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full min-h-screen flex bg-[#fbf8f6] text-slate-800">
      {/* ── Left: stress-relief jelly ── */}
      <div
        className="hidden lg:flex lg:w-[52%] relative overflow-hidden flex-col"
        style={{
          background:
            "radial-gradient(700px 500px at 20% 10%, #ffe4ef 0%, transparent 60%), radial-gradient(600px 500px at 90% 30%, #ede9fe 0%, transparent 60%), radial-gradient(700px 400px at 50% 100%, #fff1e6 0%, transparent 60%), #fdf7fa",
        }}
      >
        <JellyBlob onSquish={() => setSquishes((n) => n + 1)} />
        <div className="relative z-10 flex flex-col h-full p-10 pointer-events-none">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/80 border border-pink-100 flex items-center justify-center shadow-sm">
                <BarChart3 size={18} className="text-pink-500" />
              </div>
              <div>
                <span className="font-bold text-slate-800 text-sm block leading-tight">
                  Interview Management
                </span>
                <span className="text-slate-400 text-[10px] uppercase tracking-[0.28em]">Portal</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-white/80 border border-pink-100 px-3 py-1 text-xs font-medium text-pink-600 shadow-sm tabular-nums">
              <Heart size={12} className="fill-pink-400 text-pink-400" />
              {squishes} {squishes === 1 ? "squish" : "squishes"}
            </div>
          </div>

          <div className="mt-12 max-w-sm">
            <h2 className="font-bold text-[28px] leading-snug text-slate-800">
              Take a breath.
            </h2>
            <p className="mt-3 text-slate-500 text-sm leading-relaxed">
              Grab the jelly, stretch it, fling it, poke it. It always bounces back, and so will you.
            </p>
          </div>
        </div>
      </div>

      {/* ── Right: sign-in ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative overflow-hidden bg-white">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(500px 360px at 80% 0%, rgba(244,114,182,0.08), transparent 60%), radial-gradient(500px 500px at 0% 100%, rgba(167,139,250,0.08), transparent 60%)",
          }}
        />
        <div className="w-full max-w-[420px] animate-fade-in relative">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-xl bg-pink-50 border border-pink-100 flex items-center justify-center">
              <BarChart3 size={16} className="text-pink-500" />
            </div>
            <div>
              <span className="font-bold text-slate-800 text-sm block leading-tight">
                Interview Management
              </span>
              <span className="text-slate-400 text-[10px] uppercase tracking-[0.28em]">Portal</span>
            </div>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-[30px] font-bold tracking-tight leading-tight text-slate-900">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Sign in to continue to your dashboard.
            </p>
          </div>

          {/* Form card */}
          <div className="relative rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
            <form onSubmit={handleSubmit} className="space-y-4">
              <FormInput
                id="login-email"
                label="Email Address"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                required
                autoFocus
                icon={Mail}
              />

              <FormInput
                id="login-password"
                label="Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={setPassword}
                placeholder="Your password"
                required
                icon={KeyRound}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                }
              />

              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={() => router.push("/forgot-password")}
                  className="text-xs font-medium text-pink-600 hover:text-pink-700 transition-colors"
                >
                  Forgot password?
                </button>
              </div>

              {error && (
                <div className="animate-float-up flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                  <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-red-600 text-[10px] font-bold">!</span>
                  </div>
                  <p className="text-xs text-red-600 leading-relaxed">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2.5 rounded-xl px-4 py-3.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(236,72,153,0.25)] transition-all duration-200 hover:brightness-105 hover:shadow-[0_10px_28px_rgba(236,72,153,0.32)] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                style={{ background: "linear-gradient(135deg,#f472b6 0%,#ec4899 45%,#a78bfa 100%)" }}
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
                <span>{loading ? "Signing in…" : "Sign in"}</span>
              </button>
            </form>
          </div>

          {/* Trust badges */}
          <div className="mt-6 flex items-center justify-center gap-4">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <ShieldCheck size={13} className="text-emerald-500" />
              Secure sign-in
            </div>
            <span className="w-px h-3.5 bg-slate-200" />
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <Sparkles size={12} className="text-pink-400" />
              Made with care
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
