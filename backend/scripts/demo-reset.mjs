/**
 * One-command demo reset for a repeatable recording.
 *
 *   npm run demo:reset            (with `npm run dev` already running)
 *
 * Wipes the store, re-seeds the demo registry, checks health/FFmpeg/Gemini,
 * runs the forged-QR and voice-clone checks, and prints the URLs — so every
 * take starts from an identical, verified clean state.
 */

const BASE = process.env.PRAMAAN_API ?? "http://localhost:4000";
const WEB = process.env.PRAMAAN_WEB ?? "http://localhost:3000";
const ADMIN_KEY = process.env.PRAMAAN_ADMIN_KEY ?? "";
const ok = (b) => (b ? "✅" : "❌");

async function j(method, path, body, extraHeaders) {
  const headers = { ...(body ? { "Content-Type": "application/json" } : {}), ...(extraHeaders ?? {}) };
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

console.log(`\nResetting PramaanSetu demo at ${BASE} …\n`);

// 0) server up?
try {
  await fetch(`${BASE}/api/health`);
} catch {
  console.error(`❌ Backend not reachable at ${BASE}. Start it first:  npm run dev\n`);
  process.exit(1);
}

// 1) reset + seed (send the admin key so it also works on a locked/deployed backend)
await j("POST", "/api/seed/reset", undefined, ADMIN_KEY ? { "x-admin-key": ADMIN_KEY } : undefined);
const seed = await j("POST", "/api/seed");
console.log(`${ok(seed.status === 200)} reset + seed  (issuers/assets: ${seed.data?.stats?.issuers}/${seed.data?.stats?.signedAssets})`);

// 2) health / capabilities
const health = await j("GET", "/api/health");
const c = health.data?.capabilities ?? {};
console.log(`${ok(health.data?.status === "ok")} health: ${health.data?.status}`);
console.log(`   ${ok(c.videoFingerprint)} FFmpeg (video/audio)   ${ok(c.aiRiskEngine)} Gemini (AI)`);
if (health.data?.degraded?.length) console.log(`   ⚠️  degraded: ${health.data.degraded.join(", ")}`);

// 3) key verdicts (from the seed demo bundle)
const imgs = seed.data?.demoImages ?? {};
async function verify(key, mime, label, expect) {
  const b64 = imgs[key];
  if (!b64) { console.log(`   — ${label}: sample missing`); return; }
  const r = await j("POST", "/api/verify", { content: b64, mimeType: mime });
  const v = r.data?.verdict;
  console.log(`   ${ok(v === expect)} ${label}: ${v}${r.data?.match?.paymentTamper ? ` (${r.data.match.paymentTamper.foundPayee})` : ""}`);
}
console.log(`\nSmoke checks:`);
await verify("altered_pdf_expect_altered", "application/pdf", "forged QR PDF", "altered");
if (imgs.voiceclone_mp4_expect_altered) await verify("voiceclone_mp4_expect_altered", "video/mp4", "voice-cloned video", "altered");

// 4) detection metrics + URLs
const m = await j("GET", "/api/detection/metrics");
console.log(`\nDetection metrics: ${m.data?.dataset} set · accuracy ${(m.data?.accuracy * 100).toFixed(1)}% (n=${m.data?.sampleCount})`);
console.log(`\nReady to record:`);
console.log(`   Overview  ${WEB}`);
console.log(`   Verify    ${WEB}/verify`);
console.log(`   Issuer    ${WEB}/issuer`);
console.log(`   Radar     ${WEB}/dashboard\n`);
