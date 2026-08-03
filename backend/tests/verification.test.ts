/**
 * Core verification-semantics tests (node:test, no external deps).
 * Run with: npm test
 *
 * Uses an isolated DB and disables the AI risk engine for determinism.
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.PRAMAAN_DB_PATH = join(mkdtempSync(join(tmpdir(), "pramaan-test-")), "db.json");
process.env.GEMINI_API_KEYS = "";

// Locate a local FFmpeg (repo/.tools) so video/audio tests can run; if not
// found, those tests skip gracefully (e.g. on CI without FFmpeg).
if (!process.env.FFMPEG_PATH) {
  try {
    const toolsRoot = join(process.cwd(), "..", ".tools");
    const sub = readdirSync(toolsRoot).find((d) => d.startsWith("ffmpeg"));
    if (sub) {
      const p = join(toolsRoot, sub, "bin", "ffmpeg.exe");
      if (existsSync(p)) process.env.FFMPEG_PATH = p;
    }
  } catch {
    /* no local ffmpeg */
  }
}

const { signContent } = await import("../src/services/signingService.js");
const { verifyContent } = await import("../src/services/verificationService.js");
const { getStore } = await import("../src/db/store.js");
const { generateIssuerKeys, generateApiKey } = await import("../src/crypto/signing.js");
const { makeDemoBundle } = await import("../src/services/demoAssets.js");

let issuerId = "";
let bundle: Awaited<ReturnType<typeof makeDemoBundle>>;

before(async () => {
  const store = getStore();
  const kp = generateIssuerKeys();
  const issuer = store.addIssuer({
    name: "Securities and Exchange Board of India",
    sebiRegNo: "SEBI-TEST-1",
    entityClass: "sebi",
    validUpiHandles: ["sebi@valid"],
    trustLevel: "demo",
    demoIssuer: true,
    registrationSource: "https://www.sebi.gov.in",
    apiKey: generateApiKey(),
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
  });
  issuerId = issuer.id;
  bundle = await makeDemoBundle();
  await signContent({
    issuerId,
    title: "SEBI Circular",
    mimeType: "image/png",
    bytes: bundle.originalPng,
  });
  await signContent({
    issuerId,
    title: "Investor Advisory",
    mimeType: "text/plain",
    text: "Deal only with registered intermediaries. Verify @valid handles.",
  });
});

test("exact signed image -> original with valid signature", async () => {
  const r = await verifyContent({ mimeType: "image/png", bytes: bundle.originalPng });
  assert.equal(r.verdict, "original");
  assert.equal(r.match?.signatureValid, true);
});

test("recompressed image -> derivative", async () => {
  const r = await verifyContent({ mimeType: "image/jpeg", bytes: bundle.compressedJpg });
  assert.equal(r.verdict, "derivative");
});

test("swapped payment QR -> altered, names the fraud payee", async () => {
  const r = await verifyContent({ mimeType: "image/png", bytes: bundle.alteredPng });
  assert.equal(r.verdict, "altered");
  assert.equal(r.match?.paymentTamper?.foundPayee, "fraudster12@ybl");
});

test("exact signed text -> original", async () => {
  const r = await verifyContent({
    text: "Deal only with registered intermediaries. Verify @valid handles.",
  });
  assert.equal(r.verdict, "original");
});

test("unrelated content -> unverified (no false match)", async () => {
  const r = await verifyContent({ text: "hello this is an unrelated message" });
  assert.equal(r.verdict, "unverified");
});

test("tampered signature -> invalid_provenance, never original", async () => {
  const store = getStore();
  const asset = store.listAssets().find((a) => a.mediaType === "text");
  assert.ok(asset);
  const original = asset.signature;
  asset.signature = Buffer.from("tampered-signature").toString("base64");
  const r = await verifyContent({
    text: "Deal only with registered intermediaries. Verify @valid handles.",
  });
  assert.equal(r.verdict, "invalid_provenance");
  asset.signature = original; // restore
});

test("transparency log stays intact and references real assets", () => {
  const { valid, reason } = getStore().verifyLog();
  assert.equal(valid, true, reason ?? "");
});

test("QR fraud reaches a campaign with the fraud payee as an indicator", async () => {
  const { getCampaigns } = await import("../src/services/campaignService.js");
  const camps = getCampaigns();
  const withPayee = camps.find((c) => c.paymentHandles.includes("fraudster12@ybl"));
  assert.ok(withPayee, "expected a campaign carrying the swapped QR payee");
});

test("evidence pack is signed and carries methodology", async () => {
  const { buildSnapshot } = await import("../src/services/evidenceService.js");
  const pack = buildSnapshot() as { integrity?: { signature?: string }; methodology?: unknown };
  assert.ok(pack.integrity?.signature, "evidence pack must be signed");
  assert.ok(pack.methodology, "evidence pack must state methodology");
});

test("chat bot reply marks a genuine original as VERIFIED", async () => {
  const { verifyAndFormat } = await import("../src/bot/verifyReply.js");
  const reply = await verifyAndFormat({ bytes: bundle.originalPng, mimeType: "image/png" });
  assert.match(reply, /VERIFIED ORIGINAL/);
});

test("chat bot reply flags a swapped-QR image with the fraud payee", async () => {
  const { verifyAndFormat } = await import("../src/bot/verifyReply.js");
  const reply = await verifyAndFormat({ bytes: bundle.alteredPng, mimeType: "image/png" });
  assert.match(reply, /ALTERED/);
  assert.match(reply, /fraudster12@ybl/);
  assert.match(reply, /Do NOT pay/i);
});

test("signed PDF circular verifies as original", async () => {
  await signContent({
    issuerId,
    title: "SEBI Master Circular (PDF)",
    mimeType: "application/pdf",
    bytes: bundle.originalPdf,
  });
  const r = await verifyContent({ mimeType: "application/pdf", bytes: bundle.originalPdf });
  assert.equal(r.verdict, "original");
});

test("forged PDF circular with swapped QR -> altered, names the fraud payee", async () => {
  const r = await verifyContent({ mimeType: "application/pdf", bytes: bundle.alteredPdf });
  assert.equal(r.verdict, "altered");
  assert.equal(r.match?.paymentTamper?.foundPayee, "fraudster12@ybl");
});

// ---- video + audio (voice-clone) tests; skip if FFmpeg is unavailable ----
const { isFfmpegAvailable } = await import("../src/fingerprint/index.js");
const { makeDemoVideos } = await import("../src/services/demoVideo.js");
const ffmpeg = isFfmpegAvailable();
let videos: ReturnType<typeof makeDemoVideos>;

test("video: genuine -> original, compressed -> derivative, voice-clone -> altered", { skip: !ffmpeg }, async () => {
  videos = makeDemoVideos();
  assert.ok(videos, "demo videos should generate");
  await signContent({ issuerId, title: "CEO video statement", mimeType: "video/mp4", bytes: videos.originalMp4 });

  const original = await verifyContent({ mimeType: "video/mp4", bytes: videos.originalMp4 });
  assert.equal(original.verdict, "original");

  const compressed = await verifyContent({ mimeType: "video/mp4", bytes: videos.compressedMp4 });
  assert.equal(compressed.verdict, "derivative");

  const cloned = await verifyContent({ mimeType: "video/mp4", bytes: videos.clonedMp4 });
  assert.equal(cloned.verdict, "altered");
  assert.match(cloned.message, /AUDIO/i);
});

test("audio: signed -> original, recompressed -> derivative, unrelated -> unverified", { skip: !ffmpeg }, async () => {
  const { makeDemoAudio } = await import("../src/services/demoAudio.js");
  const audio = makeDemoAudio();
  assert.ok(audio, "demo audio should generate");
  await signContent({ issuerId, title: "SEBI audio advisory", mimeType: "audio/mp4", bytes: audio.originalM4a });

  const original = await verifyContent({ mimeType: "audio/mp4", bytes: audio.originalM4a });
  assert.equal(original.verdict, "original");

  const recompressed = await verifyContent({ mimeType: "audio/mp4", bytes: audio.compressedM4a });
  assert.equal(recompressed.verdict, "derivative", "a recompressed genuine voice note must be recognised as a copy");

  const unrelated = await verifyContent({ mimeType: "audio/mp4", bytes: audio.unrelatedM4a });
  assert.equal(unrelated.verdict, "unverified", "an unrelated recording must NOT false-match a signed audio record");
});

// ---- synthetic-media detection (forensics-only; AI disabled in tests) ----

test("unsigned AI-render-like image -> unverified, forensic synthetic signal fires", async () => {
  const r = await verifyContent({ mimeType: "image/png", bytes: bundle.syntheticSample });
  assert.equal(r.verdict, "unverified");
  assert.ok(r.synthetic, "an unsigned image must carry a synthetic assessment");
  assert.equal(r.synthetic?.forensicAvailable, true);
  assert.equal(r.synthetic?.aiAvailable, false, "AI is disabled in tests");
  // The flat, noiseless render should raise at least one forensic indicator.
  assert.ok((r.synthetic?.signals.length ?? 0) > 0, "expected forensic indicators");
});

test("detector separates synthetic-looking from camera-like media (no false alarm)", async () => {
  const synth = await verifyContent({ mimeType: "image/png", bytes: bundle.syntheticSample });
  const real = await verifyContent({ mimeType: "image/png", bytes: bundle.authenticSample });
  const synthScore = synth.synthetic?.syntheticScore ?? 0;
  const realScore = real.synthetic?.syntheticScore ?? 0;
  // The AI-render sample must score strictly higher than the noisy camera-like
  // control — the deterministic layer must not flag everything.
  assert.ok(
    synthScore > realScore,
    `expected synthetic score (${synthScore}) > camera-like score (${realScore})`,
  );
  assert.notEqual(real.synthetic?.label, "likely-synthetic", "camera-like control must not be called synthetic");
});

test("unsigned image detection is recorded for the SupTech dashboard", async () => {
  const { getDashboardStats } = await import("../src/services/campaignService.js");
  const stats = getDashboardStats() as { detection?: { mediaScanned: number } };
  assert.ok((stats.detection?.mediaScanned ?? 0) > 0, "dashboard must tally scanned media");
});

test("detection-performance harness produces a valid confusion matrix (forensic-only)", async () => {
  const { evaluateDetector } = await import("../src/detect/evaluation.js");
  const { buildIllustrativeCorpus } = await import("../src/detect/sampleCorpus.js");
  const corpus = await buildIllustrativeCorpus();
  const m = await evaluateDetector(corpus, { dataset: "illustrative", datasetNote: "test", aiEnabled: false });
  const { tp, tn, fp, fn } = m.confusion;
  assert.equal(tp + tn + fp + fn, m.n, "confusion matrix must account for every sample");
  for (const v of [m.accuracy, m.precision, m.recall, m.specificity, m.f1]) {
    assert.ok(v >= 0 && v <= 1, "metrics must be in [0,1]");
  }
  // The deterministic forensic layer should catch the flat renders (high recall)
  // without cratering on the authentic set.
  assert.ok(m.recall >= 0.6, `expected recall >= 0.6, got ${m.recall}`);
  assert.ok(m.accuracy >= 0.7, `expected accuracy >= 0.7, got ${m.accuracy}`);
});
