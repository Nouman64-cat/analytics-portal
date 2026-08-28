"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2, Eye, EyeOff, Wand2, Sparkles, ShieldCheck,
  CheckCircle2, Lock, ArrowRight, KeyRound,
} from "lucide-react";
import { authService } from "@/lib/services";
import MagicBackdrop from "@/components/MagicBackdrop";

/* ─── Themed form input ──────────────────────────────── */
function FormInput({
  id, label, type, value, onChange, placeholder, required, autoFocus, icon: Icon, rightSlot,
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
        {rightSlot && <div className="pr-3">{rightSlot}</div>}
      </div>
    </div>
  );
}

/* ─── Password strength ─────────────────────────────── */
function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ runes", ok: password.length >= 8 },
    { label: "Uppercase", ok: /[A-Z]/.test(password) },
    { label: "Number", ok: /\d/.test(password) },
  ];
  const score = checks.filter((c) => c.ok).length;
  const barColors = ["bg-red-500", "bg-amber-500", "bg-emerald-500"];
  const textColors = ["text-red-400", "text-amber-400", "text-emerald-400"];
  const labels = ["Fragile", "Steady", "Formidable"];
  if (!password) return null;
  return (
    <div className="space-y-1.5 animate-float-up">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-500 ${
              i < score ? barColors[score - 1] : "bg-amber-200/10"
            }`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          {checks.map((c) => (
            <span
              key={c.label}
              className={`text-[10px] transition-colors ${
                c.ok ? "text-emerald-400" : "text-amber-200/30"
              }`}
            >
              {c.ok ? "✓" : "·"} {c.label}
            </span>
          ))}
        </div>
        {score > 0 && (
          <span className={`text-[10px] font-semibold ${textColors[score - 1]}`}>
            {labels[score - 1]}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Reset Password Form ─────────────────────────── */
function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) router.replace("/login");
  }, [token, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      await authService.resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
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
            The charm is set!
          </h1>
          <p className="mt-2 text-sm text-amber-100/55 leading-relaxed">
            Your new incantation is bound to your account. You may now enter the castle.
          </p>
        </div>
        <a
          href="/login"
          className="flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-[#2a1c05] font-wizard tracking-wide transition-all hover:brightness-110 active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg,#b8860b 0%,#e2a84a 45%,#f7e08a 100%)" }}
        >
          <ArrowRight size={16} />
          Go to the gates
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-200/[0.07] border border-amber-200/20 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-300 animate-pulse" />
          <span className="text-[11px] font-medium text-amber-200/80 font-wizard tracking-wide">
            Secure Reset
          </span>
        </div>
        <h1 className="font-wizard text-enchanted text-[30px] font-bold tracking-tight leading-tight">
          Enchant a new password
        </h1>
        <p className="mt-2 text-sm text-amber-100/55">
          Choose a strong new incantation to guard your account.
        </p>
      </div>

      <div className="relative rounded-2xl border border-amber-200/15 bg-white/[0.025] p-6 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <div className="absolute -top-px left-8 right-8 h-px bg-gradient-to-r from-transparent via-amber-300/50 to-transparent" />
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormInput
            id="new-password"
            label="New Password"
            type={showNew ? "text" : "password"}
            value={newPassword}
            onChange={setNewPassword}
            placeholder="Min. 8 characters"
            required
            autoFocus
            icon={KeyRound}
            rightSlot={
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                tabIndex={-1}
                className="p-1.5 rounded-lg text-amber-200/50 hover:text-amber-200 hover:bg-amber-200/10 transition-all"
              >
                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            }
          />
          {newPassword && <PasswordStrength password={newPassword} />}

          <FormInput
            id="confirm-password"
            label="Confirm Password"
            type={showConfirm ? "text" : "password"}
            value={confirm}
            onChange={setConfirm}
            placeholder="Re-enter password"
            required
            icon={Lock}
            rightSlot={
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                tabIndex={-1}
                className="p-1.5 rounded-lg text-amber-200/50 hover:text-amber-200 hover:bg-amber-200/10 transition-all"
              >
                {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            }
          />
          {confirm && (
            <p
              className={`text-[11px] font-medium animate-float-up ${
                newPassword === confirm ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {newPassword === confirm ? "✓ The incantations match" : "✗ The incantations differ"}
            </p>
          )}

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
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            <span>{loading ? "Casting…" : "Seal the Spell"}</span>
          </button>

          <p className="text-center text-xs text-amber-200/45 pt-0.5">
            Remembered your password?{" "}
            <a href="/login" className="font-medium text-amber-300/90 hover:text-amber-200 transition-colors">
              Return to the gates
            </a>
          </p>
        </form>
      </div>

      <div className="mt-6 flex items-center justify-center gap-4">
        <div className="flex items-center gap-1.5 text-[11px] text-amber-200/40">
          <ShieldCheck size={13} className="text-emerald-400/80" />
          Bound by protective charms
        </div>
        <span className="w-px h-3.5 bg-amber-200/15" />
        <div className="flex items-center gap-1.5 text-[11px] text-amber-200/40">
          <Lock size={12} className="text-amber-300/80" />
          End-to-end encrypted
        </div>
      </div>
    </>
  );
}

/* ─── Reset Password Page ─────────────────────────── */
export default function ResetPasswordPage() {
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
              <ShieldCheck size={22} className="text-amber-200" />
            </div>
            <h2 className="font-wizard text-enchanted font-bold text-[24px] leading-snug mb-2">
              A stronger ward
            </h2>
            <p className="text-amber-100/55 text-sm leading-relaxed mb-5">
              Choose a powerful incantation to keep your account — and every interview record — under lock and charm.
            </p>
            <ul className="space-y-2.5">
              {["At least 8 characters long", "A mix of upper and lower case", "A number or symbol woven in"].map((tip) => (
                <li key={tip} className="flex items-center gap-2.5 text-xs text-amber-100/45">
                  <Sparkles size={11} className="text-amber-300/70 flex-shrink-0" />
                  {tip}
                </li>
              ))}
            </ul>
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

          <Suspense
            fallback={
              <div className="flex items-center gap-2 text-sm text-amber-200/60">
                <Loader2 size={16} className="animate-spin" />
                Loading…
              </div>
            }
          >
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
