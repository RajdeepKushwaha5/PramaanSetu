/**
 * PramaanSetu - standalone, independent proof verifier.
 *
 * This script deliberately imports NOTHING from PramaanSetu. It uses only
 * Node's built-in crypto to re-check a signed record's proof bundle, so a
 * verdict does not have to be taken on trust from the PramaanSetu server:
 *
 *   1. Recomputes the SHA-256 content hash and compares it to the manifest.
 *   2. Verifies the issuer's Ed25519 signature over the canonical manifest JSON.
 *   3. ANCHORS IDENTITY: confirms the signing key is the one published for that
 *      issuer in an independent trusted-issuer directory. Without this step a
 *      signature only proves "signed by *some* key", not "signed by SEBI" - so
 *      the verdict is GENUINE only when the key matches the directory.
 *
 * Usage:
 *   node scripts/verify-record.mjs <proof-bundle.json> [--trust-store <dir.json>]
 *   npm run verify:record -- <proof-bundle.json>
 *
 * Default trust store: backend/trusted-issuers.json (the published directory).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, createPublicKey, verify as edVerify } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const tsIdx = args.indexOf("--trust-store");
const trustPath = tsIdx >= 0 ? args[tsIdx + 1] : join(__dirname, "..", "trusted-issuers.json");

if (!file) {
  console.error("Usage: node scripts/verify-record.mjs <proof-bundle.json> [--trust-store <dir.json>]");
  process.exit(2);
}

function loadJson(path, what) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.error(`Could not read/parse ${what} (${path}): ${e.message}`);
    process.exit(2);
  }
}

const bundle = loadJson(file, "proof bundle");
const trust = loadJson(trustPath, "trusted-issuer directory");
const directory = Array.isArray(trust?.issuers) ? trust.issuers : [];

// Canonical JSON with sorted keys - the exact serialisation the issuer signs.
function canonicalize(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(",")}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(v[k])}`).join(",")}}`;
}
const sha256hex = (buf) => createHash("sha256").update(buf).digest("hex");
const mark = (b) => (b ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m");

const { manifest, signature, issuer, content } = bundle ?? {};
if (!manifest || !signature || !issuer?.publicKey || !content) {
  console.error("Not a valid proof bundle (need manifest, signature, issuer.publicKey, content).");
  process.exit(2);
}

// 1) Content integrity - recompute the hash from the actual bytes.
const bytes =
  content.encoding === "utf8"
    ? Buffer.from(String(content.value), "utf8")
    : Buffer.from(String(content.value), "base64");
const computedHash = sha256hex(bytes);
const hashOk = computedHash === manifest.contentHash;

// 2) Signature - Ed25519 over the canonical manifest, using the bundle's key.
let sigOk = false;
try {
  const pub = createPublicKey({ key: Buffer.from(issuer.publicKey, "base64"), format: "der", type: "spki" });
  sigOk = edVerify(null, Buffer.from(canonicalize(manifest), "utf8"), pub, Buffer.from(signature, "base64"));
} catch {
  sigOk = false;
}

// 3) Identity anchor - is the signing key the one published for this issuer?
const trusted = directory.find(
  (t) => (issuer.keyId && t.keyId === issuer.keyId) || t.publicKey === issuer.publicKey,
);
const keyMatches = !!trusted && trusted.publicKey === issuer.publicKey;
const active = !!trusted && trusted.status === "active";
const identityAnchored = keyMatches && active;

const genuine = hashOk && sigOk && identityAnchored;

console.log(`\n  PramaanSetu - independent proof verification`);
console.log(`  (uses only Node crypto; it never contacts the PramaanSetu server)\n`);
console.log(`  Claimed issuer : ${manifest.issuer?.name ?? issuer.name ?? "?"}  (${manifest.issuer?.sebiRegNo ?? issuer.sebiRegNo ?? "?"})`);
console.log(`  Title          : ${manifest.title ?? "?"}`);
console.log(`  Signing key id : ${issuer.keyId ?? "(none in bundle)"}\n`);
console.log(`  [${mark(hashOk)}] content integrity  (SHA-256 recomputed from the actual content)`);
console.log(`  [${mark(sigOk)}] issuer signature   (Ed25519 over the manifest)`);
console.log(`  [${mark(identityAnchored)}] identity anchored  (key matches the trusted-issuer directory)`);
if (!identityAnchored) {
  if (!trusted) console.log(`           -> this key is NOT in the trusted directory (unknown issuer)`);
  else if (!keyMatches) console.log(`           -> key does not match the directory's key for this issuer`);
  else if (!active) console.log(`           -> the issuer's key is not active (revoked/expired) in the directory`);
}
console.log();

if (genuine) {
  console.log(`  \x1b[32m✔ GENUINE\x1b[0m - the content is exactly what ${trusted.name} signed with its`);
  console.log(`    directory-published key. Verified without trusting the PramaanSetu server.\n`);
  process.exit(0);
} else if (hashOk && sigOk && !identityAnchored) {
  console.log(`  \x1b[33m⚠ SIGNATURE VALID · CONTENT INTACT · IDENTITY NOT TRUST-ANCHORED\x1b[0m`);
  console.log(`    The content was signed by this key and is unmodified, but the key is NOT in`);
  console.log(`    the trusted directory - so this is not a proven official communication.\n`);
  process.exit(1);
} else {
  console.log(`  \x1b[31m✘ NOT VERIFIED\x1b[0m - ${!hashOk ? "the content does not match the signed hash" : "the signature is invalid"}. Do not trust this record.\n`);
  process.exit(1);
}
