/**
 * Helper to populate a held-out detection dataset for the real benchmark.
 *
 *   backend/datasets/detection/authentic/   real photographs   (auto-downloadable)
 *   backend/datasets/detection/synthetic/   real AI-generated faces
 *
 * Real photos are pulled from picsum.photos (real Unsplash photographs).
 * Real AI faces are pulled from thispersondoesnotexist.com — but that site
 * often blocks scripted access; if it does, this script tells you exactly how
 * to add them by hand (it takes ~2 minutes in a browser).
 *
 * Usage:
 *   node scripts/fetch-detection-dataset.mjs [count]      # default 20 each
 *   node scripts/fetch-detection-dataset.mjs --validate   # just check the folders
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "datasets", "detection");
const AUTH = join(ROOT, "authentic");
const SYN = join(ROOT, "synthetic");

const IMG_EXT = /\.(png|jpe?g|webp|bmp)$/i;
const count = (() => {
  const n = Number(process.argv.find((a) => /^\d+$/.test(a)));
  return Number.isFinite(n) && n > 0 ? n : 20;
})();

function countImages(dir) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((f) => IMG_EXT.test(f)).length;
}

function report() {
  const a = countImages(AUTH);
  const s = countImages(SYN);
  console.log(`\nDataset status:`);
  console.log(`  authentic/ (real photos)     : ${a} images`);
  console.log(`  synthetic/ (real AI faces)   : ${s} images`);
  const ready = a >= 6 && s >= 6;
  console.log(
    ready
      ? `\n✅ Ready. Run:  npm run benchmark:detection -- --ai`
      : `\n⚠️  Need at least 6 images in EACH folder for a held-out run (more is better).`,
  );
  return { a, s };
}

if (process.argv.includes("--validate")) {
  report();
  process.exit(0);
}

mkdirSync(AUTH, { recursive: true });
mkdirSync(SYN, { recursive: true });

async function download(url, dest, { headers = {}, timeoutMs = 20000 } = {}) {
  if (existsSync(dest)) return { ok: true, skipped: true };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, redirect: "follow", signal: ctrl.signal });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return { ok: false, reason: `not an image (${type || "unknown"})` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 3000) return { ok: false, reason: `too small (${buf.length}b)` };
    writeFileSync(dest, buf);
    return { ok: true, bytes: buf.length };
  } catch (e) {
    return { ok: false, reason: (e && e.name === "AbortError") ? "timeout" : String(e) };
  } finally {
    clearTimeout(t);
  }
}

// Varied realistic prompts so the AI-generated set isn't monotonous.
const PROMPTS = [
  "realistic portrait photo of a person, natural lighting",
  "photorealistic headshot of a young woman, studio light",
  "photorealistic headshot of an older man, soft light",
  "candid photo of a smiling person outdoors",
  "professional corporate headshot of a person",
  "realistic close-up photo of a face, detailed skin",
];

console.log(`Fetching up to ${count} real photos + ${count} AI-generated images…`);
console.log(`(re-runs skip files that already exist)\n`);

// 1) Real photographs -> authentic/ (picsum = real Unsplash photos).
let gotAuth = 0;
for (let i = 0; i < count; i++) {
  const dest = join(AUTH, `photo-${String(i + 1).padStart(2, "0")}.jpg`);
  const r = await download(`https://picsum.photos/seed/pramaan${i}/512/512`, dest);
  if (r.ok) { gotAuth++; process.stdout.write(`  authentic ${gotAuth}/${count}\r`); }
}
console.log(`  authentic: ${gotAuth} real photos ready`);

// 2) AI-generated images -> synthetic/ (Pollinations = a real diffusion model).
// Run with limited concurrency + a couple of retries — the endpoint generates
// each image on demand and can be slow, so parallelism gets more within the run.
let gotSyn = 0;
const CONCURRENCY = 5;
const tasks = Array.from({ length: count }, (_, i) => i);
async function worker() {
  while (tasks.length) {
    const i = tasks.shift();
    const dest = join(SYN, `aigen-${String(i + 1).padStart(2, "0")}.jpg`);
    const prompt = encodeURIComponent(PROMPTS[i % PROMPTS.length]);
    const url = `https://image.pollinations.ai/prompt/${prompt}?width=512&height=512&seed=${100 + i}&nologo=true`;
    let ok = false;
    for (let attempt = 0; attempt < 2 && !ok; attempt++) {
      const r = await download(url, dest, { timeoutMs: 50000 });
      ok = r.ok;
    }
    if (ok) { gotSyn++; process.stdout.write(`  synthetic ${gotSyn}\r`); }
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`  synthetic: ${gotSyn} AI-generated images ready`);

report();
