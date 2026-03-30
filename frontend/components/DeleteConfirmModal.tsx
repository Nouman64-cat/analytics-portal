"use client";

import { Loader2 } from "lucide-react";
import Modal, { buttonSecondary, buttonDanger } from "@/components/Modal";

interface DeleteConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
  title: string;
  description?: string;
  itemName: string;
  itemDetail?: string;
}

export default function DeleteConfirmModal({
  open,
  onClose,
  onConfirm,
  isDeleting,
  title,
  description = "This action cannot be undone.",
  itemName,
  itemDetail,
}: DeleteConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Are you sure you want to delete this? {description}
        </p>
        <div className="rounded-xl bg-slate-50 dark:bg-white/[0.03] p-4 space-y-1">
          <p className="text-sm font-medium text-slate-900 dark:text-white">{itemName}</p>
          {itemDetail && (
            <p className="text-xs text-slate-500 dark:text-slate-400">{itemDetail}</p>
          )}
        </div>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={isDeleting} className={buttonSecondary}>
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className={`${buttonDanger} disabled:opacity-70 disabled:cursor-not-allowed flex items-center gap-2`}
          >
            {isDeleting && <Loader2 className="animate-spin" size={16} />}
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
