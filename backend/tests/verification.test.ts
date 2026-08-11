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

const testTmp = mkdtempSync(join(tmpdir(), "pramaan-test-"));
process.env.PRAMAAN_DB_PATH = join(testTmp, "db.json");
process.env.PRAMAAN_DEMO_KEYS = join(testTmp, "demo-issuer-keys.json");
process.env.PRAMAAN_TRUST_DIR = join(testTmp, "trusted-issuers.json");
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
    validUpiHandles: ["sebi@valid", "rilinvestor@valid"],
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

test("generated issuer keys match the published trust directory", async () => {
  const { ensureDemoIssuerKeys, TRUST_DIR_PATH } = await import("../src/config/demoKeys.js");
  const { readFileSync } = await import("node:fs");
  const keys = ensureDemoIssuerKeys();
  const dir = JSON.parse(readFileSync(TRUST_DIR_PATH, "utf8")) as {
    issuers: { sebiRegNo: string; publicKey: string; status: string }[];
  };
  // Every generated demo key must appear in the directory with the same public
  // key, or the standalone verifier would reject a genuine record as not-anchored.
  for (const [regNo, kp] of Object.entries(keys)) {
    const entry = dir.issuers.find((i) => i.sebiRegNo === regNo);
    assert.ok(entry, `directory is missing ${regNo}`);
    assert.equal(entry!.publicKey, kp.publicKey, `public key mismatch for ${regNo}`);
    assert.equal(entry!.status, "active");
  }
});

test("transparency log stays intact and references real assets", () => {
  const { valid, reason } = getStore().verifyLog();
  assert.equal(valid, true, reason ?? "");
});

test("a corrupted transparency log makes 'original' impossible", async () => {
  const store = getStore();
  // Sign a fresh text record, confirm it verifies as original.
  const text = `Chain integrity test ${Date.now()}`;
  await signContent({ issuerId, title: "Chain test", mimeType: "text/plain", text });
  const before = await verifyContent({ text });
  assert.equal(before.verdict, "original");
  assert.equal(before.match?.logIntegrityValid, true);

  // Corrupt a log entry's hash — the chain is now broken.
  const log = store.getLog();
  const target = log[Math.floor(log.length / 2)];
  const originalHash = target.entryHash;
  target.entryHash = "deadbeef".repeat(8);
  assert.equal(store.verifyLog().valid, false, "log should now be broken");

  // The same signed content must NOT verify as original any more.
  const after = await verifyContent({ text });
  assert.notEqual(after.verdict, "original", "a broken log must block a genuine verdict");
  assert.equal(after.verdict, "invalid_provenance");
  assert.match(after.message, /transparency log/i);

  target.entryHash = originalHash; // restore for later tests
  assert.equal(store.verifyLog().valid, true);
});

test("QR fraud reaches a campaign with the fraud payee as an indicator", async () => {
  const { getCampaigns } = await import("../src/services/campaignService.js");
  const camps = getCampaigns();
  const withPayee = camps.find((c) => c.paymentHandles.includes("fraudster12@ybl"));
  assert.ok(withPayee, "expected a campaign carrying the swapped QR payee");
});

test("indicator-less campaigns get unique (non-colliding) ids", async () => {
  const { getCampaigns } = await import("../src/services/campaignService.js");
  const store = getStore();
  // Two high-risk events with NO extractable indicators — previously both
  // hashed an empty identity to the SAME id.
  for (const h of ["indicatorless-a", "indicatorless-b"]) {
    store.addEvent({
      verdict: "unverified", mediaType: "text", contentHash: h,
      matchedAssetId: null, matchedIssuerName: null, impersonatedEntity: null,
      paymentHandles: [], phoneNumbers: [], urls: [], tamperType: null,
      riskLevel: "critical", riskScore: 95,
    });
  }
  const camps = getCampaigns();
  const ids = camps.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "every campaign id must be unique");

  // Its evidence pack must still contain the event (was previously empty because
  // membership was re-derived from indicators that an indicator-less event lacks).
  const { buildCampaignEvidence } = await import("../src/services/evidenceService.js");
  const indicatorless = camps.find((c) => c.eventIds.length === 1 && c.entities.length === 0 && c.paymentHandles.length === 0 && c.phoneNumbers.length === 0);
  assert.ok(indicatorless, "expected an indicator-less campaign");
  const pack = buildCampaignEvidence(indicatorless!.id) as { relatedSubmissions: unknown[] };
  assert.equal(pack.relatedSubmissions.length, 1, "an indicator-less campaign's evidence must include its event");
});

test("evidence pack includes events despite phone normalization", async () => {
  const { getCampaigns } = await import("../src/services/campaignService.js");
  const { buildCampaignEvidence } = await import("../src/services/evidenceService.js");
  const store = getStore();
  // Two events linked ONLY by the same phone in different formats.
  store.addEvent({
    verdict: "unverified", mediaType: "text", contentHash: "phone-fmt-1",
    matchedAssetId: null, matchedIssuerName: null, impersonatedEntity: null,
    paymentHandles: [], phoneNumbers: ["+91 98765 43210"], urls: [], tamperType: null,
    riskLevel: "critical", riskScore: 96,
  });
  store.addEvent({
    verdict: "unverified", mediaType: "text", contentHash: "phone-fmt-2",
    matchedAssetId: null, matchedIssuerName: null, impersonatedEntity: null,
    paymentHandles: [], phoneNumbers: ["9876543210"], urls: [], tamperType: null,
    riskLevel: "high", riskScore: 82,
  });
  const camp = getCampaigns().find((c) => c.phoneNumbers.includes("9876543210"));
  assert.ok(camp, "the two phone-linked events should form a campaign");
  const pack = buildCampaignEvidence(camp!.id) as { relatedSubmissions: unknown[] };
  assert.ok(pack.relatedSubmissions.length >= 2, "both phone formats must be in the evidence pack");
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

// ---- multi-page PDF: a tamper on ANY page must be caught (page-by-position) ----
const { PDFDocument: PdfDoc } = await import("pdf-lib");
const { Jimp: JimpLib } = await import("jimp");
const QR = (await import("qrcode")).default;

function fillBox(img: InstanceType<typeof JimpLib>, x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) {
  const w = img.bitmap.width;
  const d = img.bitmap.data;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }
}

/**
 * Deterministic 480x320 page. Each `variant` (0..29) places two distinctive
 * blocks at a unique (row, column) position, so different variants produce
 * clearly different fingerprints and no two documents share a page by accident.
 */
async function pageImage(variant: number, qrPayload?: string): Promise<Buffer> {
  const img = new JimpLib({ width: 480, height: 320, color: 0xffffffff });
  fillBox(img, 0, 0, 480, 56, [11, 37, 69]);
  const row = variant % 6; // 0..5
  const col = Math.floor(variant / 6); // 0..4 for variants 0..29
  const y = 70 + row * 22;
  fillBox(img, 30, y, 450, y + 40, [200, 40, 40]);
  const x = 20 + col * 60;
  fillBox(img, x, 200, x + 80, 300, [40, 80, 200]);
  if (qrPayload) {
    const qrPng = await QR.toBuffer(qrPayload, { width: 96, margin: 1 });
    const qr = await JimpLib.read(qrPng);
    img.composite(qr, 480 - 116, 320 - 116);
  }
  return img.getBuffer("image/png");
}

/** Assemble page PNGs into a deterministic multi-page PDF. */
async function buildPdf(pages: Buffer[]): Promise<Buffer> {
  const pdf = await PdfDoc.create();
  const epoch = new Date(0);
  pdf.setCreationDate(epoch);
  pdf.setModificationDate(epoch);
  pdf.setProducer("PramaanSetu");
  pdf.setCreator("PramaanSetu");
  for (const png of pages) {
    const page = pdf.addPage([480, 320]);
    const img = await pdf.embedPng(png);
    page.drawImage(img, { x: 0, y: 0, width: 480, height: 320 });
  }
  return Buffer.from(await pdf.save());
}

const APPROVED = "upi://pay?pa=sebi@valid&pn=SEBI&am=0";
const FRAUD = "upi://pay?pa=scam99@ybl&pn=SEBI%20Refund&am=5000";

test("multi-page PDF: unchanged page cannot mask a tampered page", async () => {
  // Sign a 3-page document (QR on page 1).
  const p1 = await pageImage(0, APPROVED);
  const p2 = await pageImage(1);
  const p3 = await pageImage(2);
  const signed = await buildPdf([p1, p2, p3]);
  await signContent({ issuerId, title: "SEBI 3-page circular", mimeType: "application/pdf", bytes: signed });

  // Genuine copy -> original (byte-exact).
  const genuine = await verifyContent({ mimeType: "application/pdf", bytes: signed });
  assert.equal(genuine.verdict, "original");

  // Tamper ONLY page 2; pages 1 and 3 identical. Must be altered, page 2 named.
  const p2edit = await pageImage(9); // very different content
  const tamperedMid = await buildPdf([p1, p2edit, p3]);
  const midR = await verifyContent({ mimeType: "application/pdf", bytes: tamperedMid });
  assert.equal(midR.verdict, "altered");
  assert.ok(
    midR.match?.differences?.some((d) => /page 2/i.test(d)),
    `expected a page-2 difference, got: ${JSON.stringify(midR.match?.differences)}`,
  );

  // Remove a page -> altered (page count changed).
  const removed = await buildPdf([p1, p3]);
  const remR = await verifyContent({ mimeType: "application/pdf", bytes: removed });
  assert.equal(remR.verdict, "altered");
  assert.ok(
    remR.match?.differences?.some((d) => /page\(s\)|page count/i.test(d)),
    `expected a page-count difference, got: ${JSON.stringify(remR.match?.differences)}`,
  );
});

test("multi-page PDF: swapped QR on a non-first page -> altered, names payee", async () => {
  // Sign a 2-page document with the payment QR on PAGE 2.
  const a1 = await pageImage(3);
  const a2 = await pageImage(4, APPROVED);
  const signed = await buildPdf([a1, a2]);
  await signContent({ issuerId, title: "SEBI 2-page notice", mimeType: "application/pdf", bytes: signed });

  // Swap only the page-2 QR to a fraud handle.
  const a2fraud = await pageImage(4, FRAUD);
  const tampered = await buildPdf([a1, a2fraud]);
  const r = await verifyContent({ mimeType: "application/pdf", bytes: tampered });
  assert.equal(r.verdict, "altered");
  assert.equal(r.match?.paymentTamper?.foundPayee, "scam99@ybl");
});

const { MAX_PDF_PAGES } = await import("../src/fingerprint/index.js");

test("PDF beyond 4 pages: a tamper on page 5 is caught (regression for the 4-page cap)", async () => {
  // Five pages - the old renderer capped at 4, so a page-5 edit was invisible.
  // Use distinct variants (10..14) so this document does not share a pixel-
  // identical page with any other signed fixture.
  const pages = await Promise.all([10, 11, 12, 13, 14].map((v, i) => pageImage(v, i === 0 ? APPROVED : undefined)));
  const signed = await buildPdf(pages);
  await signContent({ issuerId, title: "SEBI 5-page circular", mimeType: "application/pdf", bytes: signed });

  // Genuine copy -> original.
  assert.equal((await verifyContent({ mimeType: "application/pdf", bytes: signed })).verdict, "original");

  // Change ONLY page 5. Must be altered and name page 5, not "derivative".
  const edited = [...pages];
  edited[4] = await pageImage(19);
  const r = await verifyContent({ mimeType: "application/pdf", bytes: await buildPdf(edited) });
  assert.equal(r.verdict, "altered");
  assert.ok(
    r.match?.differences?.some((d) => /page 5/i.test(d)),
    `expected a page-5 difference, got: ${JSON.stringify(r.match?.differences)}`,
  );
});

test("PDF over the page limit is rejected at signing (fails closed)", async () => {
  const many = await Promise.all(
    Array.from({ length: MAX_PDF_PAGES + 1 }, (_v, i) => pageImage(i % 3)),
  );
  const tooBig = await buildPdf(many);
  await assert.rejects(
    signContent({ issuerId, title: "Oversized PDF", mimeType: "application/pdf", bytes: tooBig }),
    /exceeds the .* limit/i,
  );
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
