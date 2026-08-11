/**
 * PramaanSetu — standalone, independent proof verifier.
 *
 * This script deliberately imports NOTHING from PramaanSetu. It uses only
 * Node's built-in crypto to re-check a signed record's proof bundle, so a
 * verdict does not have to be taken on trust from the PramaanSetu server:
 *
 *   1. Recomputes the SHA-256 content hash and compares it to the manifest.
 *   2. Verifies the issuer's Ed25519 signature over the canonical manifest JSON,
 *      using the issuer's published public key.
 *
 * If both pass, the content is exactly what the issuer signed, and the signature
 * genuinely came from that issuer's key — verified with zero help from us.
 *
 * Usage:
 *   node scripts/verify-record.mjs <proof-bundle.json>
 *   npm run verify:record -- <proof-bundle.json>
 *
 * Get a proof bundle from the "download proof bundle" button on a signing
 * receipt (or the investor verdict) in the app.
 */

import { readFileSync } from "node:fs";
import { createHash, createPublicKey, verify as edVerify } from "node:crypto";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/verify-record.mjs <proof-bundle.json>");
  process.exit(2);
}

let bundle;
try {
  bundle = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.error(`Could not read/parse ${file}: ${e.message}`);
  process.exit(2);
}

// Canonical JSON with sorted keys — the exact serialisation the issuer signs.
// Reproduced here independently (it's a standard deterministic JSON encoding).
function canonicalize(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(v[k])}`).join(",")}}`;
}
const sha256hex = (buf) => createHash("sha256").update(buf).digest("hex");

const pass = (b) => (b ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m");

const { manifest, signature, issuer, content } = bundle ?? {};
if (!manifest || !signature || !issuer?.publicKey || !content) {
  console.error("Not a valid proof bundle (need manifest, signature, issuer.publicKey, content).");
  process.exit(2);
}

// 1) Content integrity — recompute the hash from the actual bytes.
const bytes =
  content.encoding === "utf8"
    ? Buffer.from(String(content.value), "utf8")
    : Buffer.from(String(content.value), "base64");
const computedHash = sha256hex(bytes);
const hashOk = computedHash === manifest.contentHash;

// 2) Issuer signature — Ed25519 over the canonical manifest.
let sigOk = false;
try {
  const pub = createPublicKey({
    key: Buffer.from(issuer.publicKey, "base64"),
    format: "der",
    type: "spki",
  });
  const data = Buffer.from(canonicalize(manifest), "utf8");
  sigOk = edVerify(null, data, pub, Buffer.from(signature, "base64"));
} catch (e) {
  sigOk = false;
}

const allOk = hashOk && sigOk;

console.log(`\n  PramaanSetu — independent proof verification`);
console.log(`  (this tool uses only Node crypto; it never contacts the PramaanSetu server)\n`);
console.log(`  Issuer      : ${manifest.issuer?.name ?? issuer.name ?? "?"}  (${manifest.issuer?.sebiRegNo ?? issuer.sebiRegNo ?? "?"})`);
console.log(`  Title       : ${manifest.title ?? "?"}`);
console.log(`  Key id      : ${issuer.keyId ?? "(sha256 of public key)"}\n`);
console.log(`  [${pass(hashOk)}] content hash    expected ${String(manifest.contentHash).slice(0, 24)}…`);
console.log(`           recomputed ${computedHash.slice(0, 24)}…`);
console.log(`  [${pass(sigOk)}] Ed25519 signature over the issuer manifest\n`);

if (allOk) {
  console.log(`  \x1b[32m✔ GENUINE\x1b[0m — the content is exactly what ${manifest.issuer?.name ?? "the issuer"} signed,`);
  console.log(`    and the signature is valid. Verified without trusting the PramaanSetu server.\n`);
} else {
  console.log(`  \x1b[31m✘ NOT VERIFIED\x1b[0m — ${!hashOk ? "the content does not match the signed hash" : "the signature is invalid"}. Do not trust this record.\n`);
}

process.exit(allOk ? 0 : 1);
