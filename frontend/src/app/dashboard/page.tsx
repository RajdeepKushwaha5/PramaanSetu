"use client";

import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";

interface Count { value: string; count: number }
interface Stats {
  totals: {
    issuers: number;
    signedAssets: number;
    totalVerifications: number;
    genuineVerifications?: number;
    confirmedFraud: number;
    suspectedFraud: number;
    lowRiskUnverified: number;
    campaigns: number;
  };
  verdictBreakdown: Record<string, number>;
  topPaymentHandles: Count[];
  topPhoneNumbers: Count[];
  topImpersonatedEntities: Count[];
  logIntegrity: { valid: boolean; brokenAt: number | null; reason: string | null };
}
interface Campaign {
  id: number;
  severity: "confirmed" | "suspected";
  eventCount: number;
  confirmedCount: number;
  suspectedCount: number;
  entities: string[];
  paymentHandles: string[];
  phoneNumbers: string[];
  domains: string[];
  linkingIndicators: string[];
  maxRiskScore: number;
  firstSeen?: string;
  lastSeen?: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const [statsResponse, campaignsResponse] = await Promise.all([
        fetch(apiUrl("/api/dashboard")),
        fetch(apiUrl("/api/campaigns")),
      ]);
      if (!statsResponse.ok || !campaignsResponse.ok) throw new Error("Radar service unavailable");
      setStats(await statsResponse.json());
      setCampaigns(await campaignsResponse.json());
      setUpdatedAt(new Date());
      setError(null);
    } catch {
      setError("Cannot reach the SupTech intelligence service.");
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    const polling = window.setInterval(() => void load(), 5000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(polling);
    };
  }, [load]);

  return (
    <main className="page dashboard-page">
      <section className="page-intro">
        <div className="page-intro-index">
          <strong>03</strong>
          <div><span>REGULATOR SURFACE</span><span>CAMPAIGN INTELLIGENCE</span></div>
        </div>
        <div className="page-intro-copy">
          <p className="eyebrow">SUPTECH RADAR / MARKET-WIDE SIGNAL</p>
          <h1 className="page-title">
            every report becomes
            <span className="muted"> supervisory intelligence.</span>
          </h1>
          <p className="page-lede">
            Fraud submissions become linked campaigns through shared entities,
            payment handles, phone numbers, and domains—ready for human review.
          </p>
        </div>
      </section>

      <section className="radar-statusbar">
        <div>
          <span className="live-mark"><i /> LIVE INGESTION</span>
          <span>refresh / 5s</span>
          <span>{updatedAt ? `updated ${updatedAt.toLocaleTimeString()}` : "connecting…"}</span>
        </div>
        <a className="button" href={apiUrl("/api/evidence")} target="_blank" rel="noreferrer">
          export intelligence snapshot ↗
        </a>
      </section>

      {error && <div className="error-box radar-error">{error}</div>}

      <section className="stat-console">
        <RadarStat label="VERIFICATIONS" value={stats?.totals.totalVerifications} sub="all sensor events" />
        <RadarStat label="SIGNED ASSETS" value={stats?.totals.signedAssets} sub={`${stats?.totals.issuers ?? 0} issuers`} />
        <RadarStat label="CONFIRMED" value={stats?.totals.confirmedFraud} sub="deterministic tamper" tone="danger" />
        <RadarStat label="SUSPECTED" value={stats?.totals.suspectedFraud} sub="high AI risk" tone="caution" />
        <RadarStat label="CAMPAIGNS" value={stats?.totals.campaigns} sub="linked clusters" tone="blue" />
      </section>

      <section className="radar-console">
        <aside className="radar-sidebar">
          <div className="console-brand">
            <span className="logo-mark" aria-hidden="true">
              {Array.from({ length: 9 }, (_, i) => <i key={i} />)}
            </span>
            <div><strong>SUPTECH</strong><span>FRAUD RADAR</span></div>
          </div>
          {[
            ["◫", "Campaigns", campaigns.length.toString().padStart(2, "0"), true],
            ["⌁", "UPI handles", stats?.topPaymentHandles.length ?? 0, false],
            ["◇", "Entities", stats?.topImpersonatedEntities.length ?? 0, false],
            ["◉", "Phone graph", stats?.topPhoneNumbers.length ?? 0, false],
            ["≡", "Evidence", stats?.totals.totalVerifications ?? 0, false],
          ].map(([icon, label, count, active]) => (
            <div className={`radar-nav-item ${active ? "active" : ""}`} key={String(label)}>
              <span>{icon}</span><strong>{label}</strong><b>{count}</b>
            </div>
          ))}
          <div className="integrity-block">
            <span>TRANSPARENCY CHAIN</span>
            <strong className={stats?.logIntegrity.valid ? "good" : "bad"}>
              {stats?.logIntegrity.valid ? "● INTACT" : "● BROKEN"}
            </strong>
            {!stats?.logIntegrity.valid && <p>{stats?.logIntegrity.reason}</p>}
          </div>
        </aside>

        <div className="campaign-workspace">
          <div className="campaign-toolbar">
            <div>
              <span className="micro-label">ACTIVE CAMPAIGNS</span>
              <strong>{campaigns.length.toString().padStart(2, "0")} / PRIORITY QUEUE</strong>
            </div>
            <div className="toolbar-legend">
              <span><i className="red" /> confirmed</span>
              <span><i className="orange" /> suspected</span>
            </div>
          </div>

          {campaigns.length === 0 ? (
            <div className="campaign-empty">
              <div className="radar-scope"><i /><i /><i /></div>
              <strong>NO ACTIVE FRAUD CAMPAIGNS</strong>
              <p>Verify a scam message or altered document to populate the intelligence graph.</p>
            </div>
          ) : (
            <div className="campaign-list">
              {campaigns.map((campaign, index) => (
                <CampaignCard campaign={campaign} index={index} key={campaign.id} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="indicator-section">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">INDICATOR INDEX / OBSERVED</p>
            <h2>campaign infrastructure.<br /><span>ranked by recurrence.</span></h2>
          </div>
        </div>
        <div className="indicator-lists">
          <TopList title="payment handles" code="UPI" items={stats?.topPaymentHandles ?? []} />
          <TopList title="phone numbers" code="TEL" items={stats?.topPhoneNumbers ?? []} />
          <TopList title="impersonated entities" code="ENT" items={stats?.topImpersonatedEntities ?? []} />
          <VerdictList items={stats?.verdictBreakdown ?? {}} />
        </div>
      </section>
    </main>
  );
}

function RadarStat({ label, value, sub, tone }: { label: string; value?: number; sub: string; tone?: string }) {
  return (
    <div className={`radar-stat ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value == null ? "—" : value.toString().padStart(2, "0")}</strong>
      <p>{sub}</p>
    </div>
  );
}

function CampaignCard({ campaign, index }: { campaign: Campaign; index: number }) {
  const entity = campaign.entities.join(" / ") || "Unattributed campaign";
  return (
    <article className={`campaign-card ${campaign.severity}`}>
      <div className="campaign-number">{(index + 1).toString().padStart(2, "0")}</div>
      <div className="campaign-main">
        <div className="campaign-title">
          <div>
            <span className={`tag ${campaign.severity === "confirmed" ? "red" : "orange"}`}>{campaign.severity}</span>
            <h3>{entity}</h3>
          </div>
          <div className="campaign-score">
            <strong>{campaign.maxRiskScore || "—"}</strong>
            <span>MAX RISK</span>
          </div>
        </div>
        <div className="campaign-metrics">
          <Metric label="reports" value={campaign.eventCount} />
          <Metric label="confirmed" value={campaign.confirmedCount} />
          <Metric label="suspected" value={campaign.suspectedCount} />
          <Metric label="shared links" value={campaign.linkingIndicators.length} />
        </div>
        <div className="campaign-indicators">
          <IndicatorLine label="UPI" values={campaign.paymentHandles} />
          <IndicatorLine label="PHONE" values={campaign.phoneNumbers} />
          <IndicatorLine label="DOMAIN" values={campaign.domains} />
          <IndicatorLine label="LINKED BY" values={campaign.linkingIndicators} />
        </div>
      </div>
      <a className="campaign-export" href={apiUrl(`/api/evidence/${campaign.id}`)} target="_blank" rel="noreferrer">
        <span>JSON</span>
        export<br />evidence
        <b>↗</b>
      </a>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{value.toString().padStart(2, "0")}</strong></div>;
}

function IndicatorLine({ label, values }: { label: string; values: string[] }) {
  return <div><span>{label}</span><p>{values.join(" · ") || "—"}</p></div>;
}

function TopList({ title, code, items }: { title: string; code: string; items: Count[] }) {
  return (
    <div className="toplist-panel">
      <div className="panel-header"><strong>{title}</strong><span>{code}</span></div>
      {items.length ? items.slice(0, 6).map((item, i) => (
        <div className="toplist-row" key={item.value}>
          <span>{(i + 1).toString().padStart(2, "0")}</span>
          <strong>{item.value}</strong>
          <b>{item.count}</b>
        </div>
      )) : <div className="empty-state">No indicators observed</div>}
    </div>
  );
}

function VerdictList({ items }: { items: Record<string, number> }) {
  return (
    <div className="toplist-panel">
      <div className="panel-header"><strong>verdict distribution</strong><span>STATE</span></div>
      {Object.keys(items).length ? Object.entries(items).map(([label, count], i) => (
        <div className="toplist-row" key={label}>
          <span>{(i + 1).toString().padStart(2, "0")}</span>
          <strong>{label.replaceAll("_", " ")}</strong>
          <b>{count}</b>
        </div>
      )) : <div className="empty-state">No verdicts recorded</div>}
    </div>
  );
}
