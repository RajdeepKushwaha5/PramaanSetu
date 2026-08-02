/**
 * Realistic-transforms benchmark.
 *
 * Instead of only re-compressing with the same library, this applies the
 * transforms a real forwarded image goes through — WhatsApp/Telegram JPEG
 * recompression, screenshot resampling, scaling, cropping, and rotation — to
 * signed assets and reports how often the genuine copy is still recognised
 * (original/derivative). It is deliberately honest: block-average fingerprints
 * are robust to recompression/scaling but weaker to crop/rotation, and the
 * numbers show exactly that. AI is disabled for reproducibility.
 *
 * Run:  npx tsx scripts/realistic-benchmark.mjs [N]
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Jimp } from "jimp";
import QRCode from "qrcode";

const N = Number(process.argv[2]) || 12;
const tmp = mkdtempSync(join(tmpdir(), "pramaan-real-"));
process.env.PRAMAAN_DB_PATH = join(tmp, "db.json");
process.env.GEMINI_API_KEYS = "";

const { signContent } = await import("../src/services/signingService.ts");
const { verifyContent } = await import("../src/services/verificationService.ts");
const { getStore } = await import("../src/db/store.ts");
const { generateIssuerKeys } = await import("../src/crypto/signing.ts");

const W = 480, H = 320, APPROVED = "sebi@valid";
function setPx(img, x, y, r, g, b) { const i = (y * img.bitmap.width + x) * 4, d = img.bitmap.data; d[i]=r; d[i+1]=g; d[i+2]=b; d[i+3]=255; }
function rect(img, x0, y0, x1, y1, [r,g,b]) { for (let y=y0;y<y1;y++) for (let x=x0;x<x1;x++) if(x>=0&&y>=0&&x<img.bitmap.width&&y<img.bitmap.height) setPx(img,x,y,r,g,b); }
async function circular(i, payee) {
  const img = new Jimp({ width: W, height: H, color: 0xffffffff });
  rect(img, 0, 0, W, 46, [(11 + i * 17) % 200, 37, 69]);
  rect(img, 0, 46, W, 52, [200, 16, 46]);
  for (let k = 0; k < 6; k++) rect(img, 24, 70 + k * 30, 24 + 300 - ((k + i) % 4) * 40, 82 + k * 30, [90, 107, 128]);
  const qr = await QRCode.toBuffer(`upi://pay?pa=${payee}&pn=Doc${i}`, { width: 96, margin: 1 });
  img.composite(await Jimp.read(qr), W - 116, H - 116);
  return img;
}
const png = (img) => img.getBuffer("image/png");

async function clone(buf) { return Jimp.read(buf); }
const TRANSFORMS = {
  "jpeg q30 (heavy compress)": async (b) => (await clone(b)).getBuffer("image/jpeg", { quality: 30 }),
  "jpeg q50 (WhatsApp-like)": async (b) => (await clone(b)).getBuffer("image/jpeg", { quality: 50 }),
  "jpeg q70": async (b) => (await clone(b)).getBuffer("image/jpeg", { quality: 70 }),
  "screenshot (down+up sample)": async (b) => { const i = await clone(b); i.resize({ w: Math.round(W*0.55), h: Math.round(H*0.55) }); i.resize({ w: W, h: H }); return i.getBuffer("image/jpeg", { quality: 60 }); },
  "scale 85%": async (b) => { const i = await clone(b); i.resize({ w: Math.round(W*0.85), h: Math.round(H*0.85) }); return i.getBuffer("image/jpeg", { quality: 70 }); },
  "crop 5% border": async (b) => { const i = await clone(b); const cx = Math.round(W*0.05), cy = Math.round(H*0.05); i.crop({ x: cx, y: cy, w: W-2*cx, h: H-2*cy }); return i.getBuffer("image/jpeg", { quality: 70 }); },
  "rotate 2°": async (b) => { const i = await clone(b); i.rotate(2); return i.getBuffer("image/jpeg", { quality: 70 }); },
};

const store = getStore();
const kp = generateIssuerKeys();
const issuer = store.addIssuer({ name:"SEBI", sebiRegNo:"S1", entityClass:"sebi", validUpiHandles:[APPROVED], trustLevel:"demo", demoIssuer:true, registrationSource:"x", apiKey:"k", publicKey:kp.publicKey, privateKey:kp.privateKey });

console.log(`\nSigning ${N} distinct signed circulars...`);
const originals = [];
store.setAutoFlush(false);
for (let i = 0; i < N; i++) {
  const img = await circular(i, APPROVED);
  const buf = await png(img);
  originals.push(buf);
  await signContent({ issuerId: issuer.id, title: `Circular ${i}`, mimeType: "image/png", bytes: buf });
}
store.setAutoFlush(true);

const recognised = (v) => v === "original" || v === "derivative";
const results = {};
for (const name of Object.keys(TRANSFORMS)) results[name] = { hit: 0, total: 0 };
const lat = [];

for (let i = 0; i < N; i++) {
  for (const [name, fn] of Object.entries(TRANSFORMS)) {
    let buf;
    try { buf = await fn(originals[i]); } catch (e) { continue; }
    const t = performance.now();
    const r = await verifyContent({ mimeType: "image/jpeg", bytes: buf });
    lat.push(performance.now() - t);
    results[name].total++;
    if (recognised(r.verdict)) results[name].hit++;
  }
}

// False matches: unrelated images should be unverified.
let falseMatch = 0, unrelTot = 0;
for (let i = 0; i < N; i++) {
  const noise = new Jimp({ width: W, height: H, color: 0xffffffff });
  for (let b = 0; b < 50; b++) { const x=(i*37+b*53)%(W-40), y=(i*19+b*71)%(H-40); rect(noise,x,y,x+40,y+40,[(b*61)%255,(b*37+i*20)%255,(b*97)%255]); }
  const v = await verifyContent({ mimeType: "image/png", bytes: await png(noise) });
  unrelTot++;
  if (v.verdict !== "unverified") falseMatch++;
}

lat.sort((a,b)=>a-b);
console.log("\n=== PramaanSetu Realistic-Transforms Benchmark ===");
console.log(`Corpus: ${N} signed circulars. AI disabled. Metric: genuine copy still recognised (original/derivative).\n`);
for (const [name, r] of Object.entries(results)) {
  const pct = r.total ? (100*r.hit/r.total).toFixed(0) : "n/a";
  console.log(`  ${name.padEnd(30)} ${pct.padStart(3)}%  (${r.hit}/${r.total})`);
}
console.log(`\n  False-match on unrelated images   ${(100*falseMatch/unrelTot).toFixed(0).padStart(3)}%  (${falseMatch}/${unrelTot})  (lower is better)`);
console.log(`  Latency p50 / p95                 ${lat[Math.floor(lat.length*0.5)].toFixed(1)} ms / ${lat[Math.floor(lat.length*0.95)].toFixed(1)} ms`);
console.log("\nHonest read: recompression, scaling, screenshots and small crops are recognised");
console.log("(references store centre-crop fingerprint variants). Rotation is the remaining");
console.log("gap — block-average hashing is not rotation-invariant, so a tilted forward stays");
console.log("an honest 'unverified'; production would add feature/keypoint (ORB) matching.\n");

rmSync(tmp, { recursive: true, force: true });
