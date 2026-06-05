"use client";

import { useEffect, useState } from "react";
import {
  Megaphone, Plus, Trash2, Radio, RadioTower, Pencil,
  Eye, EyeOff, Loader2, AlignLeft, AlignCenter,
  Sparkles, ImageIcon, Type, Move, Wand2,
  ZoomIn, ArrowUpFromLine, SlidersHorizontal, Proportions,
} from "lucide-react";
import { broadcastModalService } from "@/lib/services";
import type {
  BroadcastModal, BroadcastTheme, BroadcastTitleSize,
  BroadcastModalSize, BroadcastTextAlign, BroadcastAnimation,
  BroadcastImageFit, BroadcastEffect,
} from "@/lib/types";
import { PageLoader, ErrorState, PageHeader } from "@/components/PageStates";
import Modal, { FormField, inputClass, textareaClass, buttonPrimary, buttonSecondary } from "@/components/Modal";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import {
  BroadcastCard, BROADCAST_THEMES, BROADCAST_ICON_LIST,
  BROADCAST_MODAL_SIZES, BROADCAST_ANIMATIONS,
  BROADCAST_IMAGE_FITS, BROADCAST_EFFECTS,
} from "@/components/BroadcastModalViewer";

// ─── Constants ────────────────────────────────────────────────

const TITLE_SIZE_OPTIONS: { value: BroadcastTitleSize; label: string; cls: string }[] = [
  { value: "sm", label: "S",  cls: "text-xs"  },
  { value: "md", label: "M",  cls: "text-sm"  },
  { value: "lg", label: "L",  cls: "text-lg"  },
  { value: "xl", label: "XL", cls: "text-2xl" },
];

const DEFAULT_FORM = {
  title: "",
  body: "",
  theme: "indigo" as BroadcastTheme,
  title_size: "md" as BroadcastTitleSize,
  modal_size: "md" as BroadcastModalSize,
  icon: "Megaphone",
  text_align: "left" as BroadcastTextAlign,
  show_glow: false,
  animation: "zoom" as BroadcastAnimation,
  image_url: "",
  image_fit: "contain" as BroadcastImageFit,
  effect: "none" as BroadcastEffect,
  badge_label: "Announcement",
  close_button_label: "Got it",
};
type FormState = typeof DEFAULT_FORM;

// ─── Page ─────────────────────────────────────────────────────

export default function AnnouncementsPage() {
  const [modals, setModals] = useState<BroadcastModal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BroadcastModal | null>(null);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [previewing, setPreviewing] = useState<BroadcastModal | null>(null);
  const [deleting, setDeleting] = useState<BroadcastModal | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);

  async function load() {
    setError(null);
    try { setModals(await broadcastModalService.list()); }
    catch (err) { setError(err instanceof Error ? err.message : "Failed to load"); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setFormError(null);
    setFormOpen(true);
  }

  function openEdit(m: BroadcastModal) {
    setEditing(m);
    setForm({
      title: m.title,
      body: m.body,
      theme: m.theme as BroadcastTheme,
      title_size: m.title_size as BroadcastTitleSize,
      modal_size: (m.modal_size ?? "md") as BroadcastModalSize,
      icon: m.icon ?? "Megaphone",
      text_align: (m.text_align ?? "left") as BroadcastTextAlign,
      show_glow: m.show_glow ?? false,
      animation: (m.animation ?? "zoom") as BroadcastAnimation,
      image_url: m.image_url ?? "",
      image_fit: (m.image_fit ?? "contain") as BroadcastImageFit,
      effect: (m.effect ?? "none") as BroadcastEffect,
      badge_label: m.badge_label,
      close_button_label: m.close_button_label,
    });
    setFormError(null);
    setFormOpen(true);
  }

  // Live preview built from form state — no API call needed
  const livePreview: BroadcastModal = {
    id: "preview",
    is_published: false,
    created_by_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    published_at: null,
    ...form,
    image_url: form.image_url || null,
    image_fit: form.image_fit,
    effect: form.effect,
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setFormError("Title is required"); return; }
    setSaving(true);
    setFormError(null);
    const payload = { ...form, image_url: form.image_url || null };
    try {
      if (editing) {
        const updated = await broadcastModalService.update(editing.id, payload);
        setModals((prev) => prev.map((m) => m.id === updated.id ? updated : m));
      } else {
        const created = await broadcastModalService.create(payload);
        setModals((prev) => [created, ...prev]);
      }
      setFormOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to save");
    } finally { setSaving(false); }
  }

  async function togglePublish(m: BroadcastModal) {
    setPublishingId(m.id);
    try {
      const updated = m.is_published
        ? await broadcastModalService.unpublish(m.id)
        : await broadcastModalService.publish(m.id);
      if (!m.is_published) {
        setModals((prev) => prev.map((x) => x.id === updated.id ? updated : { ...x, is_published: false }));
      } else {
        setModals((prev) => prev.map((x) => x.id === updated.id ? updated : x));
      }
    } catch { /* ignore */ }
    finally { setPublishingId(null); }
  }

  async function handleDelete() {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await broadcastModalService.delete(deleting.id);
      setModals((prev) => prev.filter((m) => m.id !== deleting.id));
      setDeleting(null);
    } catch { /* ignore */ }
    finally { setDeleteLoading(false); }
  }

  if (loading) return <PageLoader />;
  if (error) return <ErrorState message={error} onRetry={() => { setLoading(true); load(); }} />;

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-fade-in pb-12">
      <PageHeader
        title="Announcements"
        subtitle="Broadcast styled popups to all users instantly"
        action={
          <button onClick={openCreate} className={buttonPrimary}>
            <Plus size={15} /> New Announcement
          </button>
        }
      />

      {/* ── List ── */}
      {modals.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-white/[0.08] py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500">
            <Megaphone size={24} />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No announcements yet</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Create one and publish it to broadcast to all users</p>
          <button onClick={openCreate} className={`${buttonPrimary} mt-5`}><Plus size={14} /> Create announcement</button>
        </div>
      ) : (
        <div className="space-y-3">
          {modals.map((m) => {
            const t = BROADCAST_THEMES[m.theme as BroadcastTheme] ?? BROADCAST_THEMES.indigo;
            return (
              <div key={m.id} className={`rounded-2xl border bg-white dark:bg-[#12141c] shadow-sm overflow-hidden transition-all ${m.is_published ? `${t.border}` : "border-slate-200 dark:border-white/[0.06]"}`}>
                {m.is_published && <div className={`h-0.5 w-full bg-gradient-to-r ${t.bar}`} />}
                <div className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${m.is_published ? `bg-gradient-to-br ${t.iconGradient} text-white` : "bg-slate-100 dark:bg-white/[0.05] text-slate-400"}`}
                      style={m.is_published ? { boxShadow: `0 4px 14px 0 ${t.hex}40` } : undefined}>
                      <Megaphone size={15} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{m.title}</span>
                        {m.is_published && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                            style={{ background: `${t.hex}18`, color: t.hex, border: `1px solid ${t.hex}40` }}>
                            <Radio size={8} className="animate-pulse" /> Live
                          </span>
                        )}
                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: t.hex }} title={t.label} />
                      </div>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                        {t.label} · {m.icon} · {(m.modal_size ?? "md").toUpperCase()} · {m.text_align}
                        {m.show_glow ? " · Glow" : ""}
                        {m.image_url ? " · Image" : ""}
                        {m.published_at ? ` · Live since ${new Date(m.published_at).toLocaleString()}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-white/[0.04] flex-wrap">
                    <button onClick={() => togglePublish(m)} disabled={publishingId === m.id}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50 ${m.is_published ? "bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[0.08]" : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20"}`}>
                      {publishingId === m.id ? <Loader2 size={12} className="animate-spin" /> : m.is_published ? <EyeOff size={12} /> : <RadioTower size={12} />}
                      {m.is_published ? "Unpublish" : "Publish"}
                    </button>
                    <button onClick={() => setPreviewing(m)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[0.08] transition-all">
                      <Eye size={12} /> Preview
                    </button>
                    <button onClick={() => openEdit(m)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[0.08] transition-all">
                      <Pencil size={12} /> Edit
                    </button>
                    <button onClick={() => setDeleting(m)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-all">
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit modal ── */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? "Edit Announcement" : "New Announcement"} size="xl">
        {/* xl:h-full so both columns can independently scroll within the modal body */}
        <div className="flex flex-col xl:flex-row xl:h-full gap-6">

          {/* ── Left: form — scrolls independently at xl ── */}
          <form onSubmit={handleSubmit} className="flex-1 min-w-0 min-h-0 space-y-6 xl:overflow-y-auto xl:pr-2">

            {/* Content */}
            <Section icon={<SlidersHorizontal size={13} />} label="Content">
              <FormField label="Title">
                <input className={inputClass} placeholder="Announcement title…" value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
              </FormField>
              <FormField label="Body (Markdown)">
                <textarea className={`${textareaClass} min-h-[110px]`}
                  placeholder={"Write your message here…\n\nSupports **bold**, _italic_, [links](url), lists, etc."}
                  value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
              </FormField>
            </Section>

            {/* Theme */}
            <Section icon={<Sparkles size={13} />} label="Color Theme">
              <div className="flex flex-wrap gap-2.5 pt-0.5">
                {(Object.entries(BROADCAST_THEMES) as [BroadcastTheme, typeof BROADCAST_THEMES[BroadcastTheme]][]).map(([key, t]) => (
                  <button key={key} type="button" onClick={() => setForm((f) => ({ ...f, theme: key }))} title={t.label}
                    className="flex flex-col items-center gap-1">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full transition-all ${form.theme === key ? "scale-110" : "hover:scale-105"}`}
                      style={{ background: t.hex, boxShadow: form.theme === key ? `0 0 0 2px white, 0 0 0 4px ${t.hex}` : undefined }}>
                      {form.theme === key && (
                        <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="2,6 5,9 10,3" />
                        </svg>
                      )}
                    </span>
                    <span className={`text-[9px] font-medium ${form.theme === key ? "text-slate-900 dark:text-white" : "text-slate-400"}`}>{t.label}</span>
                  </button>
                ))}
              </div>
            </Section>

            {/* Icon */}
            <Section icon={<Wand2 size={13} />} label="Icon">
              <div className="grid grid-cols-7 gap-1.5">
                {BROADCAST_ICON_LIST.map(({ key, Icon }) => (
                  <button key={key} type="button" onClick={() => setForm((f) => ({ ...f, icon: key }))}
                    title={key}
                    className={`flex items-center justify-center h-9 w-full rounded-xl border transition-all ${form.icon === key ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : "border-slate-200 dark:border-white/[0.08] text-slate-400 hover:border-slate-300 dark:hover:border-white/[0.15] hover:text-slate-700 dark:hover:text-slate-200"}`}>
                    <Icon size={16} />
                  </button>
                ))}
              </div>
            </Section>

            {/* Layout row: size + title size + alignment */}
            <div className="grid grid-cols-3 gap-4">
              <Section icon={<Move size={13} />} label="Width">
                <div className="flex flex-col gap-1.5">
                  {(Object.entries(BROADCAST_MODAL_SIZES) as [BroadcastModalSize, { label: string; maxW: string }][]).map(([key, val]) => (
                    <button key={key} type="button" onClick={() => setForm((f) => ({ ...f, modal_size: key }))}
                      className={`rounded-lg border py-1.5 text-xs font-semibold text-center transition-all ${form.modal_size === key ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : "border-slate-200 dark:border-white/[0.08] text-slate-500 hover:border-slate-300"}`}>
                      {val.label}
                    </button>
                  ))}
                </div>
              </Section>

              <Section icon={<Type size={13} />} label="Title Size">
                <div className="flex flex-col gap-1.5">
                  {TITLE_SIZE_OPTIONS.map((opt) => (
                    <button key={opt.value} type="button" onClick={() => setForm((f) => ({ ...f, title_size: opt.value }))}
                      className={`rounded-lg border py-1.5 text-center transition-all ${form.title_size === opt.value ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : "border-slate-200 dark:border-white/[0.08] text-slate-500 hover:border-slate-300"}`}>
                      <span className={`${opt.cls} font-bold leading-none`}>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </Section>

              <Section icon={<AlignLeft size={13} />} label="Alignment">
                <div className="flex flex-col gap-1.5">
                  {[
                    { value: "left" as BroadcastTextAlign, label: "Left", Icon: AlignLeft },
                    { value: "center" as BroadcastTextAlign, label: "Center", Icon: AlignCenter },
                  ].map(({ value, label, Icon }) => (
                    <button key={value} type="button" onClick={() => setForm((f) => ({ ...f, text_align: value }))}
                      className={`flex items-center justify-center gap-1.5 rounded-lg border py-1.5 text-xs font-semibold transition-all ${form.text_align === value ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : "border-slate-200 dark:border-white/[0.08] text-slate-500 hover:border-slate-300"}`}>
                      <Icon size={13} />{label}
                    </button>
                  ))}
                </div>
              </Section>
            </div>

            {/* Animation + Glow row */}
            <div className="grid grid-cols-2 gap-4">
              <Section icon={<ZoomIn size={13} />} label="Entrance Animation">
                <div className="flex flex-col gap-1.5">
                  {(Object.entries(BROADCAST_ANIMATIONS) as [BroadcastAnimation, { label: string; wrapperClass: string }][]).map(([key, val]) => (
                    <button key={key} type="button" onClick={() => setForm((f) => ({ ...f, animation: key }))}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${form.animation === key ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : "border-slate-200 dark:border-white/[0.08] text-slate-500 hover:border-slate-300"}`}>
                      {key === "zoom"  && <ZoomIn size={12} />}
                      {key === "slide" && <ArrowUpFromLine size={12} />}
                      {key === "fade"  && <span className="text-[10px] font-black opacity-60">F</span>}
                      {val.label}
                    </button>
                  ))}
                </div>
              </Section>

              <Section icon={<Sparkles size={13} />} label="Glow Effect">
                <button type="button" onClick={() => setForm((f) => ({ ...f, show_glow: !f.show_glow }))}
                  className={`w-full flex items-center justify-between rounded-xl border px-3 py-3 transition-all ${form.show_glow ? "border-indigo-500/40 bg-indigo-500/10" : "border-slate-200 dark:border-white/[0.08] hover:border-slate-300"}`}>
                  <div>
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">Colored glow</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Adds a halo around the modal</p>
                  </div>
                  <div className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${form.show_glow ? "bg-indigo-500" : "bg-slate-200 dark:bg-white/10"}`}>
                    <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.show_glow ? "translate-x-4" : "translate-x-0"}`} />
                  </div>
                </button>
              </Section>
            </div>

            {/* Labels */}
            <Section icon={<Type size={13} />} label="Labels">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Badge Text">
                  <input className={inputClass} placeholder="Announcement" value={form.badge_label}
                    onChange={(e) => setForm((f) => ({ ...f, badge_label: e.target.value }))} />
                </FormField>
                <FormField label="Button Text">
                  <input className={inputClass} placeholder="Got it" value={form.close_button_label}
                    onChange={(e) => setForm((f) => ({ ...f, close_button_label: e.target.value }))} />
                </FormField>
              </div>
            </Section>

            {/* Celebration Effect */}
            <Section icon={<Sparkles size={13} />} label="Celebration Effect">
              <div className="grid grid-cols-5 gap-1.5">
                {(Object.entries(BROADCAST_EFFECTS) as [BroadcastEffect, typeof BROADCAST_EFFECTS[BroadcastEffect]][]).map(([key, val]) => (
                  <button key={key} type="button" onClick={() => setForm((f) => ({ ...f, effect: key }))}
                    className={`flex flex-col items-center gap-1 rounded-xl border py-2 px-1 transition-all ${form.effect === key ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : "border-slate-200 dark:border-white/[0.08] text-slate-500 hover:border-slate-300 dark:hover:border-white/[0.15]"}`}>
                    <span className="text-base leading-none">{val.emoji}</span>
                    <span className="text-[9px] font-semibold">{val.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">
                {BROADCAST_EFFECTS[form.effect]?.description} — fires once when the popup first appears
              </p>
            </Section>

            {/* Image */}
            <Section icon={<ImageIcon size={13} />} label="Banner Image (optional)">
              <FormField label="Image URL">
                <input className={inputClass} placeholder="https://example.com/image.jpg" value={form.image_url}
                  onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))} />
              </FormField>
              {form.image_url && (
                <>
                  {/* Image fit picker */}
                  <div className="flex gap-2 mt-2">
                    {(Object.entries(BROADCAST_IMAGE_FITS) as [BroadcastImageFit, typeof BROADCAST_IMAGE_FITS[BroadcastImageFit]][]).map(([key, val]) => (
                      <button key={key} type="button" onClick={() => setForm((f) => ({ ...f, image_fit: key }))}
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all ${form.image_fit === key ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" : "border-slate-200 dark:border-white/[0.08] text-slate-500 hover:border-slate-300"}`}>
                        <Proportions size={12} />{val.label}
                        <span className="text-[9px] font-normal opacity-60">— {val.description}</span>
                      </button>
                    ))}
                  </div>
                  {/* Preview thumbnail */}
                  <div className={`w-full overflow-hidden rounded-xl border border-slate-200 dark:border-white/[0.08] mt-2 bg-slate-50 dark:bg-slate-900/40 ${form.image_fit === "cover" ? "h-28" : ""}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={form.image_url} alt=""
                      className={`w-full ${form.image_fit === "cover" ? "h-full object-cover" : "h-auto object-contain"}`}
                      style={form.image_fit === "contain" ? { maxHeight: "180px" } : undefined}
                    />
                  </div>
                </>
              )}
            </Section>

            {formError && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">{formError}</p>
            )}

            <div className="flex justify-end gap-3 pt-1 pb-2">
              <button type="button" onClick={() => setFormOpen(false)} className={buttonSecondary}>Cancel</button>
              <button type="submit" disabled={saving} className={buttonPrimary}>
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editing ? "Save changes" : "Create"}
              </button>
            </div>
          </form>

          {/* ── Right: live preview — sticks to top while form scrolls ── */}
          <div className="xl:w-[380px] shrink-0 flex flex-col gap-3 xl:self-start xl:sticky xl:top-0">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">Live Preview</p>
              <div className="flex-1 h-px bg-slate-100 dark:bg-white/[0.04]" />
            </div>
            <div className="overflow-hidden rounded-xl">
              <BroadcastCard modal={livePreview} onClose={() => {}} />
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center">
              Updates as you type · animation plays on actual popup
            </p>
          </div>
        </div>
      </Modal>

      {/* ── Fullscreen preview ── */}
      {previewing && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setPreviewing(null)} />
          <div className={`relative w-full ${BROADCAST_MODAL_SIZES[(previewing.modal_size ?? "md") as BroadcastModalSize]?.maxW ?? "max-w-lg"} entrance-zoom`}>
            <BroadcastCard modal={previewing} onClose={() => setPreviewing(null)} />
            <p className="mt-2 text-center text-xs text-slate-400 italic">Preview — click outside or the button to close</p>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      <DeleteConfirmModal
        open={!!deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete}
        isDeleting={deleteLoading} title="Delete Announcement"
        itemName={deleting?.title ?? ""} description="This action cannot be undone."
      />
    </div>
  );
}

function Section({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-slate-400 dark:text-slate-500">{icon}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">{label}</span>
        <div className="flex-1 h-px bg-slate-100 dark:bg-white/[0.04]" />
      </div>
      {children}
    </div>
  );
}
