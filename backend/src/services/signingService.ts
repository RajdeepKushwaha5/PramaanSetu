/** Layer 1: sign an official communication and register it. */

import { getStore } from "../db/store.js";
import type { Manifest, MediaType, SignedAsset } from "../db/types.js";
import { signManifest } from "../crypto/signing.js";
import {
  audioFingerprint,
  computeSigningFingerprints,
  extFromMime,
  mediaTypeFromMime,
  sha256,
} from "../fingerprint/index.js";

export interface SignInput {
  issuerId: string;
  title: string;
  mimeType: string;
  bytes?: Buffer; // for media
  text?: string; // for text communications
  expiresAt?: string | null;
  authoritativeUrl?: string | null;
}

export interface SignResult {
  asset: SignedAsset;
  logEntry: ReturnType<ReturnType<typeof getStore>["appendLog"]>;
}

export async function signContent(input: SignInput): Promise<SignResult> {
  const store = getStore();
  const issuer = store.getIssuer(input.issuerId);
  if (!issuer) throw new Error(`Unknown issuer: ${input.issuerId}`);

  const mediaType: MediaType = input.text
    ? "text"
    : mediaTypeFromMime(input.mimeType);

  const contentBuf = input.text
    ? Buffer.from(input.text, "utf8")
    : input.bytes;
  if (!contentBuf) throw new Error("No content provided (bytes or text).");

  const contentHash = sha256(contentBuf);
  const perceptualHashes =
    mediaType === "text"
      ? []
      : await computeSigningFingerprints(contentBuf, mediaType, input.mimeType);

  // Fingerprint the audio track for video/audio, so a replaced (voice-cloned)
  // track is detectable even when the video frames still match.
  const audioFp =
    mediaType === "video" || mediaType === "audio"
      ? (await audioFingerprint(contentBuf, extFromMime(input.mimeType))) ?? undefined
      : undefined;

  const publishedAt = new Date().toISOString();
  const manifest: Manifest = {
    issuer: {
      id: issuer.id,
      name: issuer.name,
      sebiRegNo: issuer.sebiRegNo,
      entityClass: issuer.entityClass,
      trustLevel: issuer.trustLevel,
    },
    title: input.title,
    mediaType,
    contentHash,
    publishedAt,
    expiresAt: input.expiresAt ?? null,
    approvedPaymentHandles: issuer.validUpiHandles,
    authoritativeUrl: input.authoritativeUrl ?? null,
  };

  const signature = signManifest(manifest, issuer.privateKey);

  // Create the asset first so the log entry can reference its real ID, then
  // link the asset back to the log sequence. (Fixes the "pending" asset-id bug.)
  const asset = store.addAsset({
    issuerId: issuer.id,
    title: input.title,
    mediaType,
    mimeType: input.mimeType,
    contentHash,
    perceptualHashes,
    audioFingerprint: audioFp,
    manifest,
    signature,
    publishedAt,
    expiresAt: input.expiresAt ?? null,
    revoked: false,
    logSeq: -1,
  });
  const logEntry = store.appendLog(asset.id, contentHash);
  store.setAssetLogSeq(asset.id, logEntry.seq);
  asset.logSeq = logEntry.seq;

  return { asset, logEntry };
}
