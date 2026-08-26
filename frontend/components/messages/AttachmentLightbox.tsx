"use client";

import { useEffect } from "react";
import { Download, X } from "lucide-react";
import type { MessageAttachment } from "@/lib/types";

/** Full-screen in-app preview for an image attachment. PDFs skip this entirely and open
 * straight in a new tab (like WhatsApp) — only images get an in-app lightbox. Closes on
 * Escape, backdrop click, or the X button. */
export default function AttachmentLightbox({
  attachment,
  onClose,
}: {
  attachment: MessageAttachment | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!attachment) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [attachment, onClose]);

  if (!attachment) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={attachment.filename}
    >
      <div
        className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="min-w-0 truncate text-sm font-medium">{attachment.filename}</span>
        <div className="flex shrink-0 items-center gap-1">
          <a
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            download={attachment.filename}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            title="Download"
            aria-label="Download"
          >
            <Download size={18} />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            title="Close"
            aria-label="Close preview"
          >
            <X size={20} />
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-4 pb-4" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element -- presigned S3 URL, not a static/local asset next/image can optimize */}
        <img
          src={attachment.url}
          alt={attachment.filename}
          className="max-h-full max-w-full rounded-lg object-contain"
        />
      </div>
    </div>
  );
}
