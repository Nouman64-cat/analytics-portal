"use client";

import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Loader2, Eye, EyeOff, BarChart2,
  ShieldCheck, CheckCircle2, Lock, ArrowRight, KeyRound,
} from "lucide-react";
import { authService } from "@/lib/services";

/* ─── Abstract art canvas ───────────────────────────── */
function AbstractArt() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const draw = useCallback(() => {
    const canvas = canvasRef.current; if(!canvas) return;
    const ctx = canvas.getContext("2d"); if(!ctx) return;
    const W=canvas.width,H=canvas.height,t=Date.now()/1000;
    ctx.clearRect(0,0,W,H);
    const bg=ctx.createLinearGradient(0,0,W,H);
    bg.addColorStop(0,"#0f0c29");bg.addColorStop(0.45,"#302b63");bg.addColorStop(1,"#24243e");
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    const verts=[[0.08,0.12],[0.3,0.05],[0.55,0.18],[0.82,0.08],[0.95,0.22],[0.88,0.45],[0.72,0.38],[0.6,0.55],[0.78,0.68],[0.95,0.6],[0.92,0.82],[0.72,0.9],[0.5,0.78],[0.32,0.92],[0.1,0.85],[0.05,0.62],[0.18,0.48],[0.35,0.35],[0.2,0.25],[0.45,0.45]].map(([rx,ry],i)=>({x:rx*W+Math.sin(t*0.21+i*0.72)*17,y:ry*H+Math.cos(t*0.17+i*0.52)*12}));
    [[0,1,17],[1,2,17],[2,17,19],[2,3,4],[4,5,9],[5,6,19],[6,7,19],[7,8,9],[9,10,11],[11,12,13],[13,14,15],[15,16,17],[17,18,0]].forEach((face,fi)=>{
      const pts=face.map(idx=>verts[idx%verts.length]);const colors=["#4f46e5","#6366f1","#7c3aed","#4338ca","#818cf8","#5b21b6","#4f46e5","#7c3aed","#6366f1","#4338ca","#818cf8","#4f46e5","#7c3aed"];
      ctx.beginPath();ctx.moveTo(pts[0].x,pts[0].y);pts.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.closePath();
      const a=0.055+Math.sin(t*0.36+fi*0.52)*0.034;
      ctx.fillStyle=colors[fi%colors.length]+Math.round(a*255).toString(16).padStart(2,"0");ctx.fill();ctx.strokeStyle=colors[fi%colors.length]+"28";ctx.lineWidth=0.8;ctx.stroke();
    });
    [{bx:0.22,by:0.3,r:118},{bx:0.74,by:0.63,r:92},{bx:0.5,by:0.1,r:66},{bx:0.1,by:0.77,r:88},{bx:0.87,by:0.29,r:76}].forEach((orb,i)=>{
      const hue=240+Math.sin(t*0.13+i*1.1)*27,ox=orb.bx*W+Math.sin(t*0.3+i*1.3)*30,oy=orb.by*H+Math.cos(t*0.24+i*0.9)*25;
      const g=ctx.createRadialGradient(ox,oy,0,ox,oy,orb.r);g.addColorStop(0,`hsla(${hue},85%,65%,0.3)`);g.addColorStop(0.5,`hsla(${hue+20},80%,55%,0.1)`);g.addColorStop(1,"transparent");
      ctx.fillStyle=g;ctx.beginPath();ctx.arc(ox,oy,orb.r,0,Math.PI*2);ctx.fill();
    });
    ctx.save();for(let w=0;w<5;w++){ctx.beginPath();ctx.strokeStyle=`hsla(${238+w*15},80%,68%,${0.06+w*0.022})`;ctx.lineWidth=1.8;for(let x=0;x<=W;x+=3){const y=H*(0.35+w*0.06)+Math.sin((x/W)*Math.PI*4+t*0.5+w*0.88)*(44+w*16)+Math.cos((x/W)*Math.PI*2.5+t*0.29+w*0.6)*(20+w*8);x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}ctx.stroke();}ctx.restore();
    ctx.save();const cols=14,rows=18,gx=W/cols,gy=H/rows;for(let i=0;i<cols;i++)for(let j=0;j<rows;j++){const px=i*gx+gx/2,py=j*gy+gy/2,d=Math.sqrt(Math.pow((px/W-0.5)*2,2)+Math.pow((py/H-0.5)*2,2));const pulse=Math.sin(t*1.52-d*3.3)*0.5+0.5;ctx.globalAlpha=0.06+pulse*0.25;ctx.fillStyle=`hsl(${248+((i*3+j*7)%45)},75%,72%)`;ctx.beginPath();ctx.arc(px,py,1+pulse*1.7,0,Math.PI*2);ctx.fill();}ctx.restore();
    ctx.save();verts.slice(0,12).forEach((s,i)=>{verts.slice(0,12).slice(i+1).forEach(s2=>{const dx=s.x-s2.x,dy=s.y-s2.y,dist=Math.sqrt(dx*dx+dy*dy);if(dist<W*0.38){ctx.globalAlpha=(1-dist/(W*0.38))*0.15;ctx.strokeStyle="#a5b4fc";ctx.lineWidth=0.7;ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s2.x,s2.y);ctx.stroke();}});ctx.globalAlpha=0.5;ctx.fillStyle="#c7d2fe";ctx.beginPath();ctx.arc(s.x,s.y,1.8,0,Math.PI*2);ctx.fill();});ctx.restore();
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

/* ─── Password strength ─────────────────────────────── */
function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8+ chars", ok: password.length >= 8 },
    { label: "Uppercase", ok: /[A-Z]/.test(password) },
    { label: "Number", ok: /\d/.test(password) },
  ];
  const score = checks.filter(c => c.ok).length;
  const barColors  = ["bg-red-500", "bg-amber-500", "bg-emerald-500"];
  const textColors = ["text-red-500","text-amber-500","text-emerald-500"];
  const labels     = ["Weak", "Fair", "Strong"];
  if (!password) return null;
  return (
    <div className="space-y-1.5 animate-float-up">
      <div className="flex gap-1">
        {[0,1,2].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-500 ${i < score ? barColors[score-1] : "bg-slate-200 dark:bg-white/10"}`} />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-3 flex-wrap">
          {checks.map(c => (
            <span key={c.label} className={`text-[10px] transition-colors ${c.ok ? "text-emerald-500 dark:text-emerald-400" : "text-slate-300 dark:text-slate-600"}`}>
              {c.ok ? "✓" : "·"} {c.label}
            </span>
          ))}
        </div>
        {score > 0 && <span className={`text-[10px] font-semibold ${textColors[score-1]}`}>{labels[score-1]}</span>}
      </div>
    </div>
  );
}

/* ─── Reset Password Form ─────────────────────────── */
function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword]   = useState("");
  const [confirm, setConfirm]           = useState("");
  const [showNew, setShowNew]           = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [loading, setLoading]           = useState(false);
  const [done, setDone]                 = useState(false);

  useEffect(() => { if (!token) router.replace("/login"); }, [token, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (newPassword !== confirm) { setError("Passwords do not match."); return; }
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
            <div className="w-20 h-20 rounded-3xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 size={36} className="text-emerald-500 dark:text-emerald-400" />
            </div>
            <div className="absolute -inset-1 rounded-3xl bg-emerald-400/10 blur-lg" />
          </div>
        </div>
        <div className="text-center">
          <h1 className="text-[26px] font-bold text-slate-900 dark:text-white tracking-tight">Password updated!</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
            Your password has been changed. You can now sign in with your new credentials.
          </p>
        </div>
        <a
          href="/login"
          className="flex items-center justify-center gap-2 w-full rounded-xl px-4 py-3.5 text-sm font-semibold text-white transition-all hover:shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98]"
          style={{ background:"linear-gradient(135deg,#4f46e5 0%,#6366f1 50%,#7c3aed 100%)" }}
        >
          <ArrowRight size={16} className="opacity-80" />
          Go to sign in
        </a>
      </div>
    );
  }

  return (
    <>
      <div className="mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">Secure Reset</span>
        </div>
        <h1 className="text-[28px] font-bold text-slate-900 dark:text-white tracking-tight leading-tight">
          Reset password
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Choose a strong new password for your account.
        </p>
      </div>

      {/* Form card */}
      <div className="rounded-2xl border border-slate-100 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02] p-6 shadow-sm dark:shadow-none">
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* New Password */}
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
              <button type="button" onClick={() => setShowNew(v=>!v)} tabIndex={-1}
                className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-all">
                {showNew ? <EyeOff size={15}/> : <Eye size={15}/>}
              </button>
            }
          />
          {newPassword && <PasswordStrength password={newPassword} />}

          {/* Confirm Password */}
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
              <button type="button" onClick={() => setShowConfirm(v=>!v)} tabIndex={-1}
                className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-all">
                {showConfirm ? <EyeOff size={15}/> : <Eye size={15}/>}
              </button>
            }
          />
          {/* Match indicator */}
          {confirm && (
            <p className={`text-[11px] font-medium animate-float-up ${newPassword === confirm ? "text-emerald-500 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
              {newPassword === confirm ? "✓ Passwords match" : "✗ Passwords do not match"}
            </p>
          )}

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
            <span>{loading ? "Saving…" : "Set New Password"}</span>
          </button>

          <p className="text-center text-xs text-slate-400 dark:text-slate-500 pt-0.5">
            Remember your password?{" "}
            <a href="/login" className="font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors">
              Sign in
            </a>
          </p>
        </form>
      </div>

      {/* Trust badges */}
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
  );
}

/* ─── Reset Password Page ─────────────────────────── */
export default function ResetPasswordPage() {
  return (
    <div className="w-full min-h-screen flex bg-slate-50 dark:bg-[#0f0c29]">
      {/* ── Left panel ── */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden flex-col">
        <AbstractArt />
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
              <ShieldCheck size={22} className="text-indigo-300" />
            </div>
            <h2 className="text-white font-bold text-xl leading-snug mb-2">Secure Reset</h2>
            <p className="text-white/50 text-sm leading-relaxed mb-5">
              Choose a strong password to keep your account and interview data secure.
            </p>
            <ul className="space-y-2.5">
              {["At least 8 characters long", "Mix of uppercase & lowercase", "Include numbers or symbols"].map(tip => (
                <li key={tip} className="flex items-center gap-2.5 text-xs text-white/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/60 flex-shrink-0" />
                  {tip}
                </li>
              ))}
            </ul>
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

          <Suspense fallback={
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <Loader2 size={16} className="animate-spin" />
              Loading…
            </div>
          }>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
