/** Validate media by its actual magic bytes, not the browser-supplied MIME. */

import { fileTypeFromBuffer } from "file-type";

const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
  "audio/ogg",
  "application/pdf",
]);

export interface MimeResult {
  ok: boolean;
  mime: string;
  reason?: string;
}

/**
 * Hard cap on a single decoded upload, enforced server-side. The Express JSON
 * limit (40mb) bounds the whole request; this bounds the actual media so a large
 * paste can't exhaust memory in fingerprinting/rendering. Matches the frontend's
 * 20 MB client-side guard so honest users never hit it.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** True if the decoded byte length is within {@link MAX_UPLOAD_BYTES}. */
export function withinUploadLimit(bytes: Buffer): boolean {
  return bytes.length <= MAX_UPLOAD_BYTES;
}

export const UPLOAD_TOO_LARGE_MESSAGE = `File exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB upload limit.`;

export async function resolveMime(bytes: Buffer): Promise<MimeResult> {
  const detected = await fileTypeFromBuffer(bytes);
  if (!detected) {
    return { ok: false, mime: "application/octet-stream", reason: "unrecognized file type" };
  }
  if (!ALLOWED.has(detected.mime)) {
    return { ok: false, mime: detected.mime, reason: `file type ${detected.mime} is not allowed` };
  }
  return { ok: true, mime: detected.mime };
}
