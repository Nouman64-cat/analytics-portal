"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, Eye, EyeOff, Wand2, Sparkles, Mail, KeyRound,
  Moon, ShieldCheck, Stars,
} from "lucide-react";
import { authService } from "@/lib/services";
import { setToken, isAuthenticated } from "@/lib/auth";
import MagicBackdrop from "@/components/MagicBackdrop";

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
        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/70 font-wizard"
      >
        {label}
      </label>
      <div
        className={`relative flex items-center rounded-xl border transition-all duration-200 ${
          focused
            ? "border-amber-300/60 bg-amber-50/[0.06] shadow-[0_0_0_3px_rgba(226,168,74,0.15)]"
            : "border-amber-200/15 bg-white/[0.03] hover:border-amber-200/30 hover:bg-white/[0.05]"
        }`}
      >
        <div
          className={`flex-shrink-0 flex items-center justify-center w-11 h-full pl-3.5 transition-colors duration-200 ${
            focused ? "text-amber-300" : "text-amber-200/45"
          }`}
        >
          <Icon size={16} />
        </div>
        <div
          className={`w-px self-stretch my-2.5 transition-colors duration-200 ${
            focused ? "bg-amber-300/40" : "bg-amber-200/10"
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
          className="flex-1 bg-transparent px-3.5 py-3 text-sm text-amber-50 outline-none placeholder:text-amber-100/25 min-w-0"
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
    <div className="w-full min-h-screen flex bg-[#07060f] text-amber-50">
      {/* ── Left: enchanted night sky ── */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden flex-col">
        <MagicBackdrop />
        <div className="relative z-10 flex flex-col justify-between h-full p-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-200/10 backdrop-blur-sm border border-amber-200/25 flex items-center justify-center shadow-lg animate-halo">
              <Wand2 size={18} className="text-amber-200" />
            </div>
            <div>
              <span className="font-wizard font-bold text-amber-100 text-sm block leading-tight tracking-wide">
                Interview Management
              </span>
              <span className="text-amber-200/50 text-[10px] uppercase tracking-[0.28em]">Portal</span>
            </div>
          </div>

          <div className="max-w-sm">
            <div className="flex flex-wrap gap-2 mb-5">
              {["Analytics", "Candidates", "Insights"].map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-200/[0.06] text-amber-100/80 border border-amber-200/20 backdrop-blur-sm"
                >
                  <Sparkles size={10} className="text-amber-300" />
                  {tag}
                </span>
              ))}
            </div>
            <h2 className="font-wizard text-enchanted font-bold text-[26px] leading-snug">
              Every candidate&apos;s tale, written in the stars.
            </h2>
            <p className="mt-3 text-amber-100/55 text-sm leading-relaxed">
              Track interviews, follow the trail, and make each hiring decision by candlelight. ✦
            </p>
            <div className="mt-6 flex items-center gap-4 text-amber-200/40 text-xs">
              <span className="flex items-center gap-1.5"><Moon size={13} /> Night mode, always</span>
              <span className="flex items-center gap-1.5"><Stars size={13} /> Charmed &amp; secure</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: sign-in ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative overflow-hidden bg-[#0a0812]">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(600px 400px at 70% 0%, rgba(226,168,74,0.10), transparent 60%), radial-gradient(500px 500px at 0% 100%, rgba(124,58,237,0.12), transparent 60%)",
          }}
        />
        <div className="w-full max-w-[420px] animate-fade-in relative">
          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-xl bg-amber-200/10 border border-amber-200/25 flex items-center justify-center">
              <Wand2 size={16} className="text-amber-200" />
            </div>
            <div>
              <span className="font-wizard font-bold text-amber-100 text-sm block leading-tight">
                Interview Management
              </span>
              <span className="text-amber-200/50 text-[10px] uppercase tracking-[0.28em]">Portal</span>
            </div>
          </div>

          {/* Header */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-200/[0.07] border border-amber-200/20 mb-4">
              <Sparkles size={11} className="text-amber-300 animate-twinkle-soft" />
              <span className="text-[11px] font-medium text-amber-200/80 font-wizard tracking-wide">
                The portal awaits
              </span>
            </div>
            <h1 className="font-wizard text-enchanted text-[30px] font-bold tracking-tight leading-tight">
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-amber-100/55">
              Speak the words and the door shall open.
            </p>
          </div>

          {/* Form card */}
          <div className="relative rounded-2xl border border-amber-200/15 bg-white/[0.025] p-6 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm">
            <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent" />
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
                placeholder="Your secret incantation"
                required
                icon={KeyRound}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    className="p-1.5 rounded-lg text-amber-200/50 hover:text-amber-200 hover:bg-amber-200/10 transition-all"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                }
              />

              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={() => router.push("/forgot-password")}
                  className="text-xs font-medium text-amber-300/80 hover:text-amber-200 transition-colors"
                >
                  Forgotten the incantation?
                </button>
              </div>

              {error && (
                <div className="animate-float-up flex items-start gap-3 rounded-xl bg-red-500/10 border border-red-400/25 px-4 py-3">
                  <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-red-300 text-[10px] font-bold">!</span>
                  </div>
                  <p className="text-xs text-red-300 leading-relaxed">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="relative w-full overflow-hidden flex items-center justify-center gap-2.5 rounded-xl px-4 py-3.5 text-sm font-semibold text-[#2a1c05] font-wizard tracking-wide transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed mt-2 animate-halo"
                style={{
                  background: loading
                    ? "#c9a24a"
                    : "linear-gradient(135deg,#b8860b 0%,#e2a84a 45%,#f7e08a 100%)",
                }}
              >
                {!loading && (
                  <span className="absolute inset-y-0 -left-1/3 w-1/3 animate-wizard-shimmer pointer-events-none bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                )}
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
                <span>{loading ? "Unlocking…" : "Alohomora"}</span>
              </button>
            </form>
          </div>

          {/* Trust badges */}
          <div className="mt-6 flex items-center justify-center gap-4">
            <div className="flex items-center gap-1.5 text-[11px] text-amber-200/40">
              <ShieldCheck size={13} className="text-emerald-400/80" />
              Protected by ancient magic
            </div>
            <span className="w-px h-3.5 bg-amber-200/15" />
            <div className="flex items-center gap-1.5 text-[11px] text-amber-200/40">
              <Sparkles size={12} className="text-amber-300/80" />
              Made with care
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
