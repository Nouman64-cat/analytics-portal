"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authService } from "@/lib/services";
import { setToken, isAuthenticated } from "@/lib/auth";
import { useAccentPalette, type AccentPalette } from "@/lib/useAccentPalette";

/* ─── Cute floating art canvas ────────────────────────── */
function CuteArt({ palette }: { palette: AccentPalette }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const paletteRef = useRef(palette);
  useEffect(() => { paletteRef.current = palette; }, [palette]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const p = paletteRef.current;
    const W = canvas.width, H = canvas.height, t = Date.now() / 1000;
    ctx.clearRect(0, 0, W, H);

    // Soft pastel sky, tinted by the current accent hue
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, `hsl(${p.orbHueBase}, 75%, 95%)`);
    bg.addColorStop(0.55, `hsl(${p.meshHue}, 65%, 91%)`);
    bg.addColorStop(1, `hsl(${p.dotHueBase}, 70%, 94%)`);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // Big soft blobs, gently drifting
    [
      { bx: 0.18, by: 0.22, r: 190, hue: p.orbHueBase },
      { bx: 0.82, by: 0.18, r: 150, hue: p.meshHue + 20 },
      { bx: 0.75, by: 0.72, r: 210, hue: p.dotHueBase + 10 },
      { bx: 0.15, by: 0.78, r: 160, hue: p.orbHueBase - 15 },
    ].forEach((b, i) => {
      const bx = b.bx * W + Math.sin(t * 0.18 + i * 1.4) * 30;
      const by = b.by * H + Math.cos(t * 0.15 + i * 1.1) * 24;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, b.r);
      g.addColorStop(0, `hsla(${b.hue}, 90%, 82%, 0.55)`);
      g.addColorStop(0.6, `hsla(${b.hue + 15}, 85%, 78%, 0.22)`);
      g.addColorStop(1, "transparent");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, b.r, 0, Math.PI * 2); ctx.fill();
    });

    // Rising bubbles
    for (let i = 0; i < 16; i++) {
      const seed = i * 137.5;
      const speed = 18 + (i % 5) * 6;
      const x = (seed * 1.618) % W;
      const y = H - (((t * speed + seed) % (H + 60)));
      const r = 3 + (i % 4) * 2.5;
      const wobble = Math.sin(t * 1.2 + i) * 8;
      ctx.beginPath();
      ctx.arc(x + wobble, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(${p.orbHueBase}, 80%, 70%, 0.35)`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x + wobble - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fill();
    }

    // Floating happy stickers
    const stickers = ["✨", "🌸", "⭐", "💫", "🎈", "💛", "🌟", "🦋"];
    const spots = [
      [0.12, 0.15], [0.88, 0.12], [0.5, 0.08], [0.08, 0.5],
      [0.92, 0.5], [0.2, 0.85], [0.8, 0.88], [0.5, 0.94],
    ];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    spots.forEach(([rx, ry], i) => {
      const x = rx * W + Math.sin(t * 0.35 + i * 1.3) * 16;
      const y = ry * H + Math.cos(t * 0.3 + i * 1.7) * 20;
      const size = 20 + Math.sin(t * 0.5 + i) * 3;
      ctx.font = `${size}px serif`;
      ctx.globalAlpha = 0.75 + Math.sin(t * 0.6 + i) * 0.2;
      ctx.fillText(stickers[i % stickers.length], x, y);
    });
    ctx.globalAlpha = 1;

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current; if(!canvas) return;
    const resize = () => { canvas.width=canvas.offsetWidth; canvas.height=canvas.offsetHeight; };
    resize(); const ro = new ResizeObserver(resize); ro.observe(canvas);
    animRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animRef.current); ro.disconnect(); };
  }, [draw]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ display:"block" }} />;
}

/* ─── Reusable form input with emoji ─────────────────── */
function FormInput({
  id, label, type, value, onChange, placeholder, required, autoFocus,
  icon, rightSlot,
}: {
  id: string; label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder: string;
  required?: boolean; autoFocus?: boolean;
  icon: string; rightSlot?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"
      >
        {label}
      </label>
      <div
        className={`relative flex items-center rounded-2xl border-2 transition-all duration-200 ${
          focused
            ? "border-pink-300 bg-white shadow-[0_0_0_4px_rgba(244,114,182,0.15)]"
            : "border-slate-200 bg-slate-50 hover:border-pink-200 hover:bg-white"
        }`}
      >
        {/* Left emoji */}
        <div className="flex-shrink-0 flex items-center justify-center w-11 h-full text-lg">
          {icon}
        </div>
        {/* Divider */}
        <div className={`w-px self-stretch my-2.5 transition-colors duration-200 ${focused ? "bg-pink-200" : "bg-slate-200"}`} />
        {/* Input */}
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
          className="flex-1 bg-transparent px-3.5 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-300 min-w-0"
        />
        {/* Right slot (show/hide password etc.) */}
        {rightSlot && <div className="pr-3">{rightSlot}</div>}
      </div>
    </div>
  );
}

/* ─── Login Page ──────────────────────────────────────── */
export default function LoginPage() {
  const router = useRouter();
  const palette = useAccentPalette();
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
    <div className="w-full min-h-screen flex bg-gradient-to-br from-pink-50 via-orange-50/40 to-indigo-50">
      {/* ── Left: Cute Art Panel ── */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden flex-col">
        <CuteArt palette={palette} />
        <div className="relative z-10 flex flex-col justify-between h-full p-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/60 backdrop-blur-sm border border-white/60 flex items-center justify-center shadow-lg text-lg">
              🎯
            </div>
            <div>
              <span className="font-bold text-slate-700 text-sm block leading-tight">Interview Management</span>
              <span className="text-slate-500/80 text-[10px] uppercase tracking-widest">Portal</span>
            </div>
          </div>
          <div className="max-w-sm">
            <div className="flex flex-wrap gap-2 mb-4">
              {["📊 Analytics", "🧑‍💼 Candidates", "💡 Insights"].map((tag) => (
                <span key={tag} className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/70 text-slate-600 border border-white/70 backdrop-blur-sm shadow-sm">
                  {tag}
                </span>
              ))}
            </div>
            <h2 className="text-slate-700 font-bold text-xl leading-snug">
              Let&apos;s find your next great hire! 🎉
            </h2>
            <p className="mt-2 text-slate-500 text-sm leading-relaxed">
              Track interviews, celebrate the wins, and make hiring decisions with a smile 😊
            </p>
          </div>
        </div>
      </div>

      {/* ── Right: Form Panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white">
        <div className="w-full max-w-[420px] animate-fade-in">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-400 to-orange-300 flex items-center justify-center text-base shadow-sm">
              🎯
            </div>
            <div>
              <span className="font-bold text-slate-900 text-sm block leading-tight">Interview Management</span>
              <span className="text-slate-400 text-[10px] uppercase tracking-widest">Portal</span>
            </div>
          </div>

          {/* Header */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pink-50 border border-pink-100 mb-4">
              <span className="text-xs">✨</span>
              <span className="text-[11px] font-medium text-pink-600">So happy you&apos;re here</span>
            </div>
            <h1 className="text-[28px] font-bold text-slate-900 tracking-tight leading-tight">
              Welcome back! 👋
            </h1>
            <p className="mt-1.5 text-sm text-slate-500">
              We&apos;ve missed you — let&apos;s get you signed in.
            </p>
          </div>

          {/* Form card */}
          <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-6 shadow-sm">
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
                icon="📧"
              />

              <FormInput
                id="login-password"
                label="Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={setPassword}
                placeholder="Enter your password"
                required
                icon="🔒"
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    className="p-1.5 rounded-lg text-base hover:bg-slate-100 transition-all"
                  >
                    {showPassword ? "🙈" : "👀"}
                  </button>
                }
              />

              {/* Forgot password */}
              <div className="flex justify-end pt-0.5">
                <button
                  type="button"
                  onClick={() => router.push("/forgot-password")}
                  className="text-xs font-medium text-pink-600 hover:text-pink-500 transition-colors"
                >
                  Forgot password? 🤔
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="animate-float-up flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                  <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5 text-xs">
                    😬
                  </div>
                  <p className="text-xs text-red-600 leading-relaxed">{error}</p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="relative w-full overflow-hidden flex items-center justify-center gap-2.5 rounded-full px-4 py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.02] active:scale-[0.97] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 mt-2 shadow-md"
                style={{
                  background: loading
                    ? "#f472b6"
                    : "linear-gradient(135deg, #f472b6 0%, #fb923c 50%, #facc15 100%)",
                }}
              >
                {/* shimmer layer */}
                {!loading && (
                  <span
                    className="absolute inset-0 animate-shimmer pointer-events-none"
                    style={{
                      background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.25) 50%, transparent 60%)",
                      backgroundSize: "200% auto",
                    }}
                  />
                )}
                <span className={loading ? "animate-spin" : ""}>{loading ? "🌀" : "🚀"}</span>
                <span>{loading ? "Signing you in…" : "Let's go!"}</span>
              </button>
            </form>
          </div>

          {/* Trust badges */}
          <div className="mt-6 flex items-center justify-center gap-4">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span>🔒</span>
              Safe &amp; secure
            </div>
            <span className="w-px h-3.5 bg-slate-200" />
            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
              <span>💛</span>
              Made with care
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
