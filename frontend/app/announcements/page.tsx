"use client";

import { useEffect, useState } from "react";
import {
  Megaphone,
  Plus,
  Trash2,
  Radio,
  RadioTower,
  Pencil,
  Eye,
  EyeOff,
  Loader2,
  ImageIcon,
  Type,
  Sparkles,
  AlignLeft,
} from "lucide-react";
import { broadcastModalService } from "@/lib/services";
import type { BroadcastModal, BroadcastTheme, BroadcastTitleSize } from "@/lib/types";
import { PageLoader, ErrorState, PageHeader } from "@/components/PageStates";
import Modal, {
  FormField,
  inputClass,
  textareaClass,
  buttonPrimary,
  buttonSecondary,
} from "@/components/Modal";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import { BroadcastCard, BROADCAST_THEMES } from "@/components/BroadcastModalViewer";

// ─── Constants ────────────────────────────────────────────────

const TITLE_SIZE_OPTIONS: { value: BroadcastTitleSize; label: string; preview: string }[] = [
  { value: "sm",  label: "Small",   preview: "text-sm" },
  { value: "md",  label: "Medium",  preview: "text-base" },
  { value: "lg",  label: "Large",   preview: "text-xl" },
  { value: "xl",  label: "X-Large", preview: "text-2xl" },
];

const DEFAULT_FORM = {
  title: "",
  body: "",
  theme: "indigo" as BroadcastTheme,
  title_size: "md" as BroadcastTitleSize,
  image_url: "",
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
    try {
      setModals(await broadcastModalService.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load announcements");
    } finally {
      setLoading(false);
    }
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
      image_url: m.image_url ?? "",
      badge_label: m.badge_label,
      close_button_label: m.close_button_label,
    });
    setFormError(null);
    setFormOpen(true);
  }

  // Live preview model built from current form state
  const livePreview: BroadcastModal = {
    id: "preview",
    is_published: false,
    created_by_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    published_at: null,
    ...form,
    image_url: form.image_url || null,
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
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish(m: BroadcastModal) {
    setPublishingId(m.id);
    try {
      const updated = m.is_published
        ? await broadcastModalService.unpublish(m.id)
        : await broadcastModalService.publish(m.id);
      if (!m.is_published) {
        setModals((prev) =>
          prev.map((x) => x.id === updated.id ? updated : { ...x, is_published: false })
        );
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
            <Plus size={15} />
            New Announcement
          </button>
        }
      />

      {/* List */}
      {modals.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 dark:border-white/[0.08] py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-500">
            <Megaphone size={24} />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No announcements yet</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Create one and publish it to notify all users</p>
          <button onClick={openCreate} className={`${buttonPrimary} mt-5`}>
            <Plus size={14} /> Create announcement
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {modals.map((m) => {
            const t = BROADCAST_THEMES[m.theme as BroadcastTheme] ?? BROADCAST_THEMES.indigo;
            return (
              <div
                key={m.id}
                className={`rounded-2xl border bg-white dark:bg-[#12141c] shadow-sm overflow-hidden transition-all ${
                  m.is_published ? `${t.border} shadow-sm` : "border-slate-200 dark:border-white/[0.06]"
                }`}
              >
                {m.is_published && (
                  <div className={`h-0.5 w-full bg-gradient-to-r ${t.bar}`} />
                )}
                <div className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    {m.image_url ? (
                      <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.image_url} alt="" className="h-full w-full object-cover" />
                      </div>
                    ) : (
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          m.is_published
                            ? `bg-gradient-to-br ${t.iconGradient} text-white`
                            : "bg-slate-100 dark:bg-white/[0.05] text-slate-400"
                        }`}
                      >
                        <Megaphone size={16} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">{m.title}</h3>
                        {m.is_published && (
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-opacity-10 border border-opacity-20 ${t.badgeText}`}
                            style={{ background: `${t.hex}18`, borderColor: `${t.hex}40` }}>
                            <Radio size={9} className="animate-pulse" />
                            Live
                          </span>
                        )}
                        {/* Theme swatch */}
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ background: t.hex }}
                          title={t.label}
                        />
                      </div>
                      {m.body && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                          {m.body.replace(/[#*`_[\]]/g, "").slice(0, 100)}
                        </p>
                      )}
                      <p className="text-[10px] text-slate-400 dark:text-slate-600 mt-1.5">
                        {t.label} · {m.badge_label} · {m.title_size.toUpperCase()}
                        {m.image_url && " · Image"}
                        {m.published_at && ` · Published ${new Date(m.published_at).toLocaleString()}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-white/[0.04]">
                    <button
                      onClick={() => togglePublish(m)}
                      disabled={publishingId === m.id}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all disabled:opacity-50 ${
                        m.is_published
                          ? "bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[0.08]"
                          : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20"
                      }`}
                    >
                      {publishingId === m.id ? <Loader2 size={12} className="animate-spin" /> :
                        m.is_published ? <EyeOff size={12} /> : <RadioTower size={12} />}
                      {m.is_published ? "Unpublish" : "Publish"}
                    </button>

                    <button
                      onClick={() => setPreviewing(m)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[0.08] transition-all"
                    >
                      <Eye size={12} /> Preview
                    </button>

                    <button
                      onClick={() => openEdit(m)}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/[0.08] transition-all"
                    >
                      <Pencil size={12} /> Edit
                    </button>

                    <button
                      onClick={() => setDeleting(m)}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-all"
                    >
                      <Trash2 size={12} /> Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit modal ──────────────────────────────────── */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? "Edit Announcement" : "New Announcement"}
        size="xl"
      >
        <div className="flex flex-col xl:flex-row gap-6">
          {/* ── Left: form ── */}
          <form onSubmit={handleSubmit} className="flex-1 min-w-0 space-y-5">

            {/* Content section */}
            <div className="space-y-4">
              <SectionLabel icon={<AlignLeft size={13} />} label="Content" />

              <FormField label="Title">
                <input
                  className={inputClass}
                  placeholder="Announcement title…"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </FormField>

              <FormField label="Body (Markdown supported)">
                <textarea
                  className={`${textareaClass} min-h-[130px]`}
                  placeholder="Write your message here…&#10;You can use **bold**, _italic_, lists, [links](url), etc."
                  value={form.body}
                  onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                />
              </FormField>
            </div>

            {/* Appearance section */}
            <div className="space-y-4 pt-1">
              <SectionLabel icon={<Sparkles size={13} />} label="Appearance" />

              {/* Theme */}
              <FormField label="Color Theme">
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {(Object.entries(BROADCAST_THEMES) as [BroadcastTheme, typeof BROADCAST_THEMES[BroadcastTheme]][]).map(([key, t]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, theme: key }))}
                      title={t.label}
                      className={`flex flex-col items-center gap-1 group`}
                    >
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-full transition-all duration-150 ${
                          form.theme === key ? "scale-110" : "hover:scale-105"
                        }`}
                        style={{
                          background: t.hex,
                          boxShadow: form.theme === key ? `0 0 0 2px white, 0 0 0 4px ${t.hex}` : undefined,
                        }}
                      >
                        {form.theme === key && (
                          <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="2,6 5,9 10,3" />
                          </svg>
                        )}
                      </span>
                      <span className={`text-[9px] font-medium ${form.theme === key ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500"}`}>
                        {t.label}
                      </span>
                    </button>
                  ))}
                </div>
              </FormField>

              {/* Title size */}
              <FormField label="Title Size">
                <div className="flex gap-2">
                  {TITLE_SIZE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, title_size: opt.value }))}
                      className={`flex-1 rounded-xl border py-2 text-center transition-all ${
                        form.title_size === opt.value
                          ? "border-indigo-500/50 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-semibold"
                          : "border-slate-200 dark:border-white/[0.08] text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/[0.15]"
                      }`}
                    >
                      <span className={`${opt.preview} leading-none`}>A</span>
                      <p className="text-[9px] mt-0.5 font-medium">{opt.label}</p>
                    </button>
                  ))}
                </div>
              </FormField>
            </div>

            {/* Labels section */}
            <div className="space-y-4 pt-1">
              <SectionLabel icon={<Type size={13} />} label="Labels" />

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Badge Label">
                  <input
                    className={inputClass}
                    placeholder="e.g. Announcement"
                    value={form.badge_label}
                    onChange={(e) => setForm((f) => ({ ...f, badge_label: e.target.value }))}
                  />
                </FormField>
                <FormField label="Close Button Text">
                  <input
                    className={inputClass}
                    placeholder="e.g. Got it"
                    value={form.close_button_label}
                    onChange={(e) => setForm((f) => ({ ...f, close_button_label: e.target.value }))}
                  />
                </FormField>
              </div>
            </div>

            {/* Image section */}
            <div className="space-y-4 pt-1">
              <SectionLabel icon={<ImageIcon size={13} />} label="Banner Image (optional)" />

              <FormField label="Image URL">
                <input
                  className={inputClass}
                  placeholder="https://example.com/image.jpg"
                  value={form.image_url}
                  onChange={(e) => setForm((f) => ({ ...f, image_url: e.target.value }))}
                />
              </FormField>
              {form.image_url && (
                <div className="relative h-24 w-full overflow-hidden rounded-xl border border-slate-200 dark:border-white/[0.08]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.image_url} alt="" className="h-full w-full object-cover" />
                </div>
              )}
            </div>

            {formError && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 border border-red-500/20">
                {formError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setFormOpen(false)} className={buttonSecondary}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className={buttonPrimary}>
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editing ? "Save changes" : "Create"}
              </button>
            </div>
          </form>

          {/* ── Right: live preview ── */}
          <div className="xl:w-[380px] shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
              Live Preview
            </p>
            <div className="scale-[0.85] origin-top-left xl:scale-100">
              <BroadcastCard
                modal={livePreview}
                onClose={() => {}}
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Fullscreen preview ───────────────────────────────────── */}
      {previewing && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setPreviewing(null)}
          />
          <div className="relative animate-in zoom-in-95 duration-200">
            <BroadcastCard modal={previewing} onClose={() => setPreviewing(null)} />
            <p className="mt-2 text-center text-xs text-slate-400 italic">Preview · not visible to users</p>
          </div>
        </div>
      )}

      {/* ── Delete confirm ──────────────────────────────────────── */}
      <DeleteConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        isDeleting={deleteLoading}
        title="Delete Announcement"
        itemName={deleting?.title ?? ""}
        description="This action cannot be undone."
      />
    </div>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-400 dark:text-slate-500">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <div className="flex-1 h-px bg-slate-100 dark:bg-white/[0.04]" />
    </div>
  );
}
