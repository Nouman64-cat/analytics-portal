"use client";

import { useState, type ReactNode } from "react";
import { Pencil, Loader2 } from "lucide-react";
import ProfileAvatar from "@/components/ProfileAvatar";
import SearchableSelect from "@/components/SearchableSelect";

interface ProfileOption {
  id: string;
  name: string;
}

interface Props {
  profileId: string | null;
  profileName: string | null;
  profiles: ProfileOption[];
  /** Whether the current user is allowed to change this field. */
  editable: boolean;
  onSave: (profileId: string) => Promise<void>;
  /** Extra trigger rendered next to the avatar (e.g. Interviews page's links popover button). */
  extra?: ReactNode;
}

/** Resume-profile cell for a table row: avatar + name, with a keyboard-accessible "change" control. */
export default function EditableProfileCell({
  profileId,
  profileName,
  profiles,
  editable,
  onSave,
  extra,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  if (editing) {
    return (
      <div
        className="w-44"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setEditing(false);
        }}
      >
        <SearchableSelect
          options={profiles.map((p) => ({ id: p.id, label: p.name }))}
          value={profileId ?? ""}
          onChange={(id) => {
            setEditing(false);
            if (!id || id === (profileId ?? "")) return;
            setSaving(true);
            onSave(id).finally(() => setSaving(false));
          }}
          placeholder="Select profile…"
          autoFocus
        />
      </div>
    );
  }

  if (!profileName) {
    return <span className="text-slate-400 dark:text-slate-600">—</span>;
  }

  return (
    <span className="group/cell inline-flex items-center gap-1.5">
      <ProfileAvatar profile={{ id: profileId ?? profileName, name: profileName }} size={24} />
      {extra}
      {editable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          disabled={saving}
          title="Change profile"
          aria-label="Change profile"
          className="shrink-0 rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:text-indigo-500 focus-visible:opacity-100 group-hover/cell:opacity-100"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />}
        </button>
      )}
    </span>
  );
}
