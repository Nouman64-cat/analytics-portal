"use client";

import { useEffect, useState, useRef } from "react";
import { Bell, BellOff, CheckCircle, Loader2, Palette, Sparkles, Volume2, Play } from "lucide-react";
import { authService } from "@/lib/services";
import {
  saveAlarmEnabled,
  saveAlarmSound,
  saveAlarmStyle,
  saveGlassmorphism,
  type AlarmSound,
  type AlarmStyle,
} from "@/lib/settings";
import { playAlarmSound, FullScreenAlert, ToastAlerts } from "@/components/InterviewAlertMonitor";
import { ACCENT_OPTIONS, type AccentId, getAccentColor, saveAccentColor, persistAccentColor } from "@/lib/accent";
import { PageLoader, ErrorState, PageHeader } from "@/components/PageStates";

const SOUND_OPTIONS: { id: AlarmSound; label: string; emoji: string }[] = [
  { id: "beep",    label: "Beep",    emoji: "🔔" },
  { id: "chime",   label: "Chime",   emoji: "🎵" },
  { id: "ping",    label: "Ping",    emoji: "🏓" },
  { id: "pulse",   label: "Pulse",   emoji: "💓" },
  { id: "siren",   label: "Siren",   emoji: "🚨" },
  { id: "fanfare", label: "Fanfare", emoji: "🎺" },
];

function Toggle({
  checked,
  onChange,
  disabled,
  color = "indigo",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  color?: "indigo" | "violet";
}) {
  const track = color === "violet"
    ? checked ? "bg-violet-500" : "bg-slate-200 dark:bg-slate-700"
    : checked ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700";
  const ring = color === "violet" ? "focus-visible:ring-violet-500" : "focus-visible:ring-indigo-500";
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 ${ring} focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${track}`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition duration-200 ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}

export default function SettingsPage() {
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [alarmSound, setAlarmSound] = useState<AlarmSound>("beep");
  const [alarmStyle, setAlarmStyle] = useState<AlarmStyle>("fullscreen");
  const [glassEnabled, setGlassEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [soundSaving, setSoundSaving] = useState(false);
  const [soundSaved, setSoundSaved] = useState(false);
  const [styleSaving, setStyleSaving] = useState(false);
  const [glassSaving, setGlassSaving] = useState(false);
  const [glassSaved, setGlassSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accentId, setAccentId] = useState<AccentId>("indigo");
  const [showPreview, setShowPreview] = useState(false);
  const [playingId, setPlayingId] = useState<AlarmSound | null>(null);
  const stopSoundRef = useRef<(() => void) | null>(null);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setAccentId(getAccentColor()); }, []);

  useEffect(() => {
    authService.getMe()
      .then((u) => {
        setAlarmEnabled(u.alarm_enabled);
        setAlarmSound((u.alarm_sound as AlarmSound) ?? "beep");
        setAlarmStyle((u.alarm_style as AlarmStyle) ?? "fullscreen");
        setGlassEnabled(u.glassmorphism_enabled);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    return () => {
      stopSoundRef.current?.();
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, []);

  const toggle = async (v: boolean) => {
    setAlarmEnabled(v);
    setSaving(true);
    try { await saveAlarmEnabled(v); } catch { setAlarmEnabled(!v); } finally { setSaving(false); }
  };

  const pickSound = async (s: AlarmSound) => {
    setAlarmSound(s);
    setSoundSaving(true);
    setSoundSaved(false);
    try { await saveAlarmSound(s); setSoundSaved(true); setTimeout(() => setSoundSaved(false), 2000); }
    catch {}
    finally { setSoundSaving(false); }
  };

  const previewSound = (s: AlarmSound, e?: React.MouseEvent) => {
    e?.stopPropagation();
    stopSoundRef.current?.();
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    setPlayingId(s);
    const stop = playAlarmSound(s);
    stopSoundRef.current = stop;
    previewTimerRef.current = setTimeout(() => {
      stop();
      stopSoundRef.current = null;
      setPlayingId(null);
    }, 3000);
  };

  const pickStyle = async (s: AlarmStyle) => {
    setAlarmStyle(s);
    setStyleSaving(true);
    try { await saveAlarmStyle(s); } catch {} finally { setStyleSaving(false); }
  };

  const toggleGlass = async (v: boolean) => {
    setGlassEnabled(v);
    setGlassSaving(true);
    setGlassSaved(false);
    try { await saveGlassmorphism(v); setGlassSaved(true); setTimeout(() => setGlassSaved(false), 2000); }
    catch { setGlassEnabled(!v); }
    finally { setGlassSaving(false); }
  };

  const pickAccent = (id: AccentId) => {
    setAccentId(id);
    saveAccentColor(id);
    persistAccentColor(id, alarmEnabled).catch(() => {});
  };

  const triggerPreview = () => {
    setShowPreview(true);
    previewSound(alarmSound);
    setTimeout(() => setShowPreview(false), 6000);
  };

  if (loading) return <PageLoader />;
  if (error) return (
    <ErrorState message={error} onRetry={() => {
      setError(null); setLoading(true);
      authService.getMe()
        .then((u) => { setAlarmEnabled(u.alarm_enabled); setAlarmSound((u.alarm_sound as AlarmSound) ?? "beep"); setAlarmStyle((u.alarm_style as AlarmStyle) ?? "fullscreen"); setGlassEnabled(u.glassmorphism_enabled); })
        .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
        .finally(() => setLoading(false));
    }} />
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in pb-12">
      <PageHeader title="Settings" subtitle="Manage your personal preferences" />

      {/* ── Appearance card (Color + Glass merged) ── */}
      <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#12141c] shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-white/4">
          <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
            <Palette size={16} />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">Appearance</h3>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-white/4">
          {/* App Color */}
          <div className="px-6 py-5">
            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">App Color</p>
            <div className="flex flex-wrap gap-3">
              {ACCENT_OPTIONS.map((accent) => {
                const isActive = accentId === accent.id;
                return (
                  <button
                    key={accent.id}
                    onClick={() => pickAccent(accent.id)}
                    title={accent.label}
                    className="flex flex-col items-center gap-1.5 group"
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 ${isActive ? "scale-110" : "hover:scale-105"}`}
                      style={{
                        backgroundColor: accent.hex,
                        boxShadow: isActive ? `0 0 0 2px white, 0 0 0 4px ${accent.hex}` : undefined,
                      }}
                    >
                      {isActive && (
                        <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="2,6 5,9 10,3" />
                        </svg>
                      )}
                    </span>
                    <span className={`text-[10px] font-medium ${isActive ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"}`}>
                      {accent.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Glassmorphism */}
          <div className="px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Sparkles size={16} className={glassEnabled ? "text-violet-500" : "text-slate-400"} />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white leading-none">Glassmorphism</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {glassEnabled ? "Frosted-glass effect active on cards" : "Solid card backgrounds (default)"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {glassSaving && <Loader2 size={12} className="animate-spin text-slate-400" />}
              {glassSaved && !glassSaving && <CheckCircle size={12} className="text-emerald-500" />}
              <Toggle checked={glassEnabled} onChange={toggleGlass} disabled={glassSaving} color="violet" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Interview Alerts card ── */}
      <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#12141c] shadow-sm overflow-hidden">
        {/* Header with toggle inline */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 dark:border-white/4">
          <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
            {alarmEnabled ? <Bell size={16} /> : <BellOff size={16} />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-none">Interview Alerts</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {alarmEnabled ? "Fires at 60, 30 and 15 min before each interview" : "No alarm will sound"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {saving && <Loader2 size={12} className="animate-spin text-slate-400" />}
            <Toggle checked={alarmEnabled} onChange={toggle} disabled={saving} />
          </div>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Sound picker */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Alarm Sound</p>
              <div className="flex items-center gap-1.5 h-4">
                {soundSaving && <Loader2 size={11} className="animate-spin text-slate-400" />}
                {soundSaved && !soundSaving && <span className="text-[10px] font-semibold text-emerald-500 flex items-center gap-1"><CheckCircle size={10} /> Saved</span>}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {SOUND_OPTIONS.map((opt) => {
                const isActive = alarmSound === opt.id;
                const isPlaying = playingId === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => pickSound(opt.id)}
                    className={`relative group flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border transition-all duration-150 ${
                      isActive
                        ? "border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                        : "border-slate-200 dark:border-white/6 bg-slate-50 dark:bg-white/2 hover:border-slate-300 dark:hover:border-white/10 hover:bg-slate-100 dark:hover:bg-white/4"
                    }`}
                  >
                    <span className="text-xl select-none">{opt.emoji}</span>
                    <span className={`text-xs font-semibold ${isActive ? "text-indigo-700 dark:text-indigo-300" : "text-slate-600 dark:text-slate-400"}`}>
                      {opt.label}
                    </span>
                    {/* Play preview button — appears on hover or when playing */}
                    <button
                      onClick={(e) => previewSound(opt.id, e)}
                      title="Preview"
                      className={`absolute top-1.5 right-1.5 h-5 w-5 rounded-md flex items-center justify-center transition-all duration-150 ${
                        isPlaying
                          ? "opacity-100 bg-indigo-500 text-white"
                          : "opacity-0 group-hover:opacity-100 bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-300 dark:hover:bg-white/20"
                      }`}
                    >
                      <Play size={8} className={isPlaying ? "animate-pulse" : ""} />
                    </button>
                    {/* Active dot */}
                    {isActive && <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-indigo-500" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notification style — segmented control */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Notification Style</p>
              {styleSaving && <Loader2 size={11} className="animate-spin text-slate-400" />}
            </div>
            <div className="flex rounded-xl border border-slate-200 dark:border-white/6 overflow-hidden bg-slate-50 dark:bg-white/2 p-1 gap-1">
              {(["fullscreen", "toast"] as AlarmStyle[]).map((s) => {
                const isActive = alarmStyle === s;
                return (
                  <button
                    key={s}
                    onClick={() => pickStyle(s)}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-150 ${
                      isActive
                        ? s === "fullscreen"
                          ? "bg-white dark:bg-zinc-800 text-red-600 dark:text-red-400 shadow-sm border border-red-200 dark:border-red-500/30"
                          : "bg-white dark:bg-zinc-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-indigo-200 dark:border-indigo-500/30"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
                    }`}
                  >
                    {s === "fullscreen" ? (
                      <>
                        <span className="text-base">🖥️</span>
                        <div className="text-left">
                          <div>Full Screen</div>
                          <div className={`text-[10px] font-normal ${isActive ? "opacity-70" : "text-slate-400 dark:text-slate-500"}`}>Takes over screen</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-base">💬</span>
                        <div className="text-left">
                          <div>Toast</div>
                          <div className={`text-[10px] font-normal ${isActive ? "opacity-70" : "text-slate-400 dark:text-slate-500"}`}>Top banner, auto-hides</div>
                        </div>
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview button */}
          <button
            onClick={triggerPreview}
            disabled={showPreview}
            className="w-full py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-white/10 text-xs font-semibold text-slate-400 dark:text-slate-500 hover:border-indigo-400 hover:text-indigo-600 dark:hover:border-indigo-500 dark:hover:text-indigo-400 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Bell size={12} />
            {showPreview ? "Previewing…" : "Test Notification"}
          </button>
        </div>
      </div>

      {/* Mock alert preview */}
      {showPreview && (() => {
        const mockItem = {
          interview: {
            id: "preview",
            interview_date: new Date().toISOString().split("T")[0]!,
            time_est: new Date().toTimeString().slice(0, 5),
            company_name: "Acme Corp",
            role: "Senior Engineer",
            round: "Technical",
            candidate_name: "Preview Mode",
            interview_link: null,
          } as never,
          threshold: 15,
          key: "preview",
        };
        const dismiss = () => setShowPreview(false);
        return alarmStyle === "toast"
          ? <ToastAlerts queue={[mockItem]} onDismiss={dismiss} onDismissAll={dismiss} />
          : <FullScreenAlert queue={[mockItem]} onDismiss={dismiss} onDismissAll={dismiss} />;
      })()}
    </div>
  );
}
