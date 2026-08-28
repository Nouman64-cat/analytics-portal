"use client";

import { useState } from "react";
import {
  Loader2, Wand2, Sparkles, Mail, ArrowRight, CheckCircle2,
  ShieldCheck, Feather, ScrollText,
} from "lucide-react";
import { authService } from "@/lib/services";
import MagicBackdrop from "@/components/MagicBackdrop";

/* ─── Themed form input ──────────────────────────────── */
function FormInput({
  id, label, type, value, onChange, placeholder, required, autoFocus, icon: Icon,
}: {
  id: string; label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder: string;
  required?: boolean; autoFocus?: boolean; icon: React.ElementType;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200/70 font-wizard"
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
      </div>
    </div>
  );
}

/* ─── Forgot Password Page ─────────────────────────── */
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
    <div className="w-full min-h-screen flex bg-[#07060f] text-amber-50">
      {/* ── Left panel ── */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden flex-col">
        <MagicBackdrop />
        <div className="relative z-10 flex flex-col justify-between h-full p-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-200/10 backdrop-blur-sm border border-amber-200/25 flex items-center justify-center shadow-lg">
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
            <div className="w-12 h-12 rounded-2xl bg-amber-200/10 backdrop-blur-sm border border-amber-200/20 flex items-center justify-center mb-4 animate-levitate">
              <Feather size={22} className="text-amber-200" />
            </div>
            <h2 className="font-wizard text-enchanted font-bold text-[24px] leading-snug mb-2">
              Owl Post
            </h2>
            <p className="text-amber-100/55 text-sm leading-relaxed">
              We&apos;ll send an owl carrying a sealed recovery scroll to your inbox, so you can regain
              entry to the castle.
            </p>
            <div className="mt-6 space-y-3">
              {[
                { n: "1", t: "Whisper your email address below" },
                { n: "2", t: "Watch for the owl bearing your scroll" },
                { n: "3", t: "Enchant a new password" },
              ].map((step) => (
                <div key={step.n} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-amber-200/10 border border-amber-200/25 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-amber-200 font-wizard">{step.n}</span>
                  </div>
                  <span className="text-amber-100/45 text-xs">{step.t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
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

          {submitted ? (
            <div className="animate-fade-in space-y-6">
              <div className="flex justify-center">
                <div className="relative">
                  <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-400/25 flex items-center justify-center animate-halo">
                    <CheckCircle2 size={36} className="text-emerald-400" />
                  </div>
                  <div className="absolute -inset-1 rounded-3xl bg-emerald-400/10 blur-lg" />
                </div>
              </div>

              <div className="text-center">
                <h1 className="font-wizard text-enchanted text-[26px] font-bold tracking-tight">
                  The owl is away!
                </h1>
                <p className="mt-2 text-sm text-amber-100/55 leading-relaxed">
                  A recovery scroll flies to{" "}
                  <span className="font-semibold text-amber-300">{email}</span>
                </p>
              </div>

              <div className="rounded-2xl border border-amber-200/15 bg-white/[0.02] p-5 space-y-3">
                {[
                  "The scroll seals itself after 1 hour",
                  "Check the spam dungeon if it hasn't arrived",
                  "The enchantment works only once",
                ].map((note) => (
                  <div key={note} className="flex items-center gap-3 text-xs text-amber-100/55">
                    <Sparkles size={11} className="text-amber-300 flex-shrink-0" />
                    {note}
                  </div>
                ))}
              </div>

              <a
                href="/login"
                className="flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-[#2a1c05] font-wizard tracking-wide transition-all hover:brightness-110 active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg,#b8860b 0%,#e2a84a 45%,#f7e08a 100%)" }}
              >
                <ArrowRight size={16} />
                Back to the gates
              </a>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-200/[0.07] border border-amber-200/20 mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />
                  <span className="text-[11px] font-medium text-amber-200/80 font-wizard tracking-wide">
                    Account Recovery
                  </span>
                </div>
                <h1 className="font-wizard text-enchanted text-[30px] font-bold tracking-tight leading-tight">
                  Lost your incantation?
                </h1>
                <p className="mt-2 text-sm text-amber-100/55">
                  No trouble — we&apos;ll send an owl with a reset scroll.
                </p>
              </div>

              <div className="relative rounded-2xl border border-amber-200/15 bg-white/[0.025] p-6 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm">
                <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent" />
                <form onSubmit={handleSubmit} className="space-y-4">
                  <FormInput
                    id="forgot-email"
                    label="Email Address"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@example.com"
                    required
                    autoFocus
                    icon={Mail}
                  />

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
                    className="relative w-full overflow-hidden flex items-center justify-center gap-2.5 rounded-xl px-4 py-3.5 text-sm font-semibold text-[#2a1c05] font-wizard tracking-wide transition-all duration-200 hover:brightness-110 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed animate-halo"
                    style={{
                      background: loading
                        ? "#c9a24a"
                        : "linear-gradient(135deg,#b8860b 0%,#e2a84a 45%,#f7e08a 100%)",
                    }}
                  >
                    {!loading && (
                      <span className="absolute inset-y-0 -left-1/3 w-1/3 animate-wizard-shimmer pointer-events-none bg-gradient-to-r from-transparent via-white/60 to-transparent" />
                    )}
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Feather size={16} />}
                    <span>{loading ? "Summoning the owl…" : "Send the Owl"}</span>
                  </button>

                  <p className="text-center text-xs text-amber-200/45 pt-0.5">
                    Remembered it after all?{" "}
                    <a href="/login" className="font-medium text-amber-300/90 hover:text-amber-200 transition-colors">
                      Return to the gates
                    </a>
                  </p>
                </form>
              </div>

              <div className="mt-6 flex items-center justify-center gap-4">
                <div className="flex items-center gap-1.5 text-[11px] text-amber-200/40">
                  <ShieldCheck size={13} className="text-emerald-400/80" />
                  Sealed with wax and spell
                </div>
                <span className="w-px h-3.5 bg-amber-200/15" />
                <div className="flex items-center gap-1.5 text-[11px] text-amber-200/40">
                  <ScrollText size={12} className="text-amber-300/80" />
                  Single-use scroll
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
