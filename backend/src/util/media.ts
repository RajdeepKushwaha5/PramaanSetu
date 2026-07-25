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
