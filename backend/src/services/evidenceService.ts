/**
 * Regulator-ready evidence pack. Bundles the campaign, its shared indicators,
 * the linked submissions (with per-event hashes, matched asset, signature
 * result and tamper type), the tamper-evident log status, and an explicit
 * statement of the verification methodology. The whole pack is Ed25519-signed
 * by the evidence service so its integrity can be independently checked.
 */

import { getStore } from "../db/store.js";
import { getCampaigns, severityOf } from "./campaignService.js";
import { verifyManifest, signJson } from "../crypto/signing.js";
import { env } from "../config/env.js";
import {
  ALTERED_MAX_CELLS,
  DERIVATIVE_MAX_CELLS,
  GRID_SIZE,
} from "../fingerprint/index.js";
import type { VerificationEvent } from "../db/types.js";

const SYSTEM_VERSION = "0.2.0";

const METHODOLOGY = {
  provenance:
    "Exact match on SHA-256 content hash, then Ed25519 signature verification of the issuer's provenance manifest. A record whose signature fails validation is reported as invalid_provenance, never genuine.",
  perceptual: `Images/video frames reduced to a ${GRID_SIZE}x${GRID_SIZE} colour block-average grid. Verdict by changed-cell count: <= ${DERIVATIVE_MAX_CELLS} = Verified Copy (re-compression), <= ${ALTERED_MAX_CELLS} = Altered (localised edit), else no match.`,
  paymentTamper:
    "For images resembling a signed document, the embedded QR is decoded and its UPI payee compared to the issuer's approved handles; a mismatch is payment redirection (altered).",
  risk: `Unverified content is scored by an AI risk engine (${env.geminiModel}) for impersonation and phishing signals; indicators are extracted for campaign correlation.`,
  clustering:
    "Fraud events are linked into campaigns by shared normalized indicators (entity, UPI handle, phone, domain) via connected-component analysis.",
};

function assetSignatureResult(assetId: string | null): string {
  if (!assetId) return "n/a";
  const store = getStore();
  const asset = store.getAsset(assetId);
  if (!asset) return "asset_missing";
  const issuer = store.getIssuer(asset.issuerId);
  const valid = issuer
    ? verifyManifest(asset.manifest, asset.signature, issuer.publicKey)
    : false;
  return valid ? "valid" : "invalid";
}

function logReference(assetId: string | null): { seq: number; entryHash: string } | null {
  if (!assetId) return null;
  const asset = getStore().getAsset(assetId);
  if (!asset) return null;
  const entry = getStore().getLog().find((e) => e.seq === asset.logSeq);
  return entry ? { seq: entry.seq, entryHash: entry.entryHash } : null;
}

function serialiseEvent(e: VerificationEvent) {
  return {
    eventId: e.id,
    timestamp: e.timestamp,
    verdict: e.verdict,
    severity: severityOf(e),
    mediaType: e.mediaType,
    submittedContentHash: e.contentHash,
    matchedAssetId: e.matchedAssetId,
    matchedIssuer: e.matchedIssuerName,
    matchedAssetSignature: assetSignatureResult(e.matchedAssetId),
    tamperType: e.tamperType,
    impersonatedEntity: e.impersonatedEntity,
    paymentHandles: e.paymentHandles,
    phoneNumbers: e.phoneNumbers,
    urls: e.urls,
    riskLevel: e.riskLevel,
    riskScore: e.riskScore,
    logReference: logReference(e.matchedAssetId),
  };
}

/** Attach an Ed25519 integrity signature over the pack. */
function sign<T extends object>(pack: T): T & {
  integrity: { algorithm: string; publicKey: string; signature: string };
} {
  const key = getStore().getEvidenceKeyPair();
  const signature = signJson(pack, key.privateKey);
  return {
    ...pack,
    integrity: { algorithm: "Ed25519", publicKey: key.publicKey, signature },
  };
}

export function buildSnapshot() {
  const store = getStore();
  return sign({
    generatedAt: new Date().toISOString(),
    system: "PramaanSetu",
    systemVersion: SYSTEM_VERSION,
    methodology: METHODOLOGY,
    transparencyLog: store.verifyLog(),
    totals: store.stats(),
    campaigns: getCampaigns(),
  });
}

export function buildCampaignEvidence(campaignId: number) {
  const store = getStore();
  const campaign = getCampaigns().find((c) => c.id === campaignId);
  if (!campaign) return null;

  const domainOf = (url: string): string | null => {
    try {
      return new URL(url.startsWith("http") ? url : `http://${url}`).hostname.toLowerCase();
    } catch {
      return null;
    }
  };

  const relatedEvents = store
    .listEvents()
    .filter((e) => severityOf(e) !== "low")
    .filter((e) => {
      const inEntity = campaign.entities.some(
        (x) => (e.impersonatedEntity ?? e.matchedIssuerName) === x,
      );
      const inHandle = e.paymentHandles.some((h) => campaign.paymentHandles.includes(h));
      const inPhone = e.phoneNumbers.some((p) => campaign.phoneNumbers.includes(p));
      const inDomain = e.urls.some((u) => {
        const d = domainOf(u);
        return d != null && campaign.domains.includes(d);
      });
      return inEntity || inHandle || inPhone || inDomain;
    })
    .map(serialiseEvent);

  return sign({
    generatedAt: new Date().toISOString(),
    system: "PramaanSetu",
    systemVersion: SYSTEM_VERSION,
    reportType: "campaign_evidence_pack",
    campaign: {
      id: campaign.id,
      severity: campaign.severity,
      impersonatedEntities: campaign.entities,
      sharedIndicators: campaign.linkingIndicators,
      paymentHandles: campaign.paymentHandles,
      phoneNumbers: campaign.phoneNumbers,
      domains: campaign.domains,
      confirmedCount: campaign.confirmedCount,
      suspectedCount: campaign.suspectedCount,
      maxRiskScore: campaign.maxRiskScore,
      firstSeen: campaign.firstSeen,
      lastSeen: campaign.lastSeen,
    },
    relatedSubmissions: relatedEvents,
    verificationMethodology: METHODOLOGY,
    transparencyLog: store.verifyLog(),
    disclaimer:
      "Machine-generated decision-support output. 'Suspected' items are AI-scored and require human confirmation before enforcement.",
  });
}
