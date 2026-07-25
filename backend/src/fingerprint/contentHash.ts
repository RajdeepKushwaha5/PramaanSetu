import { createHash } from "node:crypto";

/** SHA-256 of raw bytes (exact content identity). */
export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}
