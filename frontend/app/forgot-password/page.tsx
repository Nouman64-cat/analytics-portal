"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Loader2, BarChart2, Mail, ArrowRight, CheckCircle2, ShieldCheck, Lock } from "lucide-react";
import { authService } from "@/lib/services";
import { useAccentPalette, type AccentPalette } from "@/lib/useAccentPalette";

/* ─── Abstract art canvas ─────────────────────────── */
function AbstractArt({ palette }: { palette: AccentPalette }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const paletteRef = useRef(palette);
  useEffect(() => { paletteRef.current = palette; }, [palette]);
  const draw = useCallback(() => {
    const canvas = canvasRef.current; if(!canvas) return;
    const ctx = canvas.getContext("2d"); if(!ctx) return;
    const p = paletteRef.current;
    const W=canvas.width, H=canvas.height, t=Date.now()/1000;
    ctx.clearRect(0,0,W,H);
    const bg=ctx.createLinearGradient(0,0,W,H);
    bg.addColorStop(0,p.bg[0]); bg.addColorStop(0.45,p.bg[1]); bg.addColorStop(1,p.bg[2]);
    ctx.fillStyle=bg; ctx.fillRect(0,0,W,H);
    const verts=[[0.08,0.12],[0.3,0.05],[0.55,0.18],[0.82,0.08],[0.95,0.22],[0.88,0.45],[0.72,0.38],[0.6,0.55],[0.78,0.68],[0.95,0.6],[0.92,0.82],[0.72,0.9],[0.5,0.78],[0.32,0.92],[0.1,0.85],[0.05,0.62],[0.18,0.48],[0.35,0.35],[0.2,0.25],[0.45,0.45]].map(([rx,ry],i)=>({x:rx*W+Math.sin(t*0.2+i*0.7)*16,y:ry*H+Math.cos(t*0.16+i*0.5)*13}));
    [[0,1,17],[1,2,17],[2,17,19],[2,3,4],[4,5,9],[5,6,19],[6,7,19],[7,8,9],[9,10,11],[11,12,13],[13,14,15],[15,16,17],[17,18,0]].forEach((face,fi)=>{
      const pts=face.map(idx=>verts[idx%verts.length]); const col=p.faceColors[fi%p.faceColors.length];
      ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y); pts.slice(1).forEach(pt=>ctx.lineTo(pt.x,pt.y)); ctx.closePath();
      const a=0.06+Math.sin(t*0.38+fi*0.5)*0.035;
      ctx.fillStyle=col+Math.round(a*255).toString(16).padStart(2,"0"); ctx.fill(); ctx.strokeStyle=col+"28"; ctx.lineWidth=0.8; ctx.stroke();
    });
    [{bx:0.25,by:0.28,r:120},{bx:0.72,by:0.62,r:95},{bx:0.52,by:0.1,r:68},{bx:0.1,by:0.78,r:90},{bx:0.88,by:0.3,r:78}].forEach((orb,i)=>{
      const hue=p.orbHueBase+Math.sin(t*0.14+i*1.1)*28, ox=orb.bx*W+Math.sin(t*0.31+i*1.3)*32, oy=orb.by*H+Math.cos(t*0.25+i*0.9)*26;
      const g=ctx.createRadialGradient(ox,oy,0,ox,oy,orb.r); g.addColorStop(0,`hsla(${hue},85%,65%,0.32)`); g.addColorStop(0.5,`hsla(${hue+20},80%,55%,0.1)`); g.addColorStop(1,"transparent");
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(ox,oy,orb.r,0,Math.PI*2); ctx.fill();
    });
    ctx.save();
    for(let w=0;w<5;w++){ctx.beginPath();ctx.strokeStyle=`hsla(${p.meshHue+w*16},80%,68%,${0.06+w*0.022})`;ctx.lineWidth=1.8;for(let x=0;x<=W;x+=3){const y=H*(0.35+w*0.06)+Math.sin((x/W)*Math.PI*4+t*0.52+w*0.9)*(44+w*17)+Math.cos((x/W)*Math.PI*2.5+t*0.3+w*0.6)*(21+w*8);x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();}
    ctx.restore();
    ctx.save();
    const cols=14,rows=18,gx=W/cols,gy=H/rows;
    for(let i=0;i<cols;i++) for(let j=0;j<rows;j++){const px=i*gx+gx/2,py=j*gy+gy/2,d=Math.sqrt(Math.pow((px/W-0.5)*2,2)+Math.pow((py/H-0.5)*2,2));const pulse=Math.sin(t*1.55-d*3.4)*0.5+0.5;ctx.globalAlpha=0.06+pulse*0.26;ctx.fillStyle=`hsl(${p.dotHueBase+((i*3+j*7)%45)},75%,72%)`;ctx.beginPath();ctx.arc(px,py,1+pulse*1.7,0,Math.PI*2);ctx.fill();}
    ctx.restore();
    ctx.save();
    verts.slice(0,12).forEach((s,i)=>{verts.slice(0,12).slice(i+1).forEach(s2=>{const dx=s.x-s2.x,dy=s.y-s2.y,dist=Math.sqrt(dx*dx+dy*dy);if(dist<W*0.38){ctx.globalAlpha=(1-dist/(W*0.38))*0.16;ctx.strokeStyle=p.starColor;ctx.lineWidth=0.7;ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s2.x,s2.y);ctx.stroke();}});ctx.globalAlpha=0.5;ctx.fillStyle=p.starColor;ctx.beginPath();ctx.arc(s.x,s.y,1.8,0,Math.PI*2);ctx.fill();});
    ctx.restore();
    animRef.current=requestAnimationFrame(draw);
  },[]);
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const resize=()=>{canvas.width=canvas.offsetWidth;canvas.height=canvas.offsetHeight;};
    resize();const ro=new ResizeObserver(resize);ro.observe(canvas);
    animRef.current=requestAnimationFrame(draw);
    return()=>{cancelAnimationFrame(animRef.current);ro.disconnect();};
  },[draw]);
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{display:"block"}} />;
}

/* ─── Form input with icon ──────────────────────────── */
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
      <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <div className={`relative flex items-center rounded-xl border transition-all duration-200 ${focused ? "border-indigo-400 dark:border-indigo-500/70 bg-white dark:bg-white/[0.06] shadow-[0_0_0_3px_rgba(99,102,241,0.12)]" : "border-slate-200 dark:border-white/[0.09] bg-slate-50 dark:bg-white/[0.03] hover:border-slate-300 dark:hover:border-white/[0.16] hover:bg-white dark:hover:bg-white/[0.05]"}`}>
        <div className={`flex-shrink-0 flex items-center justify-center w-11 h-full pl-3.5 transition-colors duration-200 ${focused ? "text-indigo-500 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500"}`}>
          <Icon size={16} />
        </div>
        <div className={`w-px self-stretch my-2.5 transition-colors duration-200 ${focused ? "bg-indigo-200 dark:bg-indigo-500/30" : "bg-slate-200 dark:bg-white/[0.07]"}`} />
        <input id={id} type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} required={required} autoFocus={autoFocus} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} className="flex-1 bg-transparent px-3.5 py-3 text-sm text-slate-900 dark:text-white outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600 min-w-0" />
        {rightSlot && <div className="pr-3">{rightSlot}</div>}
      </div>
    </div>
  );
}

/* ─── Forgot Password Page ─────────────────────────── */
export default function ForgotPasswordPage() {
  const palette = useAccentPalette();
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
    <div className="w-full min-h-screen flex bg-slate-50 dark:bg-[#0f0c29]">
      {/* ── Left panel ── */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden flex-col">
        <AbstractArt palette={palette} />
        <div className="relative z-10 flex flex-col justify-between h-full p-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-lg">
              <BarChart2 size={18} className="text-white" />
            </div>
            <div>
              <span className="font-bold text-white text-sm block leading-tight">Interview Management</span>
              <span className="text-white/50 text-[10px] uppercase tracking-widest">Portal</span>
            </div>
          </div>
          <div className="max-w-sm">
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center mb-4">
              <Mail size={22} className="text-indigo-300" />
            </div>
            <h2 className="text-white font-bold text-xl leading-snug mb-2">Password Recovery</h2>
            <p className="text-white/50 text-sm leading-relaxed">
              We&apos;ll send a secure, time-limited link to your inbox so you can regain access safely.
            </p>
            {/* Steps */}
            <div className="mt-6 space-y-3">
              {[
                { n: "1", t: "Enter your email address below" },
                { n: "2", t: "Check inbox for the reset link" },
                { n: "3", t: "Set a new secure password" },
              ].map((step) => (
                <div key={step.n} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-indigo-300">{step.n}</span>
                  </div>
                  <span className="text-white/45 text-xs">{step.t}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-white dark:bg-[#0a0b14]">
        <div className="w-full max-w-[420px] animate-fade-in">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center">
              <BarChart2 size={15} className="text-white" />
            </div>
            <div>
              <span className="font-bold text-slate-900 dark:text-white text-sm block leading-tight">Interview Management</span>
              <span className="text-slate-400 dark:text-white/40 text-[10px] uppercase tracking-widest">Portal</span>
            </div>
          </div>

          {submitted ? (
            /* ── Success state ── */
            <div className="animate-fade-in space-y-6">
              {/* Success icon */}
              <div className="flex justify-center">
                <div className="relative">
                  <div className="w-20 h-20 rounded-3xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center">
                    <CheckCircle2 size={36} className="text-emerald-500 dark:text-emerald-400" />
                  </div>
                  <div className="absolute -inset-1 rounded-3xl bg-emerald-400/10 blur-lg" />
                </div>
              </div>

              <div className="text-center">
                <h1 className="text-[26px] font-bold text-slate-900 dark:text-white tracking-tight">Check your inbox</h1>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  A reset link was sent to{" "}
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">{email}</span>
                </p>
              </div>

              <div className="rounded-2xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02] p-5 space-y-3">
                {[
                  "Link expires in 1 hour",
                  "Check your spam folder if not received",
                  "The link can only be used once",
                ].map((note) => (
                  <div key={note} className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                    {note}
                  </div>
                ))}
              </div>

              <a
                href="/login"
                className="flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg,#4f46e5 0%,#6366f1 50%,#7c3aed 100%)" }}
              >
                <ArrowRight size={16} className="opacity-80" />
                Back to sign in
              </a>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="mb-8">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                  <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">Account Recovery</span>
                </div>
                <h1 className="text-[28px] font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
                  Forgot password?
                </h1>
                <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                  No worries — we&apos;ll send you a reset link.
                </p>
              </div>

              {/* Form card */}
              <div className="rounded-2xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02] p-6 shadow-sm dark:shadow-none">
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
                    <div className="animate-float-up flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-500/[0.08] border border-red-200 dark:border-red-500/20 px-4 py-3">
                      <div className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-red-500 dark:text-red-400 text-[10px] font-bold">!</span>
                      </div>
                      <p className="text-xs text-red-600 dark:text-red-400 leading-relaxed">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="relative w-full overflow-hidden flex items-center justify-center gap-2.5 rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ background: loading ? "#4f46e5" : "linear-gradient(135deg,#4f46e5 0%,#6366f1 50%,#7c3aed 100%)" }}
                  >
                    {!loading && (
                      <span className="absolute inset-0 animate-shimmer pointer-events-none" style={{ background:"linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.15) 50%,transparent 60%)", backgroundSize:"200% auto" }} />
                    )}
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} className="opacity-80" />}
                    <span>{loading ? "Sending…" : "Send Reset Link"}</span>
                  </button>

                  <p className="text-center text-xs text-slate-400 dark:text-slate-500 pt-0.5">
                    Remember your password?{" "}
                    <a href="/login" className="font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors">
                      Sign in
                    </a>
                  </p>
                </form>
              </div>

              {/* Trust */}
              <div className="mt-6 flex items-center justify-center gap-4">
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                  <ShieldCheck size={13} className="text-emerald-500" />
                  SSL Secured
                </div>
                <span className="w-px h-3.5 bg-slate-200 dark:bg-white/10" />
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                  <Lock size={12} className="text-indigo-400" />
                  End-to-end encrypted
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
