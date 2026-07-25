/**
 * Scalability benchmark: candidate search against a large signed corpus.
 *
 * Signs N diverse synthetic assets, then measures the perceptual candidate
 * search two ways from the SAME precomputed probe fingerprint:
 *   (a) LSH index -> exact compare on the narrowed candidate set
 *   (b) full linear scan of all N assets
 * This isolates the search cost the index optimizes (image decoding excluded).
 * Recall is checked separately through the full verify path.
 *
 * Run:  npx tsx scripts/scale-benchmark.mjs [N]
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Jimp } from "jimp";
import QRCode from "qrcode";

const N = Number(process.argv[2]) || 10000;
const tmp = mkdtempSync(join(tmpdir(), "pramaan-scale-"));
process.env.PRAMAAN_DB_PATH = join(tmp, "db.json");
process.env.GEMINI_API_KEYS = "";

const { signContent } = await import("../src/services/signingService.ts");
const { verifyContent } = await import("../src/services/verificationService.ts");
const { getStore } = await import("../src/db/store.ts");
const { generateIssuerKeys } = await import("../src/crypto/signing.ts");
const { bestChangedCells, computePerceptualHashes } = await import("../src/fingerprint/index.ts");
const { getFingerprintIndex } = await import("../src/fingerprint/fpIndex.ts");

const W = 240, H = 160, APPROVED = "sebi@valid";
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function setPx(img, x, y, r, g, b) { const i = (y * img.bitmap.width + x) * 4, d = img.bitmap.data; d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255; }
function rect(img, x0, y0, x1, y1, [r, g, b]) { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) setPx(img, x, y, r, g, b); }
// Diverse, unique filler: 24 random colour blocks seeded by i.
function filler(i) {
  const rnd = mulberry32(i + 1);
  const img = new Jimp({ width: W, height: H, color: 0xffffffff });
  for (let b = 0; b < 24; b++) {
    const x = Math.floor(rnd() * (W - 30)), y = Math.floor(rnd() * (H - 30));
    const w = 12 + Math.floor(rnd() * 30), h = 12 + Math.floor(rnd() * 30);
    rect(img, x, y, Math.min(W, x + w), Math.min(H, y + h), [Math.floor(rnd() * 256), Math.floor(rnd() * 256), Math.floor(rnd() * 256)]);
  }
  return img;
}
async function circular(payee) {
  const img = new Jimp({ width: W, height: H, color: 0xffffffff });
  rect(img, 0, 0, W, 40, [11, 37, 69]); rect(img, 0, 40, W, 44, [200, 16, 46]);
  for (let k = 0; k < 5; k++) rect(img, 10, 55 + k * 18, 150, 63 + k * 18, [90, 107, 128]);
  const qr = await QRCode.toBuffer(`upi://pay?pa=${payee}&pn=SEBI`, { width: 64, margin: 1 });
  img.composite(await Jimp.read(qr), W - 74, H - 74);
  return img;
}
const png = (img) => img.getBuffer("image/png");
const jpg = (img, q) => img.getBuffer("image/jpeg", { quality: q });

const store = getStore();
const kp = generateIssuerKeys();
const issuer = store.addIssuer({ name: "SEBI", sebiRegNo: "S1", entityClass: "sebi", validUpiHandles: [APPROVED], trustLevel: "demo", demoIssuer: true, registrationSource: "https://sebi.gov.in", apiKey: "k", publicKey: kp.publicKey, privateKey: kp.privateKey });

console.log(`\nSigning ${N} diverse synthetic assets…`);
const t0 = performance.now();
store.setAutoFlush(false);
for (let i = 0; i < N; i++) {
  await signContent({ issuerId: issuer.id, title: `Doc ${i}`, mimeType: "image/png", bytes: await png(filler(i)) });
  if (i % 2000 === 0 && i) process.stdout.write(`  ${i}…`);
}
const target = await circular(APPROVED);
const targetPng = await png(target);
await signContent({ issuerId: issuer.id, title: "SEBI Master Circular", mimeType: "image/png", bytes: targetPng });
store.setAutoFlush(true);
console.log(`\nSigned ${N + 1} assets in ${((performance.now() - t0) / 1000).toFixed(1)}s`);

// ---- recall through the full verify path ----
const compressed = await jpg(target, 45);
const altered = await png(await circular("fraudster99@ybl"));
const unrelated = await png(filler(N + 500)); // a fresh unique image, never signed
const rv = async (buf, m) => (await verifyContent({ mimeType: m, bytes: buf })).verdict;
const rOrig = await rv(targetPng, "image/png");
const rDer = await rv(compressed, "image/jpeg");
const rAlt = await rv(altered, "image/png");
const rUnr = await rv(unrelated, "image/png");

// ---- isolated search cost: same precomputed probe, index vs full scan ----
const assets = store.listAssets();
const probe = await computePerceptualHashes(compressed, "image", "image/jpeg");
const idx = getFingerprintIndex();
idx.candidates(probe, assets); // warm the index build

function searchIndex() { const c = idx.candidates(probe, assets); let best = Infinity; for (const a of c) { const d = bestChangedCells(probe, a.perceptualHashes); if (d < best) best = d; } return c.length; }
function searchFull() { let best = Infinity; for (const a of assets) { const d = bestChangedCells(probe, a.perceptualHashes); if (d < best) best = d; } }

let candCount = 0;
const li = [], lf = [];
for (let i = 0; i < 100; i++) { const t = performance.now(); candCount = searchIndex(); li.push(performance.now() - t); }
for (let i = 0; i < 100; i++) { const t = performance.now(); searchFull(); lf.push(performance.now() - t); }
const med = (a) => { a.sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
const mi = med(li), mf = med(lf);

console.log("\n=== PramaanSetu Scalability Benchmark ===");
console.log(`Corpus: ${N + 1} signed assets\n`);
console.log("Recall (full verify path):");
console.log(`  exact original -> ${rOrig}   ${rOrig === "original" ? "OK" : "MISS"}`);
console.log(`  recompressed   -> ${rDer}   ${rDer === "derivative" ? "OK" : "MISS"}`);
console.log(`  swapped QR     -> ${rAlt}   ${rAlt === "altered" ? "OK" : "MISS"}`);
console.log(`  unrelated      -> ${rUnr}   ${rUnr === "unverified" ? "OK (no false match)" : "FALSE MATCH"}`);
console.log(`\nCandidate search cost (probe precomputed, ${N + 1} assets):`);
console.log(`  LSH index : ${mi.toFixed(2)} ms  (narrowed to ${candCount} candidates)`);
console.log(`  Full scan : ${mf.toFixed(2)} ms  (all ${N + 1} assets)`);
console.log(`  Speedup   : ${(mf / mi).toFixed(1)}x`);

rmSync(tmp, { recursive: true, force: true });
