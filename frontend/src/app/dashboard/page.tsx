"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";

interface Count {
  value: string;
  count: number;
}
interface Stats {
  totals: {
    issuers: number;
    signedAssets: number;
    totalVerifications: number;
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
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, c] = await Promise.all([
        fetch(apiUrl("/api/dashboard")).then((r) => r.json()),
        fetch(apiUrl("/api/campaigns")).then((r) => r.json()),
      ]);
      setStats(s);
      setCampaigns(c);
    } catch {
      setError("Cannot reach backend on port 4000.");
    }
  }, []);

  useEffect(() => {
    // Async data fetch on mount + polling subscription (a valid effect use).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-[color:var(--blue)] underline">
          ← Back
        </Link>
        <div className="flex items-center gap-3">
          <a
            href={apiUrl("/api/evidence")}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-[color:var(--navy)] px-3 py-1.5 text-xs font-semibold text-[color:var(--navy)]"
          >
            Export full snapshot
          </a>
          <span className="text-xs text-slate-400">Auto-refreshing every 5s</span>
        </div>
      </div>
      <h1 className="mt-4 text-3xl font-extrabold text-[color:var(--navy)]">
        SupTech Fraud Radar
      </h1>
      <p className="mt-2 text-slate-600">
        Every verification query becomes a sensor. Fraud reports cluster into
        campaigns by shared indicators — entity, UPI handle, phone, domain.
      </p>

      {error && (
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {stats && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat n={stats.totals.signedAssets} label="Signed assets" />
            <Stat n={stats.totals.totalVerifications} label="Verifications" />
            <Stat n={stats.totals.confirmedFraud} label="Confirmed fraud" accent />
            <Stat n={stats.totals.suspectedFraud} label="Suspected" accent />
            <Stat n={stats.totals.campaigns} label="Campaigns" />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-[color:var(--navy)]">
              Transparency log integrity:
            </span>
            {stats.logIntegrity.valid ? (
              <span className="rounded bg-green-100 px-2 py-0.5 font-semibold text-green-800">
                ✓ Intact (tamper-evident hash chain)
              </span>
            ) : (
              <span className="rounded bg-red-100 px-2 py-0.5 font-semibold text-red-800">
                ✗ Broken at #{stats.logIntegrity.brokenAt} ({stats.logIntegrity.reason})
              </span>
            )}
            <span className="text-slate-400">
              · {stats.totals.lowRiskUnverified} low-risk unverified (not counted as fraud)
            </span>
          </div>

          <section className="mt-8">
            <h2 className="text-lg font-bold text-[color:var(--navy)]">
              Active fraud campaigns
            </h2>
            {campaigns.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                No fraud reported yet. Verify some scam messages or a tampered
                document to populate the radar.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {campaigns.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-lg border p-4 ${
                      c.severity === "confirmed"
                        ? "border-red-300 bg-red-50"
                        : "border-orange-300 bg-orange-50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${
                              c.severity === "confirmed"
                                ? "bg-red-200 text-red-900"
                                : "bg-orange-200 text-orange-900"
                            }`}
                          >
                            {c.severity}
                          </span>
                          <span className="font-semibold text-[color:var(--navy)]">
                            {c.entities.join(" / ") || "Unattributed"}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-slate-600">
                          {c.eventCount} report(s) · {c.confirmedCount} confirmed ·{" "}
                          {c.suspectedCount} suspected
                          {c.maxRiskScore > 0 && ` · max risk ${c.maxRiskScore}`}
                        </div>
                      </div>
                      <a
                        href={apiUrl(`/api/evidence/${c.id}`)}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded border border-[color:var(--navy)] px-2.5 py-1 text-xs font-semibold text-[color:var(--navy)]"
                      >
                        Export evidence
                      </a>
                    </div>
                    <div className="mt-2 grid gap-1 text-xs sm:grid-cols-3">
                      <Indicators label="UPI" items={c.paymentHandles} />
                      <Indicators label="Phone" items={c.phoneNumbers} />
                      <Indicators label="Domains" items={c.domains} />
                    </div>
                    {c.linkingIndicators.length > 0 && (
                      <div className="mt-2 text-xs text-slate-500">
                        Linked by shared indicator:{" "}
                        <span className="font-mono">
                          {c.linkingIndicators.join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <TopList title="Top payment handles" items={stats.topPaymentHandles} />
            <TopList title="Top phone numbers" items={stats.topPhoneNumbers} />
            <TopList title="Most impersonated" items={stats.topImpersonatedEntities} />
          </div>

          <section className="mt-8">
            <h2 className="text-lg font-bold text-[color:var(--navy)]">
              Verdict breakdown
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(stats.verdictBreakdown).map(([k, n]) => (
                <span
                  key={k}
                  className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm"
                >
                  <span className="font-semibold capitalize text-[color:var(--navy)]">
                    {k.replace("_", " ")}
                  </span>
                  : {n}
                </span>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ n, label, accent }: { n: number; label: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-3 text-center ${
        accent ? "border-[color:var(--accent)] bg-red-50" : "border-slate-200 bg-white"
      }`}
    >
      <div
        className={`text-2xl font-extrabold ${
          accent ? "text-[color:var(--accent)]" : "text-[color:var(--navy)]"
        }`}
      >
        {n}
      </div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function Indicators({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <span className="font-semibold text-slate-500">{label}: </span>
      <span className="font-mono text-slate-700">{items.join(", ") || "—"}</span>
    </div>
  );
}

function TopList({ title, items }: { title: string; items: Count[] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-sm font-semibold text-[color:var(--navy)]">{title}</div>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">None yet</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {items.map((it) => (
            <li key={it.value} className="flex justify-between text-sm">
              <span className="truncate font-mono text-slate-700">{it.value}</span>
              <span className="ml-2 font-semibold text-[color:var(--accent)]">
                {it.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
