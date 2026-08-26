"use client";

const THUMBNAIL_MAX_WIDTH = 400;

let workerConfigured = false;

/** Renders page 1 of a PDF to a small JPEG in the browser — entirely client-side, no server
 * round trip. Used to give PDF attachments the same inline visual preview images already
 * get, instead of just a generic file icon. Best-effort: any failure (corrupt file, PDF.js
 * error, canvas unsupported) returns null and the caller just falls back to no preview. */
export async function generatePdfThumbnail(file: File): Promise<Blob | null> {
  try {
    const pdfjsLib = await import("pdfjs-dist");
    if (!workerConfigured) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      workerConfigured = true;
    }

    const data = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data }).promise;
    const page = await pdf.getPage(1);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1, THUMBNAIL_MAX_WIDTH / unscaledViewport.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.82));
  } catch {
    return null;
  }
}
