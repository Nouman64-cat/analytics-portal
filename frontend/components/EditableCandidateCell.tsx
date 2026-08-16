"use client";

import { useState } from "react";
import { Pencil, Loader2 } from "lucide-react";
import CandidateAvatar from "@/components/CandidateAvatar";
import SearchableSelect from "@/components/SearchableSelect";
import type { Candidate } from "@/lib/types";

interface Props {
  candidateId: string | null;
  candidateName: string | null;
  candidates: Candidate[];
  /** Whether the current user is allowed to change this field. */
  editable: boolean;
  /** Whether the field may be cleared to "no candidate" (leads: yes, interviews: no). */
  optional?: boolean;
  onSave: (candidateId: string) => Promise<void>;
}

/** Candidate cell for a table row: avatar + name, with a keyboard-accessible "change" control. */
export default function EditableCandidateCell({
  candidateId,
  candidateName,
  candidates,
  editable,
  optional = false,
  onSave,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const candidate = candidates.find((c) => c.id === candidateId);

  if (editing) {
    return (
      <div
        className="w-44"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setEditing(false);
        }}
      >
        <SearchableSelect
          options={candidates.map((c) => ({ id: c.id, label: c.name }))}
          value={candidateId ?? ""}
          onChange={(id) => {
            setEditing(false);
            if (id === (candidateId ?? "")) return;
            setSaving(true);
            onSave(id).finally(() => setSaving(false));
          }}
          placeholder="Select candidate…"
          optional={optional}
          autoFocus
        />
      </div>
    );
  }

  return (
    <span className="group/cell inline-flex w-44 items-center gap-1.5">
      {candidate && <CandidateAvatar candidate={candidate} size={18} />}
      <span className="truncate">{candidateName ?? "—"}</span>
      {editable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditing(true);
          }}
          disabled={saving}
          title="Change candidate"
          aria-label="Change candidate"
          className="shrink-0 rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:text-indigo-500 focus-visible:opacity-100 group-hover/cell:opacity-100"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={12} />}
        </button>
      )}
    </span>
  );
}
