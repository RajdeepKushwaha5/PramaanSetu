/**
 * QR decoding for payment-tamper detection.
 *
 * The security property that actually matters for a "swapped payment QR" attack
 * is not whether pixels changed, but whether the QR now points to a DIFFERENT
 * payee. We decode the QR and compare its UPI address to the issuer's approved
 * handles — catching payment redirection even when the image looks identical.
 */

import * as JsQRNs from "jsqr";
import { Jimp } from "jimp";

// jsqr is CJS; normalise the callable across import interop shapes.
const jsQR = (
  (JsQRNs as unknown as { default?: unknown }).default ?? JsQRNs
) as (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null;

/** Decode the most prominent QR code in an image, or null. */
export async function decodeQr(buffer: Buffer): Promise<string | null> {
  try {
    const img = await Jimp.read(buffer);
    const { data, width, height } = img.bitmap;
    const clamped = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
    const code = jsQR(clamped, width, height);
    return code?.data ?? null;
  } catch {
    return null;
  }
}

/** Extract a UPI payee (pa=) from a upi:// URI, if present. */
export function extractUpiPayee(qrText: string): string | null {
  const m = /[?&]pa=([^&]+)/i.exec(qrText);
  return m ? decodeURIComponent(m[1]) : null;
}
