/** Shared data types for the PramaanSetu store. */

export type EntityClass =
  | "sebi"
  | "exchange"
  | "depository"
  | "listed_company"
  | "broker"
  | "investment_adviser";

export type MediaType = "image" | "video" | "audio" | "pdf" | "text";

export type Verdict =
  | "original" // exact signed match, valid signature
  | "derivative" // perceptual match, visually identical (compressed/re-encoded)
  | "altered" // perceptual match to a signed asset but content differs
  | "invalid_provenance" // matched a record whose signature does NOT validate
  | "revoked" // matched a signed asset that was revoked
  | "expired" // matched a signed asset past its validity
  | "unverified"; // no provenance match

/** How much the issuer identity itself can be trusted. */
export type TrustLevel =
  | "demo" // key generated inside PramaanSetu for demo purposes only
  | "validated"; // identity checked against a SEBI-registration allowlist source

export interface Issuer {
  id: string;
  name: string;
  sebiRegNo: string;
  entityClass: EntityClass;
  publicKey: string; // base64 SPKI (Ed25519)
  privateKey: string; // base64 PKCS8 - PROTOTYPE ONLY (prod: HSM/KMS)
  apiKey: string; // secret bearer token that authorises signing as this issuer
  demoIssuer: boolean; // pre-approved demo identity (keyless signing allowed in demo mode)
  validUpiHandles: string[];
  trustLevel: TrustLevel;
  registrationSource: string | null; // URL of the SEBI-registration record
  createdAt: string;
}

/**
 * C2PA-inspired provenance manifest that gets signed. This is NOT a conformant
 * C2PA manifest store (no standardized assertions/claims or content bindings);
 * it is a signed JSON claim over the content hash and issuer identity.
 */
export interface Manifest {
  issuer: {
    id: string;
    name: string;
    sebiRegNo: string;
    entityClass: EntityClass;
    trustLevel: TrustLevel;
  };
  title: string;
  mediaType: MediaType;
  contentHash: string; // sha256 hex of the exact bytes/text
  publishedAt: string;
  expiresAt: string | null;
  approvedPaymentHandles: string[];
  authoritativeUrl: string | null;
}

export interface SignedAsset {
  id: string;
  issuerId: string;
  title: string;
  mediaType: MediaType;
  mimeType: string;
  contentHash: string;
  perceptualHashes: string[]; // image: 1 hash; video: per-keyframe hashes
  pageHashes?: string[][]; // pdf: per-page fingerprint sets, so pages are compared by position (not flattened)
  pageCount?: number; // pdf: the document's ACTUAL page count, compared at verification to catch added/removed pages
  audioFingerprint?: string; // video/audio: spectrogram signature of the audio track
  manifest: Manifest;
  signature: string; // base64 Ed25519 over canonical manifest JSON
  publishedAt: string;
  expiresAt: string | null;
  revoked: boolean;
  logSeq: number;
}

export interface LogEntry {
  seq: number;
  timestamp: string;
  assetId: string;
  contentHash: string;
  prevHash: string;
  entryHash: string;
}

export interface VerificationEvent {
  id: string;
  timestamp: string;
  verdict: Verdict;
  mediaType: MediaType;
  contentHash: string | null; // SHA-256 of the submitted content
  matchedAssetId: string | null;
  matchedIssuerName: string | null;
  // Fraud-clustering fields (populated for altered / invalid / unverified):
  impersonatedEntity: string | null;
  paymentHandles: string[];
  phoneNumbers: string[];
  urls: string[];
  tamperType: string | null; // e.g. "payment_qr_swap"
  riskLevel: string | null;
  riskScore: number | null;
  // Synthetic-media detection (populated for unsigned image/video/audio):
  syntheticScore?: number | null; // 0-100, higher = more likely AI-generated
  syntheticLabel?: string | null; // likely-authentic | uncertain | likely-synthetic
}

export interface DbShape {
  issuers: Issuer[];
  assets: SignedAsset[];
  log: LogEntry[];
  events: VerificationEvent[];
  // Ed25519 keypair used to sign exported evidence packs (integrity).
  evidenceKey?: { publicKey: string; privateKey: string };
}
