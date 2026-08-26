"use client";

import { useEffect, useState } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import Modal, { FormField, selectClass, buttonPrimary, buttonSecondary } from "@/components/Modal";
import { departmentsService, interviewsService } from "@/lib/services";
import type { Department, ImportJob } from "@/lib/types";

const SHEETS = ["AIML", "DevOps", "Data"] as const;

interface ImportInterviewsModalProps {
  open: boolean;
  onClose: () => void;
  onImportStarted: (job: ImportJob) => void;
}

/** Upload an .xlsx of legacy interview data — each of the 3 fixed sheets (AIML/DevOps/Data)
 * needs a target department picked before the import can run, since departments here are
 * freeform/admin-created and none of the sheet names are guaranteed to already exist. */
export default function ImportInterviewsModal({ open, onClose, onImportStarted }: ImportInterviewsModalProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [deptMap, setDeptMap] = useState<Record<string, string>>({ AIML: "", DevOps: "", Data: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    setDeptMap({ AIML: "", DevOps: "", Data: "" });
    setError(null);
    departmentsService.list().then(setDepartments).catch(() => setDepartments([]));
  }, [open]);

  const canSubmit = !!file && SHEETS.every((s) => !!deptMap[s]) && !submitting;

  const handleSubmit = async () => {
    if (!file) return;
    setSubmitting(true);
    setError(null);
    try {
      const job = await interviewsService.startImport(file, deptMap);
      onImportStarted(job);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the import.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import interviews from Excel" size="sm">
      <div className="space-y-5">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Upload an .xlsx with AIML, DevOps, and Data sheets. The import runs in the background —
          you can keep working while it processes. Re-uploading the same file is safe; matching
          rows are skipped, not duplicated.
        </p>

        <FormField label="File">
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-white/[0.12] bg-slate-50 dark:bg-white/[0.02] px-4 py-6 text-center transition-colors hover:border-indigo-400 dark:hover:border-indigo-500/40">
            <UploadCloud size={22} className="text-slate-400" />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              {file ? file.name : "Click to choose an .xlsx file"}
            </span>
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </FormField>

        {SHEETS.map((sheet) => (
          <FormField key={sheet} label={`Department for "${sheet}" sheet`}>
            <select
              className={selectClass}
              value={deptMap[sheet]}
              onChange={(e) => setDeptMap((m) => ({ ...m, [sheet]: e.target.value }))}
            >
              <option value="">Select a department…</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </FormField>
        ))}

        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500 dark:text-red-400">{error}</p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={buttonSecondary}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={!canSubmit} className={`${buttonPrimary} disabled:opacity-40 disabled:cursor-not-allowed`}>
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />}
            Start import
          </button>
        </div>
      </div>
    </Modal>
  );
}
