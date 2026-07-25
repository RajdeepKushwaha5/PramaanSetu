import Link from "next/link";
import { apiUrl, API_BASE } from "@/lib/api";

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="mb-14">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-[color:var(--blue)]">
          SEBI Securities Market TechSprint 2026
        </div>
        <h1 className="mt-3 text-5xl font-extrabold text-[color:var(--navy)]">
          Pramaan<span className="text-[color:var(--accent)]">Setu</span>
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-slate-600">
          The cryptographic trust layer for India&apos;s securities market
          communications. Make every official message provable, and every
          impersonation instantly detectable.
        </p>
      </header>

      <section className="grid gap-5 sm:grid-cols-3">
        <PortalCard
          href="/issuer"
          step="Layer 1"
          title="Issuer Signing"
          desc="SEBI, exchanges and companies sign official communications so they can be proven genuine."
        />
        <PortalCard
          href="/verify"
          step="Layer 2"
          title="Investor Verifier"
          desc="Forward any suspicious video, PDF or message and get a clear verdict in seconds."
          primary
        />
        <PortalCard
          href="/dashboard"
          step="Layer 3"
          title="SupTech Radar"
          desc="Fraud reports cluster into live campaigns for SEBI and the exchanges to act on."
        />
      </section>

      <section className="mt-14 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-lg font-bold text-[color:var(--navy)]">
          System status
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Check the Gemini key pool and rotation on the backend at{" "}
          <a
            href={apiUrl("/api/health")}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[color:var(--blue)] underline"
          >
            {API_BASE}/api/health
          </a>
          . Add your free keys to the backend&apos;s <code>.env</code> to
          activate the AI risk engine.
        </p>
      </section>
    </main>
  );
}

function PortalCard({
  href,
  step,
  title,
  desc,
  primary,
}: {
  href: string;
  step: string;
  title: string;
  desc: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group block rounded-xl border p-5 transition hover:-translate-y-0.5 hover:shadow-lg ${
        primary
          ? "border-[color:var(--accent)] bg-white"
          : "border-slate-200 bg-white"
      }`}
    >
      <div className="text-xs font-semibold uppercase tracking-wider text-[color:var(--blue)]">
        {step}
      </div>
      <div className="mt-1 text-xl font-bold text-[color:var(--navy)]">
        {title}
      </div>
      <p className="mt-2 text-sm text-slate-600">{desc}</p>
      <div className="mt-4 text-sm font-semibold text-[color:var(--accent)] group-hover:underline">
        Open →
      </div>
    </Link>
  );
}
