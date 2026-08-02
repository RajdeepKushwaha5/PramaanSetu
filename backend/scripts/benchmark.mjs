/**
 * PramaanSetu verification benchmark.
 *
 * Measures the DETERMINISTIC verification engine (provenance + perceptual
 * fingerprint + QR payment-tamper check). The AI risk engine is disabled here
 * so numbers are reproducible and reflect the crypto/fingerprint layer only.
 *
 * Run:  npx tsx scripts/benchmark.mjs
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Jimp } from "jimp";
import QRCode from "qrcode";

const tmp = mkdtempSync(join(tmpdir(), "pramaan-bench-"));
process.env.PRAMAAN_DB_PATH = join(tmp, "db.json");
process.env.GEMINI_API_KEYS = "";

const { signContent } = await import("../src/services/signingService.ts");
const { verifyContent } = await import("../src/services/verificationService.ts");
const { getStore } = await import("../src/db/store.ts");
const { generateIssuerKeys } = await import("../src/crypto/signing.ts");

const W = 480, H = 320;
const APPROVED = "bench@valid";

function setPx(img, x, y, r, g, b) {
  const i = (y * img.bitmap.width + x) * 4, d = img.bitmap.data;
  d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
}
function rect(img, x0, y0, x1, y1, [r, g, b]) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) setPx(img, x, y, r, g, b);
}
async function baseImage(i, upiPayee) {
  const img = new Jimp({ width: W, height: H, color: 0xffffffff });
  rect(img, 0, 0, W, 56, [(11 + i * 20) % 200, 37, 69]);
  rect(img, 0, 56, W, 60, [200, 16, 46]);
  for (let k = 0; k < 6; k++) rect(img, 30, 90 + k * 26, 30 + 240 - ((k + i) % 3) * 40, 100 + k * 26, [90, 107, 128]);
  const qrPng = await QRCode.toBuffer(`upi://pay?pa=${upiPayee}&pn=Bench${i}`, { width: 96, margin: 1 });
  img.composite(await Jimp.read(qrPng), W - 116, H - 116);
  return img;
}
async function png(img) { return img.getBuffer("image/png"); }
async function jpg(img, quality) { return img.getBuffer("image/jpeg", { quality }); }
function unrelated(i) {
  const img = new Jimp({ width: W, height: H, color: 0xffffffff });
  for (let b = 0; b < 40; b++) {
    const x = (i * 37 + b * 53) % (W - 40), y = (i * 19 + b * 71) % (H - 40);
    rect(img, x, y, x + 40, y + 40, [(b * 61) % 255, (b * 37 + i * 20) % 255, (b * 97) % 255]);
  }
  return img;
}

const N = 10;
const store = getStore();
const kp = generateIssuerKeys();
const issuer = store.addIssuer({
  name: "Benchmark Issuer", sebiRegNo: "BENCH-001", entityClass: "sebi",
  validUpiHandles: [APPROVED], trustLevel: "demo", demoIssuer: true,
  registrationSource: "https://example.gov", apiKey: "bench",
  publicKey: kp.publicKey, privateKey: kp.privateKey,
});

const lat = [];
let originalOK = 0, originalTot = 0, derivOK = 0, derivTot = 0;
let alterOK = 0, alterTot = 0, falseMatch = 0, unrelTot = 0;

async function verify(buf, mime) {
  const t = performance.now();
  const r = await verifyContent({ mimeType: mime, bytes: buf });
  lat.push(performance.now() - t);
  return r.verdict;
}

for (let i = 0; i < N; i++) {
  const base = await baseImage(i, APPROVED);
  const originalPng = await png(base);
  await signContent({ issuerId: issuer.id, title: `Circular ${i}`, mimeType: "image/png", bytes: originalPng });

  originalTot++; if (await verify(originalPng, "image/png") === "original") originalOK++;

  for (const q of [30, 45, 60, 75]) { derivTot++; if (await verify(await jpg(base, q), "image/jpeg") === "derivative") derivOK++; }

  // Altered #1: swapped payment QR (realistic — points to a fraud handle).
  const alt1 = await baseImage(i, "fraudster99@ybl");
  alterTot++; if (await verify(await png(alt1), "image/png") === "altered") alterOK++;
  // Altered #2: visual edit (recoloured text bar).
  const alt2 = await baseImage(i, APPROVED); rect(alt2, 30, 90, 270, 100, [200, 16, 46]);
  alterTot++; if (await verify(await png(alt2), "image/png") === "altered") alterOK++;
}

for (let i = 0; i < N; i++) {
  unrelTot++;
  const v = await verify(await png(unrelated(i)), "image/png");
  if (v === "original" || v === "derivative" || v === "altered") falseMatch++;
}

lat.sort((a, b) => a - b);
const pct = (p) => lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))].toFixed(1);
const rate = (a, b) => `${((a / b) * 100).toFixed(1)}% (${a}/${b})`;

console.log("\n=== PramaanSetu SYNTHETIC PROTOTYPE Benchmark ===");
console.log("NOTE: synthetic templates + Jimp-generated recompression only. Not a general");
console.log("accuracy claim. Recompression, screenshots, scaling and small crops are covered");
console.log("(see benchmark:real); rotation and adversarial edits remain future work.");
console.log(`Dataset: ${N} originals, ${derivTot} derivatives, ${alterTot} altered (QR-swap + visual edit), ${unrelTot} unrelated`);
console.log(`Method: SHA-256 + Ed25519 provenance; 32x32 colour block grid (derivative<=4, altered<=300 cells); QR payee check`);
console.log(`AI risk engine: disabled for reproducibility (deterministic layer only)\n`);
console.log(`Original verification rate    : ${rate(originalOK, originalTot)}`);
console.log(`Derivative recall (recompress): ${rate(derivOK, derivTot)}`);
console.log(`Altered recall (tamper)       : ${rate(alterOK, alterTot)}`);
console.log(`False-match rate (unrelated)  : ${rate(falseMatch, unrelTot)}   (lower is better)`);
console.log(`Latency p50 / p95             : ${pct(50)} ms / ${pct(95)} ms  (n=${lat.length})`);

rmSync(tmp, { recursive: true, force: true });
