/**
 * Core verification-semantics tests (node:test, no external deps).
 * Run with: npm test
 *
 * Uses an isolated DB and disables the AI risk engine for determinism.
 */

import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.PRAMAAN_DB_PATH = join(mkdtempSync(join(tmpdir(), "pramaan-test-")), "db.json");
process.env.GEMINI_API_KEYS = "";

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
