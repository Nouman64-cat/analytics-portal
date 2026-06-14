"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Clock, CheckCircle, Loader2, Palette, Sparkles } from "lucide-react";
import { authService } from "@/lib/services";
import { saveAlarmEnabled, saveGlassmorphism } from "@/lib/settings";
import { ACCENT_OPTIONS, type AccentId, getAccentColor, saveAccentColor, persistAccentColor } from "@/lib/accent";
import { PageLoader, ErrorState, PageHeader } from "@/components/PageStates";

export default function SettingsPage() {
  const [alarmEnabled, setAlarmEnabled] = useState(false);
  const [glassEnabled, setGlassEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [glassSaving, setGlassSaving] = useState(false);
  const [glassSaved, setGlassSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accentId, setAccentId] = useState<AccentId>("indigo");

  useEffect(() => {
    setAccentId(getAccentColor());
  }, []);

  useEffect(() => {
    authService.getMe()
      .then((user) => {
        setAlarmEnabled(user.alarm_enabled);
        setGlassEnabled(user.glassmorphism_enabled);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load settings"))
      .finally(() => setLoading(false));
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
  if (error) return <ErrorState message={error} onRetry={() => { setError(null); setLoading(true); authService.getMe().then((u) => { setAlarmEnabled(u.alarm_enabled); setGlassEnabled(u.glassmorphism_enabled); }).catch((e) => setError(e instanceof Error ? e.message : "Failed")).finally(() => setLoading(false)); }} />;

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Settings"
        subtitle="Manage your personal preferences"
      />

      {/* App Color card */}
      <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 dark:border-white/[0.04]">
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
      <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 dark:border-white/[0.04]">
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
          {/* Toggle row */}
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

            {/* Toggle switch */}
            <button
              role="switch"
              aria-checked={glassEnabled}
              disabled={glassSaving}
              onClick={() => toggleGlass(!glassEnabled)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                glassEnabled
                  ? "bg-violet-500"
                  : "bg-slate-200 dark:bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow transform transition duration-200 ${
                  glassEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Preview hint */}
          {glassEnabled && (
            <div className="rounded-xl bg-violet-50 dark:bg-violet-500/[0.06] border border-violet-200 dark:border-violet-500/20 px-4 py-4">
              <p className="text-xs text-violet-700 dark:text-violet-300 font-medium">
                Glassmorphism is active — this card and all major panels now use the frosted-glass style.
              </p>
            </div>
          )}

          {/* Feedback */}
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
      <div className="glass-card rounded-2xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-[#12141c] shadow-sm overflow-hidden">
        {/* Card header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100 dark:border-white/[0.04]">
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
          {/* Toggle row */}
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

            {/* Toggle switch */}
            <button
              role="switch"
              aria-checked={alarmEnabled}
              disabled={saving}
              onClick={() => toggle(!alarmEnabled)}
              className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                alarmEnabled
                  ? "bg-indigo-500"
                  : "bg-slate-200 dark:bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow transform transition duration-200 ${
                  alarmEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Thresholds info */}
          {alarmEnabled && (
            <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-100 dark:border-white/[0.04] px-4 py-4">
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
    </div>
  );
}
