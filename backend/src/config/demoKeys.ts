/**
 * Demo issuer keys + trusted-issuer directory, generated at runtime (NOT
 * committed). This keeps private keys out of the repo while still letting the
 * trust-anchored verify flow work: on first seed we generate the demo
 * keypairs into a gitignored file and (re)write the public directory to match.
 *
 * Production keys would live in an HSM/KMS and the directory would be published
 * and signed by a regulator-controlled root. Here they are clearly simulated.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  hkdfSync,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEYS_PATH =
  process.env.PRAMAAN_DEMO_KEYS ?? join(__dirname, "..", "..", "data", "demo-issuer-keys.json");
export const TRUST_DIR_PATH =
  process.env.PRAMAAN_TRUST_DIR ?? join(__dirname, "..", "..", "trusted-issuers.json");

const ISSUERS = [
  { name: "Securities and Exchange Board of India", sebiRegNo: "SEBI-IND-0001", entityClass: "sebi" },
  { name: "National Stock Exchange", sebiRegNo: "NSE-EXCH-0002", entityClass: "exchange" },
  { name: "Reliance Industries Ltd", sebiRegNo: "INE002A01018", entityClass: "listed_company" },
];

function keyId(pub: string): string {
  return createHash("sha256").update(pub).digest("hex").slice(0, 16);
}

export interface DemoKey {
  publicKey: string;
  privateKey: string;
}

// PKCS8 DER prefix for a raw 32-byte Ed25519 private seed.
const ED25519_PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/**
 * Derive an Ed25519 keypair deterministically from a master seed + issuer id.
 * Used only when PRAMAAN_DEMO_SEED is set, so an ephemeral-disk restart (e.g. on
 * a free Render instance) regenerates the SAME demo keys and previously issued
 * proof bundles keep verifying. Without the seed we fall back to random keys
 * persisted in a gitignored file (the local-dev default).
 */
function deterministicKey(masterSeed: string, regNo: string): DemoKey {
  const raw = Buffer.from(
    hkdfSync("sha256", Buffer.from(masterSeed, "utf8"), Buffer.from(regNo, "utf8"), "pramaansetu-ed25519", 32),
  );
  const priv = createPrivateKey({ key: Buffer.concat([ED25519_PKCS8_PREFIX, raw]), format: "der", type: "pkcs8" });
  const pub = createPublicKey(priv);
  return {
    publicKey: pub.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey: priv.export({ type: "pkcs8", format: "der" }).toString("base64"),
  };
}

/**
 * Load (or generate on first use) the demo issuer keypairs, and always (re)write
 * the trusted-issuer directory with the matching PUBLIC keys. Returns the
 * keypairs keyed by SEBI registration number.
 */
export function ensureDemoIssuerKeys(): Record<string, DemoKey> {
  const seed = process.env.PRAMAAN_DEMO_SEED?.trim();
  let keys: Record<string, DemoKey>;
  if (seed) {
    // Deterministic: same seed -> same keys on every (re)start, no disk needed.
    keys = {};
    for (const it of ISSUERS) keys[it.sebiRegNo] = deterministicKey(seed, it.sebiRegNo);
    mkdirSync(dirname(KEYS_PATH), { recursive: true });
    writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2));
  } else if (existsSync(KEYS_PATH)) {
    keys = JSON.parse(readFileSync(KEYS_PATH, "utf8")) as Record<string, DemoKey>;
  } else {
    keys = {};
    for (const it of ISSUERS) {
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");
      keys[it.sebiRegNo] = {
        publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
        privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
      };
    }
    mkdirSync(dirname(KEYS_PATH), { recursive: true });
    writeFileSync(KEYS_PATH, JSON.stringify(keys, null, 2));
  }

  const directory = ISSUERS.map((it) => ({
    keyId: keyId(keys[it.sebiRegNo].publicKey),
    name: it.name,
    sebiRegNo: it.sebiRegNo,
    entityClass: it.entityClass,
    keyAlgorithm: "Ed25519",
    publicKey: keys[it.sebiRegNo].publicKey,
    status: "active",
    validFrom: "2026-01-01",
  }));
  writeFileSync(
    TRUST_DIR_PATH,
    JSON.stringify(
      {
        directory: "PramaanSetu demo trusted-issuer directory",
        note: "Public keys of approved DEMO issuers, generated locally. In production this directory is published and signed by a regulator-controlled root; issuer private keys stay in HSM/KMS.",
        issuers: directory,
      },
      null,
      2,
    ) + "\n",
  );
  return keys;
}
