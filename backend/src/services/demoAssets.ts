/**
 * Synthetic demo images so the verify flow can be shown end-to-end without the
 * user supplying files. Generates a mock "official circular" with a REAL,
 * scannable payment QR, plus variants:
 *   - a re-compressed copy               -> Verified Derivative
 *   - a copy whose payment QR was swapped -> Altered (payment tampering)
 */

import { Jimp, loadFont } from "jimp";
import {
  SANS_8_WHITE,
  SANS_10_BLACK,
  SANS_12_BLACK,
  SANS_16_BLACK,
  SANS_16_WHITE,
  SANS_32_BLACK,
} from "jimp/fonts";
import QRCode from "qrcode";
import { PDFDocument } from "pdf-lib";

const WIDTH = 520;
const HEIGHT = 660;

// A listed company legitimately collecting Rights Issue application money via
// UPI is a believable payment context (unlike a regulator asking for a "fee"),
// so a swapped QR is a realistic redirection attack.
const APPROVED_UPI = "upi://pay?pa=rilinvestor@valid&pn=Reliance%20Rights%20Issue&am=0";
const FRAUD_UPI = "upi://pay?pa=fraudster12@ybl&pn=Rights%20Issue&am=14850";

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

// Bundled bitmap fonts (no system fonts needed, so the circular renders the same
// locally and in the container). Loaded once and cached.
type JimpFont = Awaited<ReturnType<typeof loadFont>>;
let fontCache: {
  title: JimpFont;
  sub: JimpFont;
  head: JimpFont;
  body: JimpFont;
  small: JimpFont;
} | null = null;
async function fonts() {
  if (!fontCache) {
    const [title, sub, head, body, small] = await Promise.all([
      loadFont(SANS_16_WHITE),
      loadFont(SANS_8_WHITE),
      loadFont(SANS_32_BLACK),
      loadFont(SANS_12_BLACK),
      loadFont(SANS_10_BLACK),
    ]);
    fontCache = { title, sub, head, body, small };
  }
  return fontCache;
}

const BODY_LINES = [
  "1.  Eligible equity shareholders may remit their Rights Issue application money",
  "     using the official UPI handle printed below, on or before the closing date.",
  "",
  "2.  The Company and its Registrar collect application money ONLY through the",
  "     Validated UPI handle shown here. No other handle or account is authorised.",
  "",
  "3.  Beware of forwarded circulars carrying altered QR codes. Verify the source",
  "     and the UPI handle against the exchange filing before making any payment.",
];

/**
 * A realistic-looking official circular with real text, a letterhead, a
 * reference number, and a genuine scannable payment QR. The genuine and forged
 * variants are pixel-identical except for the QR payload, so a swapped payment
 * QR is caught as `altered` while everything else matches.
 */
async function buildCircular(upiPayload: string): Promise<Buffer> {
  const f = await fonts();
  const img = new Jimp({ width: WIDTH, height: HEIGHT, color: 0xffffffff });

  // Letterhead.
  fillRect(img, 0, 0, WIDTH, 72, [11, 37, 69]); // navy header band
  fillRect(img, 0, 72, WIDTH, 77, [200, 16, 46]); // red accent rule
  img.print({ font: f.title, x: 24, y: 16, text: "RELIANCE INDUSTRIES LIMITED" });
  img.print({ font: f.sub, x: 24, y: 44, text: "Regd. Office: Maker Chambers IV, Nariman Point, Mumbai 400021" });

  // Title + reference block.
  img.print({ font: f.head, x: 24, y: 96, text: "RIGHTS ISSUE" });
  img.print({ font: f.small, x: 330, y: 100, text: "Ref: RIL/RIGHTS/2026/0142" });
  img.print({ font: f.small, x: 330, y: 118, text: "Date: August 11, 2026" });
  fillRect(img, 24, 150, WIDTH - 24, 152, [200, 205, 212]); // divider

  // Subject + body.
  img.print({ font: f.body, x: 24, y: 162, text: "Sub: Payment of Rights Issue application money via UPI" });
  BODY_LINES.forEach((line, i) => {
    if (line) img.print({ font: f.small, x: 24, y: 196 + i * 20, text: line });
  });

  // Payment callout box + a REAL scannable QR.
  const boxY = 372;
  fillRect(img, 24, boxY, WIDTH - 24, boxY + 172, [244, 246, 249]); // panel
  fillRect(img, 24, boxY, WIDTH - 24, boxY + 2, [11, 37, 69]); // top rule
  img.print({ font: f.small, x: 40, y: boxY + 26, text: "Scan to pay your Rights Issue" });
  img.print({ font: f.small, x: 40, y: boxY + 46, text: "application money. Official UPI:" });
  img.print({ font: f.body, x: 40, y: boxY + 84, text: "rilinvestor@valid" });
  const qrPng = await QRCode.toBuffer(upiPayload, { width: 132, margin: 1 });
  const qr = await Jimp.read(qrPng);
  img.composite(qr, WIDTH - 40 - 132, boxY + 20);

  // Sign-off.
  img.print({ font: f.small, x: 24, y: boxY + 196, text: "For Reliance Industries Limited" });
  img.print({ font: f.small, x: 24, y: boxY + 224, text: "Sd/-" });
  img.print({ font: f.small, x: 24, y: boxY + 244, text: "Company Secretary & Compliance Officer" });

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
  // Fixed metadata so the generated bytes are deterministic (a genuine copy
  // then byte-matches the signed record -> "original", not "derivative").
  const epoch = new Date(0);
  pdf.setCreationDate(epoch);
  pdf.setModificationDate(epoch);
  pdf.setProducer("PramaanSetu");
  pdf.setCreator("PramaanSetu");
  const page = pdf.addPage([WIDTH, HEIGHT]);
  const img = await pdf.embedPng(png);
  page.drawImage(img, { x: 0, y: 0, width: WIDTH, height: HEIGHT });
  return Buffer.from(await pdf.save());
}

/**
 * A deliberately "rendered-looking" image: smooth gradients, a soft blurred
 * subject, and no sensor noise. It is UNSIGNED, so verifying it exercises the
 * synthetic-media detector - the deterministic forensics flag the flat
 * compression residual and over-uniform noise typical of AI-generated imagery.
 * (For a live demo, uploading a real AI face render exercises the vision model
 * too; this built-in sample makes the forensic path demoable offline.)
 */
async function buildSyntheticLookingImage(): Promise<Buffer> {
  const w = 360;
  const h = 360;
  const img = new Jimp({ width: w, height: h, color: 0xffffffff });
  const d = img.bitmap.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Smooth radial + linear gradient, no high-frequency detail at all.
      const dx = (x - w / 2) / (w / 2);
      const dy = (y - h * 0.42) / (h / 2);
      const r = Math.sqrt(dx * dx + dy * dy);
      const glow = Math.max(0, 1 - r * 0.9);
      const i = (y * w + x) * 4;
      d[i] = Math.round(60 + 150 * glow + 30 * (x / w));
      d[i + 1] = Math.round(70 + 120 * glow + 20 * (y / h));
      d[i + 2] = Math.round(110 + 120 * glow);
      d[i + 3] = 255;
    }
  }
  // Lossless PNG: keeps the flat, noiseless surface intact so the forensic ELA
  // and noise-uniformity cues reflect the render itself, not JPEG artefacts.
  return img.getBuffer("image/png");
}

/**
 * A "camera-like" control: the same scene with realistic per-pixel sensor
 * noise, so the forensic detector reads it as natural (a useful contrast that
 * shows the detector does NOT just flag everything).
 */
async function buildAuthenticLookingImage(): Promise<Buffer> {
  const base = await Jimp.read(await buildSyntheticLookingImage());
  const d = base.bitmap.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * 70; // sensor-like noise
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  return base.getBuffer("image/png");
}

export interface DemoBundle {
  originalPng: Buffer;
  compressedJpg: Buffer; // -> Derivative
  alteredPng: Buffer; // -> Altered (swapped payment QR)
  originalPdf: Buffer; // signed reference PDF circular
  alteredPdf: Buffer; // -> Altered (forged PDF, swapped payment QR)
  syntheticSample: Buffer; // unsigned, AI-render-like -> synthetic detection
  authenticSample: Buffer; // unsigned, camera-like control
  approvedUpi: string;
  fraudUpi: string;
}

export async function makeDemoBundle(): Promise<DemoBundle> {
  const originalPng = await buildCircular(APPROVED_UPI);
  const compressedJpg = await recompress(originalPng);
  const alteredPng = await buildCircular(FRAUD_UPI);
  const originalPdf = await buildCircularPdf(APPROVED_UPI);
  const alteredPdf = await buildCircularPdf(FRAUD_UPI);
  const syntheticSample = await buildSyntheticLookingImage();
  const authenticSample = await buildAuthenticLookingImage();
  return {
    originalPng,
    compressedJpg,
    alteredPng,
    originalPdf,
    alteredPdf,
    syntheticSample,
    authenticSample,
    approvedUpi: "rilinvestor@valid",
    fraudUpi: "fraudster12@ybl",
  };
}
