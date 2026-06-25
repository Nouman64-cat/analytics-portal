"use client";

import { useEffect, useState, useRef } from "react";
import { Bell, BellOff, Clock, CheckCircle, Loader2, Palette, Sparkles, Volume2, Monitor, MessageSquare } from "lucide-react";
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

const SOUND_OPTIONS: { id: AlarmSound; label: string; description: string; emoji: string }[] = [
  { id: "beep",  label: "Beep",   description: "Urgent triple beep — hard to miss",    emoji: "🔔" },
  { id: "chime", label: "Chime",  description: "Soft descending chime — gentle alert", emoji: "🎵" },
  { id: "ping",  label: "Ping",   description: "Clean high-pitched ping",               emoji: "🏓" },
  { id: "pulse", label: "Pulse",  description: "Low rhythmic pulse",                    emoji: "💓" },
  { id: "siren", label: "Siren",  description: "Two-tone alternating siren",            emoji: "🚨" },
];

export default function SettingsPage() {
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [alarmSound, setAlarmSound] = useState<AlarmSound>("beep");
  const [alarmStyle, setAlarmStyle] = useState<AlarmStyle>("fullscreen");
  const [glassEnabled, setGlassEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [soundSaving, setSoundSaving] = useState(false);
  const [soundSaved, setSoundSaved] = useState(false);
  const [styleSaving, setStyleSaving] = useState(false);
  const [styleSaved, setStyleSaved] = useState(false);
  const [glassSaving, setGlassSaving] = useState(false);
  const [glassSaved, setGlassSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accentId, setAccentId] = useState<AccentId>("indigo");
  const [showPreview, setShowPreview] = useState(false);
  const stopPreviewRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setAccentId(getAccentColor());
  }, []);

  useEffect(() => {
    authService.getMe()
      .then((user) => {
        setAlarmEnabled(user.alarm_enabled);
        setAlarmSound((user.alarm_sound as AlarmSound) ?? "beep");
        setAlarmStyle((user.alarm_style as AlarmStyle) ?? "fullscreen");
        setGlassEnabled(user.glassmorphism_enabled);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  // Stop any preview when unmounting
  useEffect(() => {
    return () => { stopPreviewRef.current?.(); };
  }, []);

  const toggle = async (value: boolean) => {
    setAlarmEnabled(value);
    setSaving(true);
    setSaved(false);
    try {
      await saveAlarmEnabled(value);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setAlarmEnabled(!value);
    } finally {
      setSaving(false);
    }
  };

  const pickSound = async (sound: AlarmSound) => {
    setAlarmSound(sound);
    setSoundSaving(true);
    setSoundSaved(false);
    try {
      await saveAlarmSound(sound);
      setSoundSaved(true);
      setTimeout(() => setSoundSaved(false), 2500);
    } catch {
      // revert is unnecessary — it's just a preference
    } finally {
      setSoundSaving(false);
    }
  };

  const previewSound = (sound: AlarmSound) => {
    stopPreviewRef.current?.();
    const stop = playAlarmSound(sound);
    stopPreviewRef.current = stop;
    setTimeout(() => {
      stop();
      if (stopPreviewRef.current === stop) stopPreviewRef.current = null;
    }, 3000);
  };

  const triggerPreview = () => {
    setShowPreview(true);
    previewSound(alarmSound);
    setTimeout(() => setShowPreview(false), 6000);
  };

  const pickStyle = async (style: AlarmStyle) => {
    setAlarmStyle(style);
    setStyleSaving(true);
    setStyleSaved(false);
    try {
      await saveAlarmStyle(style);
      setStyleSaved(true);
      setTimeout(() => setStyleSaved(false), 2500);
    } catch {
      // preference, no revert needed
    } finally {
      setStyleSaving(false);
    }
  };

  const toggleGlass = async (value: boolean) => {
    setGlassEnabled(value);
    setGlassSaving(true);
    setGlassSaved(false);
    try {
      await saveGlassmorphism(value);
      setGlassSaved(true);
      setTimeout(() => setGlassSaved(false), 2500);
    } catch {
      setGlassEnabled(!value);
    } finally {
      setGlassSaving(false);
    }
  };

  const pickAccent = (id: AccentId) => {
    setAccentId(id);
    saveAccentColor(id);
    persistAccentColor(id, alarmEnabled).catch(() => {});
  };

  if (loading) return <PageLoader />;
  if (error) return (
    <ErrorState
      message={error}
      onRetry={() => {
        setError(null);
        setLoading(true);
        authService.getMe()
          .then((u) => {
            setAlarmEnabled(u.alarm_enabled);
            setAlarmSound((u.alarm_sound as AlarmSound) ?? "beep");
            setAlarmStyle((u.alarm_style as AlarmStyle) ?? "fullscreen");
            setGlassEnabled(u.glassmorphism_enabled);
          })
          .catch((e) => setError(e instanceof Error ? e.message : "Failed"))
          .finally(() => setLoading(false));
      }}
    />
  );

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Settings"
        subtitle="Manage your personal preferences"
      />

      {/* App Color card */}
      <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#12141c] shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 dark:border-white/4">
          <div className="h-9 w-9 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-500">
            <Palette size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white leading-none">App Color</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Choose the accent color used throughout the app</p>
          </div>
        </div>

        <div className="px-6 py-6">
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
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150 ${
                      isActive ? "scale-110" : "hover:scale-105"
                    }`}
                    style={{
                      backgroundColor: accent.hex,
                      boxShadow: isActive ? `0 0 0 2px white, 0 0 0 4px ${accent.hex}` : undefined,
                    }}
                  >
                    {isActive && (
                      <svg viewBox="0 0 12 12" className="h-4 w-4 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="2,6 5,9 10,3" />
                      </svg>
                    )}
                  </span>
                  <span className={`text-[10px] font-medium transition-colors ${isActive ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"}`}>
                    {accent.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Glassmorphism card */}
      <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#12141c] shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 dark:border-white/4">
          <div className="h-9 w-9 rounded-lg bg-violet-500/10 flex items-center justify-center text-violet-500">
            <Sparkles size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white leading-none">
              Glassmorphism
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Apply a frosted-glass effect to cards and panels across the app
            </p>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Sparkles
                size={20}
                className={`mt-0.5 shrink-0 ${glassEnabled ? "text-violet-500" : "text-slate-400"}`}
              />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {glassEnabled ? "Glass effect enabled" : "Glass effect disabled"}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {glassEnabled
                    ? "Cards and panels use a semi-transparent frosted-glass look."
                    : "Cards use solid backgrounds (default)."}
                </p>
              </div>
            </div>
            <button
              role="switch"
              aria-checked={glassEnabled}
              disabled={glassSaving}
              onClick={() => toggleGlass(!glassEnabled)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                glassEnabled ? "bg-violet-500" : "bg-slate-200 dark:bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow transform transition duration-200 ${
                  glassEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {glassEnabled && (
            <div className="rounded-xl bg-violet-50 dark:bg-violet-500/6 border border-violet-200 dark:border-violet-500/20 px-4 py-4">
              <p className="text-xs text-violet-700 dark:text-violet-300 font-medium">
                Glassmorphism is active — this card and all major panels now use the frosted-glass style.
              </p>
            </div>
          )}

          {glassSaving && (
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Loader2 size={13} className="animate-spin" />
              Saving...
            </div>
          )}
          {glassSaved && !glassSaving && (
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-500 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
              <CheckCircle size={14} />
              Setting saved successfully.
            </div>
          )}
        </div>
      </div>

      {/* Interview Alerts card */}
      <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/6 bg-white dark:bg-[#12141c] shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 dark:border-white/4">
          <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center text-red-500">
            <Bell size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white leading-none">
              Interview Alerts
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Audible alarm that fires before upcoming interviews
            </p>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">
          {/* Enable/disable toggle */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              {alarmEnabled ? (
                <Bell size={20} className="mt-0.5 shrink-0 text-indigo-500" />
              ) : (
                <BellOff size={20} className="mt-0.5 shrink-0 text-slate-400" />
              )}
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {alarmEnabled ? "Alarm enabled" : "Alarm disabled"}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {alarmEnabled
                    ? "You will hear an audible alarm before each interview."
                    : "No alarm will sound for upcoming interviews."}
                </p>
              </div>
            </div>
            <button
              role="switch"
              aria-checked={alarmEnabled}
              disabled={saving}
              onClick={() => toggle(!alarmEnabled)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                alarmEnabled ? "bg-indigo-500" : "bg-slate-200 dark:bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow transform transition duration-200 ${
                  alarmEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Thresholds info — shown when alarm is on */}
          {alarmEnabled && (
            <div className="rounded-xl bg-slate-50 dark:bg-white/3 border border-slate-100 dark:border-white/4 px-4 py-4">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                Alarm fires at
              </p>
              <div className="flex flex-wrap gap-2">
                {[60, 30, 15].map((min) => (
                  <span
                    key={min}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-semibold border border-indigo-500/20"
                  >
                    <Clock size={11} />
                    {min} min before
                  </span>
                ))}
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
                A catch-up alarm also fires if you open the app within 60 minutes of a scheduled interview.
              </p>
            </div>
          )}

          {/* Sound picker — always visible */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Volume2 size={14} className="text-slate-400" />
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Alarm Sound
              </p>
              {soundSaving && <Loader2 size={11} className="animate-spin text-slate-400 ml-auto" />}
              {soundSaved && !soundSaving && <CheckCircle size={11} className="text-emerald-500 ml-auto" />}
            </div>
            <div className="grid grid-cols-1 gap-2">
              {SOUND_OPTIONS.map((opt) => {
                const isActive = alarmSound === opt.id;
                return (
                  <div
                    key={opt.id}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                      isActive
                        ? "border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-500/8"
                        : "border-slate-200 dark:border-white/6 bg-slate-50 dark:bg-white/2 hover:bg-slate-100 dark:hover:bg-white/4"
                    }`}
                    onClick={() => pickSound(opt.id)}
                  >
                    <span className="text-lg select-none">{opt.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${isActive ? "text-indigo-700 dark:text-indigo-300" : "text-slate-700 dark:text-slate-300"}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{opt.description}</p>
                    </div>
                    {/* Radio indicator */}
                    <div className={`shrink-0 h-4 w-4 rounded-full border-2 transition-colors ${
                      isActive
                        ? "border-indigo-500 bg-indigo-500"
                        : "border-slate-300 dark:border-slate-600 bg-transparent"
                    }`}>
                      {isActive && <div className="h-full w-full flex items-center justify-center"><div className="h-1.5 w-1.5 rounded-full bg-white" /></div>}
                    </div>
                    {/* Preview button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); previewSound(opt.id); }}
                      title="Preview sound"
                      className="shrink-0 h-7 w-7 flex items-center justify-center rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-white/6 dark:hover:bg-white/12 text-slate-500 dark:text-slate-400 transition-colors"
                    >
                      <Volume2 size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notification style — always visible */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Monitor size={14} className="text-slate-400" />
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Notification Style
              </p>
              {styleSaving && <Loader2 size={11} className="animate-spin text-slate-400 ml-auto" />}
              {styleSaved && !styleSaving && <CheckCircle size={11} className="text-emerald-500 ml-auto" />}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* Full screen option */}
              <button
                onClick={() => pickStyle("fullscreen")}
                className={`flex flex-col items-center gap-2 px-4 py-5 rounded-xl border transition-all duration-150 ${
                  alarmStyle === "fullscreen"
                    ? "border-red-400 dark:border-red-500 bg-red-50 dark:bg-red-500/8"
                    : "border-slate-200 dark:border-white/6 bg-slate-50 dark:bg-white/2 hover:bg-slate-100 dark:hover:bg-white/4"
                }`}
              >
                <Monitor size={22} className={alarmStyle === "fullscreen" ? "text-red-500" : "text-slate-400"} />
                <div className="text-center">
                  <p className={`text-sm font-bold ${alarmStyle === "fullscreen" ? "text-red-600 dark:text-red-400" : "text-slate-600 dark:text-slate-300"}`}>
                    Full Screen
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">
                    Flashing overlay that takes over the screen
                  </p>
                </div>
                {alarmStyle === "fullscreen" && (
                  <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                )}
              </button>

              {/* Toast option */}
              <button
                onClick={() => pickStyle("toast")}
                className={`flex flex-col items-center gap-2 px-4 py-5 rounded-xl border transition-all duration-150 ${
                  alarmStyle === "toast"
                    ? "border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-500/8"
                    : "border-slate-200 dark:border-white/6 bg-slate-50 dark:bg-white/2 hover:bg-slate-100 dark:hover:bg-white/4"
                }`}
              >
                <MessageSquare size={22} className={alarmStyle === "toast" ? "text-indigo-500" : "text-slate-400"} />
                <div className="text-center">
                  <p className={`text-sm font-bold ${alarmStyle === "toast" ? "text-indigo-600 dark:text-indigo-400" : "text-slate-600 dark:text-slate-300"}`}>
                    Toast
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 leading-tight">
                    Compact card at top of screen, auto-dismisses
                  </p>
                </div>
                {alarmStyle === "toast" && (
                  <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                )}
              </button>
            </div>
          </div>

          {/* Preview notification button */}
          <div className="pt-1">
            <button
              onClick={triggerPreview}
              disabled={showPreview}
              className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-slate-300 dark:border-white/10 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:border-indigo-500 dark:hover:text-indigo-400 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Bell size={14} />
              {showPreview ? "Previewing…" : "Preview Notification"}
            </button>
            <p className="text-[11px] text-center text-slate-400 dark:text-slate-500 mt-2">
              Shows a mock alert using your current style and sound for 6 seconds
            </p>
          </div>

          {/* Feedback */}
          {saving && (
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Loader2 size={13} className="animate-spin" />
              Saving...
            </div>
          )}
          {saved && !saving && (
            <div className="flex items-center gap-2 text-xs font-medium text-emerald-500 bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
              <CheckCircle size={14} />
              Setting saved successfully.
            </div>
          )}
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
