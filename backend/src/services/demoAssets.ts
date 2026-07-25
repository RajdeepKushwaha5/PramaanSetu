/**
 * Synthetic demo images so the verify flow can be shown end-to-end without the
 * user supplying files. Generates a mock "official circular" with a REAL,
 * scannable payment QR, plus variants:
 *   - a re-compressed copy               -> Verified Derivative
 *   - a copy whose payment QR was swapped -> Altered (payment tampering)
 */

import { Jimp } from "jimp";
import QRCode from "qrcode";
import { PDFDocument } from "pdf-lib";

const WIDTH = 480;
const HEIGHT = 320;

const APPROVED_UPI = "upi://pay?pa=sebi@valid&pn=SEBI&am=0";
const FRAUD_UPI = "upi://pay?pa=fraudster12@ybl&pn=SEBI%20Refund&am=5000";

function setPx(img: InstanceType<typeof Jimp>, x: number, y: number, rgb: [number, number, number]) {
  const w = img.bitmap.width;
  const i = (y * w + x) * 4;
  const d = img.bitmap.data;
  d[i] = rgb[0];
  d[i + 1] = rgb[1];
  d[i + 2] = rgb[2];
  d[i + 3] = 255;
}
function fillRect(img: InstanceType<typeof Jimp>, x0: number, y0: number, x1: number, y1: number, rgb: [number, number, number]) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) setPx(img, x, y, rgb);
}

async function buildCircular(upiPayload: string): Promise<Buffer> {
  const img = new Jimp({ width: WIDTH, height: HEIGHT, color: 0xffffffff });
  fillRect(img, 0, 0, WIDTH, 56, [11, 37, 69]); // header band
  fillRect(img, 0, 56, WIDTH, 60, [200, 16, 46]); // accent rule
  for (let i = 0; i < 6; i++) {
    const y = 90 + i * 26;
    fillRect(img, 30, y, 30 + 260 - (i % 2) * 40, y + 10, [90, 107, 128]); // "text"
  }
  // Real scannable payment QR bottom-right.
  const qrPng = await QRCode.toBuffer(upiPayload, { width: 96, margin: 1 });
  const qr = await Jimp.read(qrPng);
  img.composite(qr, WIDTH - 116, HEIGHT - 116);
  return img.getBuffer("image/png");
}

async function recompress(pngBuffer: Buffer): Promise<Buffer> {
  const img = await Jimp.read(pngBuffer);
  return img.getBuffer("image/jpeg", { quality: 45 });
}

/** Wrap a circular PNG in a single-page PDF (forged SEBI circulars are PDFs). */
async function buildCircularPdf(upiPayload: string): Promise<Buffer> {
  const png = await buildCircular(upiPayload);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([WIDTH, HEIGHT]);
  const img = await pdf.embedPng(png);
  page.drawImage(img, { x: 0, y: 0, width: WIDTH, height: HEIGHT });
  return Buffer.from(await pdf.save());
}

export interface DemoBundle {
  originalPng: Buffer;
  compressedJpg: Buffer; // -> Derivative
  alteredPng: Buffer; // -> Altered (swapped payment QR)
  originalPdf: Buffer; // signed reference PDF circular
  alteredPdf: Buffer; // -> Altered (forged PDF, swapped payment QR)
  approvedUpi: string;
  fraudUpi: string;
}

export async function makeDemoBundle(): Promise<DemoBundle> {
  const originalPng = await buildCircular(APPROVED_UPI);
  const compressedJpg = await recompress(originalPng);
  const alteredPng = await buildCircular(FRAUD_UPI);
  const originalPdf = await buildCircularPdf(APPROVED_UPI);
  const alteredPdf = await buildCircularPdf(FRAUD_UPI);
  return {
    originalPng,
    compressedJpg,
    alteredPng,
    originalPdf,
    alteredPdf,
    approvedUpi: "sebi@valid",
    fraudUpi: "fraudster12@ybl",
  };
}
