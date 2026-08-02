/**
 * Layer 2: verify submitted content and return one of several verdicts.
 *
 * Deterministic first (cryptography + fingerprints), AI only as a fallback on
 * genuinely unverified content. A record whose signature does NOT validate is
 * never reported as genuine — it becomes `invalid_provenance`. Revocation and
 * expiry are applied to exact matches AND to re-compressed derivatives.
 */

import { getStore } from "../db/store.js";
import type { MediaType, SignedAsset, TrustLevel, Verdict } from "../db/types.js";
import { verifyManifest } from "../crypto/signing.js";
import {
  ALTERED_MAX_CELLS,
  DERIVATIVE_MAX_CELLS,
  bestChangedCells,
  changedCells,
  cellDiffGrid,
  computePerceptualHashes,
  imageFingerprint,
  mediaTypeFromMime,
  sha256,
  audioFingerprint,
  audioChangedCells,
  AUDIO_SAME_MAX,
  extFromMime,
} from "../fingerprint/index.js";
import { decodeQr, extractUpiPayee } from "../fingerprint/qr.js";
import { getFingerprintIndex } from "../fingerprint/fpIndex.js";
import { renderPdfFirstPage } from "../fingerprint/pdf.js";
import { assessRisk, type RiskAssessment } from "../ai/riskEngine.js";
import { detectSynthetic } from "../detect/detectionService.js";
import type { SyntheticAssessment } from "../detect/types.js";
import { env } from "../config/env.js";

export interface VerifyInput {
  mimeType: string;
  bytes?: Buffer;
  text?: string;
}

export interface TamperMap {
  grid: number; // e.g. 32
  changedCells: number;
  cells: number[]; // 1 = changed, 0 = unchanged (row-major, grid*grid)
}

export interface VerifyResult {
  verdict: Verdict;
  mediaType: MediaType;
  match?: {
    assetId: string;
    title: string;
    issuerName: string;
    sebiRegNo: string;
    trustLevel: TrustLevel;
    registrationSource: string | null;
    signatureValid: boolean;
    publishedAt: string;
    authoritativeUrl: string | null;
    approvedPaymentHandles: string[];
    perceptualDistance: number | null;
    logSeq: number;
    logEntryHash: string | null;
    revoked: boolean;
    expired: boolean;
    differences?: string[];
    tamperMap?: TamperMap;
    paymentTamper?: { foundPayee: string; approvedPayees: string[] };
  };
  risk?: RiskAssessment | { unavailable: true; reason: string };
  synthetic?: SyntheticAssessment;
  message: string;
  contentHash: string;
}

function isExpired(asset: SignedAsset): boolean {
  return !!asset.expiresAt && new Date(asset.expiresAt).getTime() < Date.now();
}

function publicMatch(
  asset: SignedAsset,
  distance: number | null,
  sigValid: boolean,
) {
  const store = getStore();
  const issuer = store.getIssuer(asset.issuerId);
  const logEntry = store.getLog().find((e) => e.seq === asset.logSeq);
  return {
    assetId: asset.id,
    title: asset.title,
    issuerName: issuer?.name ?? asset.manifest.issuer.name,
    sebiRegNo: asset.manifest.issuer.sebiRegNo,
    trustLevel: asset.manifest.issuer.trustLevel,
    registrationSource: issuer?.registrationSource ?? null,
    signatureValid: sigValid,
    publishedAt: asset.publishedAt,
    authoritativeUrl: asset.manifest.authoritativeUrl,
    approvedPaymentHandles: asset.manifest.approvedPaymentHandles,
    perceptualDistance: distance,
    logSeq: asset.logSeq,
    logEntryHash: logEntry?.entryHash ?? null,
    revoked: asset.revoked,
    expired: isExpired(asset),
  };
}

/**
 * Given a matched asset, resolve the verdict considering signature validity,
 * revocation and expiry. Used for BOTH exact and derivative matches.
 */
function resolveGenuineVerdict(
  asset: SignedAsset,
  isExact: boolean,
): { verdict: Verdict; sigValid: boolean; message: string } {
  const store = getStore();
  const issuer = store.getIssuer(asset.issuerId);
  const sigValid = issuer
    ? verifyManifest(asset.manifest, asset.signature, issuer.publicKey)
    : false;
  const name = asset.manifest.issuer.name;

  if (!sigValid) {
    return {
      verdict: "invalid_provenance",
      sigValid,
      message: `A record exists but its cryptographic signature does NOT validate. This is not a trustworthy communication. Do not act on it.`,
    };
  }
  if (asset.revoked) {
    return {
      verdict: "revoked",
      sigValid,
      message: `This was signed by ${name} but has since been REVOKED. Do not act on it.`,
    };
  }
  if (isExpired(asset)) {
    return {
      verdict: "expired",
      sigValid,
      message: `This is a genuine ${name} communication but it has EXPIRED and is no longer current.`,
    };
  }
  return {
    verdict: isExact ? "original" : "derivative",
    sigValid,
    message: isExact
      ? `Verified genuine communication signed by ${name}.`
      : `This is a re-compressed copy of a genuine communication by ${name}. The content is unchanged.`,
  };
}

export async function verifyContent(input: VerifyInput): Promise<VerifyResult> {
  const store = getStore();
  const mediaType: MediaType = input.text ? "text" : mediaTypeFromMime(input.mimeType);
  const contentBuf = input.text ? Buffer.from(input.text, "utf8") : input.bytes;
  if (!contentBuf) throw new Error("No content provided (bytes or text).");

  const contentHash = sha256(contentBuf);

  // 1) Exact content-hash match.
  const exact = store.getAssetByContentHash(contentHash);
  if (exact) {
    const { verdict, sigValid, message } = resolveGenuineVerdict(exact, true);
    record({ verdict, mediaType, contentHash, asset: exact });
    return {
      verdict,
      mediaType,
      match: publicMatch(exact, 0, sigValid),
      message,
      contentHash,
    };
  }

  // 2) Perceptual match (image/video/pdf) -> Derivative or Altered.
  if (mediaType === "image" || mediaType === "video" || mediaType === "pdf") {
    const probe = await computePerceptualHashes(contentBuf, mediaType, input.mimeType);
    if (probe.length > 0) {
      // Sub-linear candidate narrowing via the LSH index, then exact compare.
      const candidates = getFingerprintIndex().candidates(probe, store.listAssets());
      let best: { asset: SignedAsset; dist: number } | null = null;
      for (const asset of candidates) {
        if (asset.perceptualHashes.length === 0) continue;
        const d = bestChangedCells(probe, asset.perceptualHashes);
        if (!best || d < best.dist) best = { asset, dist: d };
      }

      if (best && best.dist <= ALTERED_MAX_CELLS) {
        const issuerName = best.asset.manifest.issuer.name;

        // If the matched registry record's OWN signature does not validate, the
        // whole thing is untrustworthy regardless of visual similarity.
        const issuer = store.getIssuer(best.asset.issuerId);
        const originalSigValid = issuer
          ? verifyManifest(best.asset.manifest, best.asset.signature, issuer.publicKey)
          : false;
        if (!originalSigValid) {
          record({ verdict: "invalid_provenance", mediaType, contentHash, asset: best.asset });
          return {
            verdict: "invalid_provenance",
            mediaType,
            match: publicMatch(best.asset, best.dist, false),
            message: `This resembles a ${issuerName} communication, but the underlying registry record's signature does not validate. Do not trust it.`,
            contentHash,
          };
        }

        // Audio-replacement (voice-clone) check: if the video frames match a
        // signed asset but the audio track's spectrogram differs, the audio was
        // replaced — the signature of a dubbed / voice-cloned deepfake.
        if (mediaType === "video" && best.asset.audioFingerprint && contentBuf) {
          const probeAudio = await audioFingerprint(contentBuf, extFromMime(input.mimeType));
          if (probeAudio) {
            const audioDiff = audioChangedCells(probeAudio, best.asset.audioFingerprint);
            if (audioDiff > AUDIO_SAME_MAX) {
              record({
                verdict: "altered",
                mediaType,
                contentHash,
                asset: best.asset,
                tamperType: "audio_replaced",
              });
              return {
                verdict: "altered",
                mediaType,
                match: {
                  ...publicMatch(best.asset, best.dist, originalSigValid),
                  differences: [
                    `The video frames match a genuine ${issuerName} communication, but the AUDIO track has been replaced (${audioDiff}/256 spectrogram cells changed).`,
                    "This is the signature of a voice-clone or dubbed deepfake. Do not trust the audio.",
                  ],
                },
                message: `WARNING: The video looks like a genuine ${issuerName} communication, but its AUDIO was REPLACED — likely a voice clone. Do not trust it.`,
                contentHash,
              };
            }
          }
        }

        // Payment-tamper check: decode the QR and confirm the payee is still an
        // approved handle — catches a swapped payment QR even when pixels match.
        // For PDFs, decode the QR from the rendered first page.
        const qrBuffer =
          mediaType === "image"
            ? contentBuf
            : mediaType === "pdf"
              ? await renderPdfFirstPage(contentBuf)
              : null;
        if (qrBuffer) {
          const qrText = await decodeQr(qrBuffer);
          const payee = qrText ? extractUpiPayee(qrText) : null;
          const approved = best.asset.manifest.approvedPaymentHandles;
          if (payee && approved.length > 0 && !approved.includes(payee)) {
            record({
              verdict: "altered",
              mediaType,
              contentHash,
              asset: best.asset,
              paymentHandles: [payee],
              tamperType: "payment_qr_swap",
            });
            return {
              verdict: "altered",
              mediaType,
              match: {
                ...publicMatch(best.asset, best.dist, originalSigValid),
                differences: [
                  `Payment address in the QR code is "${payee}", which is NOT an approved handle for ${issuerName}.`,
                  `Approved handle(s): ${approved.join(", ")}. This is payment redirection — do not pay.`,
                ],
                paymentTamper: { foundPayee: payee, approvedPayees: approved },
              },
              message: `WARNING: This looks like a ${issuerName} communication but its payment QR was SWAPPED to "${payee}". Do not pay.`,
              contentHash,
            };
          }
        }

        if (best.dist <= DERIVATIVE_MAX_CELLS) {
          const { verdict, sigValid, message } = resolveGenuineVerdict(best.asset, false);
          record({ verdict, mediaType, contentHash, asset: best.asset });
          return {
            verdict,
            mediaType,
            match: publicMatch(best.asset, best.dist, sigValid),
            message,
            contentHash,
          };
        }

        // Visual edit within the altered band. Localise the tampered region.
        let tamperMap: TamperMap | undefined;
        if (mediaType === "image") {
          const probeFp = probe[0];
          const originalFp = best.asset.perceptualHashes.reduce((a, b) =>
            changedCells(probeFp, b) < changedCells(probeFp, a) ? b : a,
          );
          const { grid, cells, changed } = cellDiffGrid(probeFp, originalFp);
          tamperMap = { grid, changedCells: changed, cells };
        }
        record({
          verdict: "altered",
          mediaType,
          contentHash,
          asset: best.asset,
          tamperType: "visual_edit",
        });
        return {
          verdict: "altered",
          mediaType,
          match: {
            ...publicMatch(best.asset, best.dist, originalSigValid),
            differences: [
              "Content closely matches a genuine signed communication but has been modified.",
              "The highlighted region differs from the original (e.g. a swapped payment QR, edited figure, or removed disclaimer).",
            ],
            tamperMap,
          },
          message: `WARNING: This closely resembles a genuine ${issuerName} communication but has been ALTERED. Do not pay or act on it. Check the official source.`,
          contentHash,
        };
      }
    }
  }

  // 3) Audio-to-audio provenance: a recompressed/edited copy of a signed audio
  //    record is matched by its spectrogram signature.
  if (mediaType === "audio" && contentBuf) {
    const audioResult = await matchSignedAudio(contentBuf, input.mimeType, contentHash);
    if (audioResult) return audioResult;
  }

  // 4) No provenance match -> Unverified. Run AI risk engine as a fallback.
  return unverified(input, mediaType, contentHash);
}

/**
 * Match an unsigned audio clip against signed audio records by spectrogram
 * distance. Returns a `derivative` verdict when the clip is a recompressed copy
 * of a signed recording (a forwarded voice note), or null when it matches
 * nothing — in which case the caller falls through to unverified + the
 * synthetic-voice detector, which is the right tool for "was this audio
 * manipulated?".
 *
 * The ceiling is the tight AUDIO_SAME_MAX band (verified by the audio test to
 * accept a recompressed copy while rejecting an unrelated recording), so audio
 * provenance never false-matches.
 */
async function matchSignedAudio(
  contentBuf: Buffer,
  mimeType: string,
  contentHash: string,
): Promise<VerifyResult | null> {
  const store = getStore();
  const probe = await audioFingerprint(contentBuf, extFromMime(mimeType));
  if (!probe) return null;

  let best: { asset: SignedAsset; dist: number } | null = null;
  for (const asset of store.listAssets()) {
    if (asset.mediaType !== "audio" || !asset.audioFingerprint) continue;
    const d = audioChangedCells(probe, asset.audioFingerprint);
    if (!best || d < best.dist) best = { asset, dist: d };
  }
  if (!best || best.dist > AUDIO_SAME_MAX) return null;

  const issuer = store.getIssuer(best.asset.issuerId);
  const sigValid = issuer
    ? verifyManifest(best.asset.manifest, best.asset.signature, issuer.publicKey)
    : false;
  const issuerName = best.asset.manifest.issuer.name;

  if (!sigValid) {
    record({ verdict: "invalid_provenance", mediaType: "audio", contentHash, asset: best.asset });
    return {
      verdict: "invalid_provenance",
      mediaType: "audio",
      match: publicMatch(best.asset, best.dist, false),
      message: `This resembles a ${issuerName} audio recording, but the underlying record's signature does not validate. Do not trust it.`,
      contentHash,
    };
  }

  const { verdict, message } = resolveGenuineVerdict(best.asset, false);
  record({ verdict, mediaType: "audio", contentHash, asset: best.asset });
  return { verdict, mediaType: "audio", match: publicMatch(best.asset, best.dist, true), message, contentHash };
}

async function unverified(
  input: VerifyInput,
  mediaType: MediaType,
  contentHash: string,
): Promise<VerifyResult> {
  let risk: RiskAssessment | { unavailable: true; reason: string };
  let impersonated: string | null = null;
  let handles: string[] = [];
  let phones: string[] = [];
  let urls: string[] = [];
  let riskLevel: string | null = null;
  let riskScore: number | null = null;

  // Synthetic-media detection: for unsigned image/video/audio, answer the other
  // half of the problem statement — is the content itself AI-generated/deepfaked?
  // Kicked off concurrently with the phishing-risk call below (different
  // questions on the same content) so an unsigned image isn't doubly slow.
  const syntheticPromise: Promise<SyntheticAssessment | undefined> =
    (mediaType === "image" || mediaType === "video" || mediaType === "audio") && input.bytes
      ? detectSynthetic({ mediaType, bytes: input.bytes, mimeType: input.mimeType }).catch((e) => {
          console.error("synthetic detection failed:", (e as Error).message);
          return undefined;
        })
      : Promise.resolve(undefined);

  if (env.geminiKeys.length === 0) {
    risk = { unavailable: true, reason: "AI risk engine not configured (no Gemini keys)." };
  } else {
    try {
      // Give the AI something visual for images and PDFs (render page 1).
      let image: { data: string; mimeType: string } | undefined;
      if (input.bytes && mediaType === "image") {
        image = { data: input.bytes.toString("base64"), mimeType: input.mimeType };
      } else if (input.bytes && mediaType === "pdf") {
        const page = await renderPdfFirstPage(input.bytes);
        if (page) image = { data: page.toString("base64"), mimeType: "image/png" };
      }
      const assessment = await assessRisk({ text: input.text, image });
      risk = assessment;
      impersonated = assessment.impersonatedEntity;
      handles = assessment.paymentHandles;
      phones = assessment.phoneNumbers;
      urls = assessment.urls;
      riskLevel = assessment.riskLevel;
      riskScore = assessment.riskScore;
    } catch (e) {
      risk = { unavailable: true, reason: `AI risk analysis failed: ${(e as Error).message}` };
    }
  }

  const synthetic = await syntheticPromise;

  getStore().addEvent({
    verdict: "unverified",
    mediaType,
    contentHash,
    matchedAssetId: null,
    matchedIssuerName: null,
    impersonatedEntity: impersonated,
    paymentHandles: handles,
    phoneNumbers: phones,
    urls,
    tamperType: null,
    riskLevel,
    riskScore,
    syntheticScore: synthetic?.syntheticScore ?? null,
    syntheticLabel: synthetic?.label ?? null,
  });

  return {
    verdict: "unverified",
    mediaType,
    risk,
    synthetic,
    message: syntheticMessage(synthetic),
    contentHash,
  };
}

/** Headline message for an unverified result, led by any synthetic finding. */
function syntheticMessage(s: SyntheticAssessment | undefined): string {
  const base =
    "No official signed record was found for this content. 'Unverified' does not prove it is fake, but treat it with caution and never pay based on it.";
  if (!s || (!s.aiAvailable && !s.forensicAvailable)) return base;
  if (s.label === "likely-synthetic") {
    return `No signed record exists AND this ${s.modality} shows strong signs of being AI-generated or manipulated (synthetic score ${s.syntheticScore}/100). Do not trust it.`;
  }
  if (s.label === "uncertain") {
    return `No signed record exists, and this ${s.modality} has some synthetic-media indicators (score ${s.syntheticScore}/100). Treat it with caution.`;
  }
  return base;
}

interface RecordOpts {
  verdict: Verdict;
  mediaType: MediaType;
  contentHash: string;
  asset?: SignedAsset | null;
  paymentHandles?: string[];
  phoneNumbers?: string[];
  urls?: string[];
  tamperType?: string | null;
}

function record(o: RecordOpts): void {
  const isFraud = o.verdict === "altered" || o.verdict === "invalid_provenance";
  getStore().addEvent({
    verdict: o.verdict,
    mediaType: o.mediaType,
    contentHash: o.contentHash,
    matchedAssetId: o.asset?.id ?? null,
    matchedIssuerName: o.asset?.manifest.issuer.name ?? null,
    // For tampering/impersonation, the impersonated entity is the matched issuer.
    impersonatedEntity: isFraud ? o.asset?.manifest.issuer.name ?? null : null,
    paymentHandles: o.paymentHandles ?? [],
    phoneNumbers: o.phoneNumbers ?? [],
    urls: o.urls ?? [],
    tamperType: o.tamperType ?? null,
    riskLevel: null,
    riskScore: null,
  });
}

/** Recompute the perceptual fingerprint of raw bytes (used by benchmark/tests). */
export async function fingerprintBytes(bytes: Buffer): Promise<string> {
  return imageFingerprint(bytes);
}
