/**
 * Regulator-ready evidence pack. Bundles the campaign, its shared indicators,
 * the linked submissions, the tamper-evident log status, and an explicit
 * statement of the verification methodology used to reach each verdict.
 */

import { getStore } from "../db/store.js";
import { getCampaigns, severityOf } from "./campaignService.js";
import {
  ALTERED_MAX_CELLS,
  DERIVATIVE_MAX_CELLS,
  GRID_SIZE,
} from "../fingerprint/index.js";

const METHODOLOGY = {
  provenance:
    "Exact match on SHA-256 content hash, then Ed25519 signature verification of the issuer's provenance manifest. A record whose signature fails validation is reported as invalid_provenance, never genuine.",
  perceptual: `Images/video frames reduced to a ${GRID_SIZE}x${GRID_SIZE} grayscale block-average grid. Verdict by changed-cell count: <= ${DERIVATIVE_MAX_CELLS} = Verified Copy (re-compression), <= ${ALTERED_MAX_CELLS} = Altered (localised edit), else no match.`,
  risk:
    "Unverified content is scored by an AI risk engine for impersonation and phishing signals; indicators (UPI handles, phone numbers, domains) are extracted for campaign correlation.",
  clustering:
    "Fraud events are linked into campaigns by shared normalized indicators (entity, UPI handle, phone, domain) via connected-component analysis.",
};

export function buildSnapshot() {
  const store = getStore();
  return {
    generatedAt: new Date().toISOString(),
    system: "PramaanSetu",
    methodology: METHODOLOGY,
    transparencyLog: store.verifyLog(),
    totals: store.stats(),
    campaigns: getCampaigns(),
  };
}

export function buildCampaignEvidence(campaignId: number) {
  const store = getStore();
  const campaign = getCampaigns().find((c) => c.id === campaignId);
  if (!campaign) return null;

  const relatedEvents = store
    .listEvents()
    .filter((e) => severityOf(e) !== "low")
    .filter((e) => {
      const inEntity = campaign.entities.some(
        (x) => (e.impersonatedEntity ?? e.matchedIssuerName) === x,
      );
      const inHandle = e.paymentHandles.some((h) => campaign.paymentHandles.includes(h));
      const inPhone = e.phoneNumbers.some((p) => campaign.phoneNumbers.includes(p));
      return inEntity || inHandle || inPhone;
    })
    .map((e) => ({
      timestamp: e.timestamp,
      verdict: e.verdict,
      severity: severityOf(e),
      mediaType: e.mediaType,
      impersonatedEntity: e.impersonatedEntity,
      matchedIssuer: e.matchedIssuerName,
      paymentHandles: e.paymentHandles,
      phoneNumbers: e.phoneNumbers,
      urls: e.urls,
      riskLevel: e.riskLevel,
      riskScore: e.riskScore,
    }));

  return {
    generatedAt: new Date().toISOString(),
    system: "PramaanSetu",
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
  };
}
