/**
 * Layer 3: cluster fraud reports into campaigns using a shared-indicator graph.
 *
 * Nodes are fraud events; two events are linked if they share any normalized
 * indicator (impersonated entity, UPI handle, phone number, or domain). Each
 * connected component is a campaign. This links submissions even when the AI
 * extracts slightly different entity names, as long as a handle/phone/domain
 * matches - which is how real scam campaigns are actually traced.
 *
 * Severity tiers (the reviewer's point - do NOT call every unverified item
 * "fraud"):
 *   confirmed  = altered / invalid_provenance  (matched a genuine asset, tampered)
 *   suspected  = unverified with high/critical AI risk
 *   low        = unverified with low/medium/no risk   (NOT counted as fraud)
 */

import { getStore } from "../db/store.js";
import type { VerificationEvent } from "../db/types.js";

export type Severity = "confirmed" | "suspected" | "low";

export interface Campaign {
  id: number;
  severity: Exclude<Severity, "low">;
  eventCount: number;
  eventIds: string[]; // explicit membership - evidence selects by these, not by re-derived indicators
  confirmedCount: number;
  suspectedCount: number;
  entities: string[];
  paymentHandles: string[];
  phoneNumbers: string[];
  domains: string[];
  linkingIndicators: string[]; // indicators shared by >1 event (why they cluster)
  maxRiskScore: number;
  firstSeen: string;
  lastSeen: string;
}

export function severityOf(e: VerificationEvent): Severity {
  // Only content-level tampering (edited content, swapped payment QR, replaced
  // audio) is auto-"confirmed" external fraud. A failed signature or broken log
  // (invalid_provenance) is a REGISTRY-INTEGRITY issue that needs human review -
  // not an automatic fraud attribution against the (often legitimate) issuer it
  // impersonates. That prevents a system-integrity incident from manufacturing
  // "confirmed fraud" campaigns.
  if (e.verdict === "altered") return "confirmed";
  if (e.verdict === "invalid_provenance") return "suspected";
  if (e.verdict === "unverified" && (e.riskLevel === "high" || e.riskLevel === "critical"))
    return "suspected";
  return "low";
}

function normEntity(s: string | null): string | null {
  if (!s) return null;
  const n = s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return n.length >= 3 ? n : null;
}
/** Canonical last-10-digit phone form. Shared by clustering AND evidence. */
export function normPhone(s: string): string {
  return s.replace(/\D/g, "").slice(-10);
}
/** Canonical payment-handle form. Shared by clustering AND evidence. */
export function normHandle(s: string): string {
  return s.trim().toLowerCase();
}
function domainOf(url: string): string | null {
  try {
    return new URL(url.startsWith("http") ? url : `http://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function indicatorsOf(e: VerificationEvent): string[] {
  const out: string[] = [];
  const ent = normEntity(e.impersonatedEntity ?? e.matchedIssuerName);
  if (ent) out.push(`entity:${ent}`);
  for (const h of e.paymentHandles) if (h.trim()) out.push(`upi:${h.trim().toLowerCase()}`);
  for (const p of e.phoneNumbers) { const n = normPhone(p); if (n.length >= 7) out.push(`phone:${n}`); }
  for (const u of e.urls) { const d = domainOf(u); if (d) out.push(`domain:${d}`); }
  return [...new Set(out)];
}

// ---- Union-Find over fraud events -----------------------------------------

class UF {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    this.parent[this.find(a)] = this.find(b);
  }
}

export function getCampaigns(): Campaign[] {
  const events = getStore()
    .listEvents()
    .filter((e) => severityOf(e) !== "low");

  const n = events.length;
  const uf = new UF(n);
  const indicatorFirst = new Map<string, number>();
  const indicatorCount = new Map<string, number>();

  events.forEach((e, i) => {
    for (const ind of indicatorsOf(e)) {
      indicatorCount.set(ind, (indicatorCount.get(ind) ?? 0) + 1);
      if (indicatorFirst.has(ind)) uf.union(i, indicatorFirst.get(ind)!);
      else indicatorFirst.set(ind, i);
    }
  });

  const groups = new Map<number, number[]>();
  events.forEach((_, i) => {
    const r = uf.find(i);
    const arr = groups.get(r) ?? [];
    arr.push(i);
    groups.set(r, arr);
  });

  const campaigns: Campaign[] = [];
  for (const idxs of groups.values()) {
    const evs = idxs.map((i) => events[i]);
    const entities = new Set<string>();
    const handles = new Set<string>();
    const phones = new Set<string>();
    const domains = new Set<string>();
    const linking = new Set<string>();
    let maxRisk = 0;
    let confirmed = 0;
    let suspected = 0;
    const times = evs.map((e) => e.timestamp).sort((a, b) => a.localeCompare(b));

    for (const e of evs) {
      if (severityOf(e) === "confirmed") confirmed++;
      else suspected++;
      if (e.impersonatedEntity) entities.add(e.impersonatedEntity);
      else if (e.matchedIssuerName) entities.add(e.matchedIssuerName);
      e.paymentHandles.forEach((h) => handles.add(h.trim().toLowerCase()));
      // Normalise phones to their last-10-digit canonical form so "+91987…"
      // and "919 87…" don't appear as separate indicators.
      e.phoneNumbers.forEach((p) => { const n = normPhone(p); if (n.length >= 7) phones.add(n); });
      e.urls.forEach((u) => { const d = domainOf(u); if (d) domains.add(d); });
      if (e.riskScore && e.riskScore > maxRisk) maxRisk = e.riskScore;
      for (const ind of indicatorsOf(e)) {
        if ((indicatorCount.get(ind) ?? 0) > 1) linking.add(ind);
      }
    }

    // Stable, content-derived ID so /api/evidence/:id links stay valid as the
    // radar recomputes (instead of a positional counter that reshuffles). When a
    // campaign has NO shared indicators (identity would be empty), fall back to
    // the events' own content hashes / ids so two indicator-less campaigns can't
    // collide onto the same id (which would break evidence export).
    const indicatorIdentity = [...entities, ...handles, ...phones, ...domains]
      .sort((a, b) => a.localeCompare(b))
      .join("|");
    const identity =
      indicatorIdentity ||
      `events:${evs.map((e) => e.contentHash ?? e.id).sort((a, b) => a.localeCompare(b)).join(",")}`;
    campaigns.push({
      id: stableId(identity),
      severity: confirmed > 0 ? "confirmed" : "suspected",
      eventCount: evs.length,
      eventIds: evs.map((e) => e.id),
      confirmedCount: confirmed,
      suspectedCount: suspected,
      entities: [...entities],
      paymentHandles: [...handles],
      phoneNumbers: [...phones],
      domains: [...domains],
      linkingIndicators: [...linking],
      maxRiskScore: maxRisk,
      firstSeen: times[0],
      lastSeen: times[times.length - 1],
    });
  }

  // Biggest / most severe first.
  return campaigns.sort(
    (a, b) =>
      Number(b.severity === "confirmed") - Number(a.severity === "confirmed") ||
      b.eventCount - a.eventCount,
  );
}

/** Deterministic positive 31-bit ID from a cluster's indicator identity. */
function stableId(identity: string): number {
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < identity.length; i++) {
    h ^= identity.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 1) % 1_000_000_000; // positive, bounded
}

function topCounts(values: string[], limit = 10): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function getDashboardStats() {
  const store = getStore();
  const events = store.listEvents();
  let confirmed = 0;
  let suspected = 0;
  let lowUnverified = 0;
  let genuine = 0;
  let revoked = 0;
  let expired = 0;
  // Synthetic-media detection tallies (unsigned image/video/audio scans).
  let synthScanned = 0;
  let synthLikely = 0;
  let synthUncertain = 0;
  const verdictBreakdown: Record<string, number> = {};
  for (const e of events) {
    const sev = severityOf(e);
    if (sev === "confirmed") confirmed++;
    else if (sev === "suspected") suspected++;
    else if (e.verdict === "unverified") lowUnverified++; // low-risk unverified only
    else if (e.verdict === "revoked") revoked++;
    else if (e.verdict === "expired") expired++;
    else genuine++; // original / derivative only
    verdictBreakdown[e.verdict] = (verdictBreakdown[e.verdict] ?? 0) + 1;
    if (e.syntheticScore != null) {
      synthScanned++;
      if (e.syntheticLabel === "likely-synthetic") synthLikely++;
      else if (e.syntheticLabel === "uncertain") synthUncertain++;
    }
  }
  const fraud = events.filter((e) => severityOf(e) !== "low");

  return {
    totals: {
      ...store.stats(),
      totalVerifications: events.length,
      genuineVerifications: genuine,
      revokedHits: revoked,
      expiredHits: expired,
      confirmedFraud: confirmed,
      suspectedFraud: suspected,
      lowRiskUnverified: lowUnverified,
      campaigns: getCampaigns().length,
    },
    detection: {
      mediaScanned: synthScanned,
      likelySynthetic: synthLikely,
      uncertain: synthUncertain,
      likelyAuthentic: synthScanned - synthLikely - synthUncertain,
    },
    verdictBreakdown,
    topPaymentHandles: topCounts(fraud.flatMap((e) => e.paymentHandles.map((h) => h.trim().toLowerCase()))),
    topPhoneNumbers: topCounts(
      fraud.flatMap((e) => e.phoneNumbers.map(normPhone).filter((n) => n.length >= 7)),
    ),
    topImpersonatedEntities: topCounts(
      fraud.map((e) => e.impersonatedEntity ?? e.matchedIssuerName).filter((x): x is string => !!x),
    ),
    topDomains: topCounts(
      fraud.flatMap((e) => e.urls.map(domainOf).filter((d): d is string => !!d)),
    ),
    logIntegrity: store.verifyLog(),
  };
}
