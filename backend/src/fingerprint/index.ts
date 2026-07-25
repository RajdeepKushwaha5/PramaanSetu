import type { MediaType } from "../db/types.js";
import { imageFingerprint } from "./imageHash.js";
import { videoFrameHashes } from "./videoHash.js";
import { renderPdfPages } from "./pdf.js";

export { sha256 } from "./contentHash.js";
export {
  imageFingerprint,
  changedCells,
  bestChangedCells,
  cellDiffGrid,
  coarseSignature,
  GRID_SIZE,
} from "./imageHash.js";
export { isFfmpegAvailable, videoFrameHashes } from "./videoHash.js";
export { renderPdfPages, renderPdfFirstPage } from "./pdf.js";

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
