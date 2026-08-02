"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  detection?: {
    mediaScanned: number;
    likelySynthetic: number;
    uncertain: number;
    likelyAuthentic: number;
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

type FilterType = "upi" | "phone" | "entity";
interface Filter { type: FilterType; value: string }

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [activeNav, setActiveNav] = useState("campaigns");
  const [filter, setFilter] = useState<Filter | null>(null);

  const campaignsRef = useRef<HTMLDivElement>(null);
  const upiRef = useRef<HTMLDivElement>(null);
  const entitiesRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);

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

  function goTo(id: string, ref: React.RefObject<HTMLDivElement | null>) {
    setActiveNav(id);
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function applyFilter(type: FilterType, value: string) {
    setFilter((prev) => (prev?.type === type && prev.value === value ? null : { type, value }));
    setActiveNav("campaigns");
    campaignsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function matchesFilter(c: Campaign): boolean {
    if (!filter) return true;
    if (filter.type === "upi") return c.paymentHandles.includes(filter.value);
    if (filter.type === "phone") return c.phoneNumbers.includes(filter.value);
    return c.entities.includes(filter.value);
  }

  const visibleCampaigns = campaigns.filter(matchesFilter);

  const NAV: { id: string; icon: string; label: string; count: number; ref: React.RefObject<HTMLDivElement | null> }[] = [
    { id: "campaigns", icon: "◫", label: "Campaigns", count: campaigns.length, ref: campaignsRef },
    { id: "upi", icon: "⌁", label: "UPI handles", count: stats?.topPaymentHandles.length ?? 0, ref: upiRef },
    { id: "entities", icon: "◇", label: "Entities", count: stats?.topImpersonatedEntities.length ?? 0, ref: entitiesRef },
    { id: "phone", icon: "◉", label: "Phone graph", count: stats?.topPhoneNumbers.length ?? 0, ref: phoneRef },
    { id: "evidence", icon: "≡", label: "Evidence", count: stats?.totals.totalVerifications ?? 0, ref: campaignsRef },
  ];

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
            payment handles, phone numbers, and domains. Click any indicator to
            trace every campaign that shares it.
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
        <RadarStat label="SYNTHETIC" value={stats?.detection?.likelySynthetic} sub={`${stats?.detection?.mediaScanned ?? 0} media scanned`} tone="danger" />
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
          {NAV.map((item) => (
            <button
              type="button"
              className={`radar-nav-item ${activeNav === item.id ? "active" : ""}`}
              key={item.id}
              onClick={() => goTo(item.id, item.ref)}
            >
              <span>{item.icon}</span><strong>{item.label}</strong><b>{item.count}</b>
            </button>
          ))}
          <div className="integrity-block">
            <span>TRANSPARENCY CHAIN</span>
            <strong className={stats?.logIntegrity.valid ? "good" : "bad"}>
              {stats?.logIntegrity.valid ? "● INTACT" : "● BROKEN"}
            </strong>
            {!stats?.logIntegrity.valid && <p>{stats?.logIntegrity.reason}</p>}
          </div>
        </aside>

        <div className="campaign-workspace" ref={campaignsRef}>
          <div className="campaign-toolbar">
            <div>
              <span className="micro-label">ACTIVE CAMPAIGNS</span>
              <strong>{visibleCampaigns.length.toString().padStart(2, "0")} / PRIORITY QUEUE</strong>
            </div>
            <div className="toolbar-legend">
              <span><i className="red" /> confirmed</span>
              <span><i className="orange" /> suspected</span>
            </div>
          </div>

          {filter && (
            <div className="filter-banner">
              <span>
                Filtered by {filter.type === "upi" ? "UPI handle" : filter.type === "phone" ? "phone" : "entity"}:
                {" "}<b>{filter.value}</b>
              </span>
              <button type="button" onClick={() => setFilter(null)}>clear ✕</button>
            </div>
          )}

          {visibleCampaigns.length === 0 ? (
            <div className="campaign-empty">
              <div className="radar-scope"><i /><i /><i /></div>
              <strong>{filter ? "NO CAMPAIGNS SHARE THIS INDICATOR" : "NO ACTIVE FRAUD CAMPAIGNS"}</strong>
              <p>{filter ? "Try clearing the filter." : "Verify a scam message or altered document to populate the intelligence graph."}</p>
            </div>
          ) : (
            <div className="campaign-list">
              {visibleCampaigns.map((campaign, index) => (
                <CampaignCard campaign={campaign} index={index} key={campaign.id} onIndicator={applyFilter} filter={filter} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="indicator-section">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">INDICATOR INDEX / OBSERVED</p>
            <h2>campaign infrastructure.<br /><span>click to trace linked campaigns.</span></h2>
          </div>
        </div>
        <div className="indicator-lists">
          <TopList title="payment handles" code="UPI" items={stats?.topPaymentHandles ?? []} onPick={(v) => applyFilter("upi", v)} filter={filter} type="upi" innerRef={upiRef} />
          <TopList title="phone numbers" code="TEL" items={stats?.topPhoneNumbers ?? []} onPick={(v) => applyFilter("phone", v)} filter={filter} type="phone" innerRef={phoneRef} />
          <TopList title="impersonated entities" code="ENT" items={stats?.topImpersonatedEntities ?? []} onPick={(v) => applyFilter("entity", v)} filter={filter} type="entity" innerRef={entitiesRef} />
          <VerdictList items={stats?.verdictBreakdown ?? {}} />
          <DetectionPanel detection={stats?.detection} />
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

function CampaignCard({ campaign, index, onIndicator, filter }: { campaign: Campaign; index: number; onIndicator: (t: FilterType, v: string) => void; filter: Filter | null }) {
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
          <IndicatorLine label="UPI" values={campaign.paymentHandles} onPick={(v) => onIndicator("upi", v)} filter={filter} type="upi" />
          <IndicatorLine label="PHONE" values={campaign.phoneNumbers} onPick={(v) => onIndicator("phone", v)} filter={filter} type="phone" />
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

function IndicatorLine({ label, values, onPick, filter, type }: { label: string; values: string[]; onPick?: (v: string) => void; filter?: Filter | null; type?: FilterType }) {
  if (!values.length) return <div><span>{label}</span><p>—</p></div>;
  return (
    <div>
      <span>{label}</span>
      <p>
        {values.map((v, i) => {
          const active = filter && type && filter.type === type && filter.value === v;
          return (
            <span key={v}>
              {i > 0 && " · "}
              {onPick ? (
                <button type="button" className={`indicator-chip ${active ? "active" : ""}`} onClick={() => onPick(v)}>{v}</button>
              ) : v}
            </span>
          );
        })}
      </p>
    </div>
  );
}

function TopList({ title, code, items, onPick, filter, type, innerRef }: { title: string; code: string; items: Count[]; onPick?: (v: string) => void; filter?: Filter | null; type?: FilterType; innerRef?: React.RefObject<HTMLDivElement | null> }) {
  return (
    <div className="toplist-panel" ref={innerRef}>
      <div className="panel-header"><strong>{title}</strong><span>{code}</span></div>
      {items.length ? items.slice(0, 6).map((item, i) => {
        const active = filter && type && filter.type === type && filter.value === item.value;
        return (
          <button
            type="button"
            className={`toplist-row ${onPick ? "clickable" : ""} ${active ? "active" : ""}`}
            key={item.value}
            onClick={onPick ? () => onPick(item.value) : undefined}
            disabled={!onPick}
          >
            <span>{(i + 1).toString().padStart(2, "0")}</span>
            <strong>{item.value}</strong>
            <b>{item.count}</b>
          </button>
        );
      }) : <div className="empty-state">No indicators observed</div>}
    </div>
  );
}

function DetectionPanel({ detection }: { detection?: Stats["detection"] }) {
  const d = detection ?? { mediaScanned: 0, likelySynthetic: 0, uncertain: 0, likelyAuthentic: 0 };
  const rows: { label: string; value: number; tone: string }[] = [
    { label: "likely synthetic", value: d.likelySynthetic, tone: "bad" },
    { label: "uncertain", value: d.uncertain, tone: "warn" },
    { label: "likely authentic", value: d.likelyAuthentic, tone: "good" },
  ];
  return (
    <div className="toplist-panel">
      <div className="panel-header"><strong>synthetic-media detection</strong><span>MEDIA</span></div>
      {d.mediaScanned === 0 ? (
        <div className="empty-state">No media scanned yet — verify an image, video, or audio file</div>
      ) : (
        <>
          {rows.map((r, i) => (
            <div className="toplist-row static" key={r.label}>
              <span>{(i + 1).toString().padStart(2, "0")}</span>
              <strong className={`detect-${r.tone}`}>{r.label}</strong>
              <b>{r.value}</b>
            </div>
          ))}
          <div className="detect-foot">{d.mediaScanned} unsigned media file{d.mediaScanned === 1 ? "" : "s"} scanned for AI-generation / deepfake artefacts</div>
        </>
      )}
    </div>
  );
}

function VerdictList({ items }: { items: Record<string, number> }) {
  return (
    <div className="toplist-panel">
      <div className="panel-header"><strong>verdict distribution</strong><span>STATE</span></div>
      {Object.keys(items).length ? Object.entries(items).map(([label, count], i) => (
        <div className="toplist-row static" key={label}>
          <span>{(i + 1).toString().padStart(2, "0")}</span>
          <strong>{label.replaceAll("_", " ")}</strong>
          <b>{count}</b>
        </div>
      )) : <div className="empty-state">No verdicts recorded</div>}
    </div>
  );
}
