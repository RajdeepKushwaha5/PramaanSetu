/**
 * Issuer signing with Ed25519 (Node built-in crypto — no native deps).
 *
 * Each issuer has an Ed25519 keypair. Official communications are signed by
 * signing the canonical JSON of their manifest. In production the private key
 * lives in an HSM/KMS; for the prototype it is stored with the issuer record.
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
} from "node:crypto";
import type { Manifest } from "../db/types.js";

export interface KeyPairB64 {
  publicKey: string; // base64 DER (SPKI)
  privateKey: string; // base64 DER (PKCS8)
}

export function generateIssuerKeys(): KeyPairB64 {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
    privateKey: privateKey
      .export({ type: "pkcs8", format: "der" })
      .toString("base64"),
  };
}

/** Deterministic JSON — sorts object keys so signing is reproducible. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
    .join(",")}}`;
}

export function signManifest(manifest: Manifest, privateKeyB64: string): string {
  const key = createPrivateKey({
    key: Buffer.from(privateKeyB64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const data = Buffer.from(canonicalize(manifest), "utf8");
  return edSign(null, data, key).toString("base64");
}

export function verifyManifest(
  manifest: Manifest,
  signatureB64: string,
  publicKeyB64: string,
): boolean {
  try {
    const key = createPublicKey({
      key: Buffer.from(publicKeyB64, "base64"),
      format: "der",
      type: "spki",
    });
    const data = Buffer.from(canonicalize(manifest), "utf8");
    return edVerify(null, data, key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}
