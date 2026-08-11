import type { MediaType } from "../db/types.js";
import { imageFingerprint, robustImageFingerprints } from "./imageHash.js";
import { videoFrameHashes } from "./videoHash.js";
import { renderPdfPages, renderPdfPagesDetailed } from "./pdf.js";

export { sha256 } from "./contentHash.js";
export {
  imageFingerprint,
  robustImageFingerprints,
  changedCells,
  bestChangedCells,
  cellDiffGrid,
  coarseSignature,
  GRID_SIZE,
} from "./imageHash.js";
export { isFfmpegAvailable, videoFrameHashes } from "./videoHash.js";
export { renderPdfPages, renderPdfPagesDetailed, renderPdfFirstPage, MAX_PDF_PAGES } from "./pdf.js";
export type { PdfRender } from "./pdf.js";
export { audioFingerprint, audioChangedCells, AUDIO_SAME_MAX } from "./audioHash.js";

/**
 * Verdict thresholds on the changed-cell count (out of 1024).
 * Tuned empirically: compression -> ~0 changed cells; a localised edit -> a
 * handful; an unrelated image -> hundreds.
 */
export const DERIVATIVE_MAX_CELLS = 4; // <= this: visually identical copy
export const ALTERED_MAX_CELLS = 300; // <= this (and > derivative): same asset, edited
// > ALTERED_MAX_CELLS: not a match.

export function mediaTypeFromMime(mime: string): MediaType {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  return "text";
}

export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "image/png": "png",
    "image/jpeg": "jpg",
  };
  return map[mime] ?? mime.split("/")[1] ?? "bin";
}

/**
 * Compute perceptual fingerprints for supported media. Images -> one grid;
 * video -> per-keyframe grids (needs FFmpeg). Others -> [] (exact-hash only).
 */
export async function computePerceptualHashes(
  buffer: Buffer,
  mediaType: MediaType,
  mime: string,
): Promise<string[]> {
  try {
    if (mediaType === "image") return [await imageFingerprint(buffer)];
    if (mediaType === "video") return await videoFrameHashes(buffer, extFromMime(mime));
    if (mediaType === "pdf") {
      const pages = await renderPdfPages(buffer);
      return Promise.all(pages.map((p) => imageFingerprint(p)));
    }
  } catch (e) {
    console.error("perceptual fingerprint failed:", e);
  }
  return [];
}

export interface PdfSigningPages {
  pageCount: number; // the document's ACTUAL page count
  pageHashes: string[][]; // one geometry-robust fingerprint SET per rendered page
  truncated: boolean; // document has more pages than MAX_PDF_PAGES
}

/**
 * Per-page PDF fingerprints for SIGNING, plus the ACTUAL page count. Returns one
 * geometry-robust fingerprint SET per page, in page order, so verification can
 * compare pages by position (page 1 vs page 1, ...) instead of flattening every
 * page into one pool - which would let an unchanged page mask a tampered one.
 * `truncated` lets the caller refuse to sign documents whose pages can't all be
 * fingerprinted, rather than silently ignoring the overflow pages.
 */
export async function computePdfSigningPages(buffer: Buffer): Promise<PdfSigningPages> {
  try {
    const { numPages, pages, truncated } = await renderPdfPagesDetailed(buffer);
    const pageHashes = await Promise.all(pages.map((p) => robustImageFingerprints(p)));
    return { pageCount: numPages, pageHashes, truncated };
  } catch (e) {
    console.error("pdf page fingerprint failed:", e);
    return { pageCount: 0, pageHashes: [], truncated: false };
  }
}

/**
 * Fingerprints stored at SIGNING time. Same as {@link computePerceptualHashes}
 * for the probe, but augments image and PDF-page references with geometry-robust
 * variants (small crops/rotations) so cropped or tilted genuine forwards still
 * match their signed record. Only the reference set is augmented; the probe path
 * is unchanged, so match thresholds still gate false positives.
 */
export async function computeSigningFingerprints(
  buffer: Buffer,
  mediaType: MediaType,
  mime: string,
): Promise<string[]> {
  try {
    if (mediaType === "image") return await robustImageFingerprints(buffer);
    if (mediaType === "video") return await videoFrameHashes(buffer, extFromMime(mime));
    if (mediaType === "pdf") {
      const pages = await renderPdfPages(buffer);
      const sets = await Promise.all(pages.map((p) => robustImageFingerprints(p)));
      return sets.flat();
    }
  } catch (e) {
    console.error("signing fingerprint failed:", e);
  }
  return [];
}
