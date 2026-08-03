"use client";

import Link from "next/link";
import { TrustTopology } from "@/components/trust-topology";
import { ROLE_META, useRole, type Role } from "@/components/role";

const LAYERS = [
  {
    n: "01",
    label: "SIGN",
    title: "Issuer signing rail",
    copy: "Official communications are bound to a registered demo issuer identity, content hash, and tamper-evident registry entry.",
    href: "/issuer",
    action: "Open signing console",
  },
  {
    n: "02",
    label: "VERIFY",
    title: "Investor verifier",
    copy: "Check forwarded messages, circulars, screenshots, and media against signed records before you trust or pay.",
    href: "/verify",
    action: "Verify suspicious content",
  },
  {
    n: "03",
    label: "RESPOND",
    title: "SupTech fraud radar",
    copy: "Correlate payment handles, phone numbers, domains, and impersonated entities into regulator-ready campaigns.",
    href: "/dashboard",
    action: "View live intelligence",
  },
];

const HOME_COPY: Record<Role, {
  eyebrow: string;
  title: string;
  muted: string;
  lede: string;
  primary: string;
  secondary: string;
  secondaryHref: string;
}> = {
  investor: {
    eyebrow: "INVESTOR MODE / CONTENT INTAKE",
    title: "verify the source.",
    muted: "before you trust the forward.",
    lede: "Paste a message or upload a forwarded file. PramaanSetu checks official provenance first, then uses AI risk only when cryptographic proof is absent.",
    primary: "open verifier",
    secondary: "see fraud radar",
    secondaryHref: "/dashboard",
  },
  issuer: {
    eyebrow: "ISSUER MODE / SIGNING RAIL",
    title: "publish proof.",
    muted: "before misinformation spreads.",
    lede: "Bind official communications to an issuer identity, content hash, perceptual fingerprint, and tamper-evident registry entry before distribution.",
    primary: "open signing rail",
    secondary: "test verification",
    secondaryHref: "/verify",
  },
  regulator: {
    eyebrow: "REGULATOR MODE / SUPTECH RADAR",
    title: "turn reports.",
    muted: "into supervisory intelligence.",
    lede: "Monitor verified tampering, suspected phishing, synthetic-media signals, and repeated payment or identity indicators across the market.",
    primary: "open radar",
    secondary: "verify content",
    secondaryHref: "/verify",
  },
};

export default function Home() {
  const { role } = useRole();
  const activeRole = role ?? "investor";
  const copy = HOME_COPY[activeRole];
  const primaryHref = ROLE_META[activeRole].surface;
  const layers = [
    ...LAYERS.filter((layer) => layer.href === primaryHref),
    ...LAYERS.filter((layer) => layer.href !== primaryHref),
  ];

  return (
    <main className="page home-page">
      <section className="home-hero">
        <div className="hero-copy">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>
            {copy.title}
            <span>{copy.muted}</span>
          </h1>
          <p className="hero-lede">
            {copy.lede}
          </p>
          <p className="dpi-line">
            <span className="tag blue">DPI</span>
            Public infrastructure for content authenticity — a UPI/Aadhaar-style
            signed-provenance rail SEBI can operate for the securities market.
          </p>
          <div className="hero-actions">
            <Link href={primaryHref} className="button primary">
              {copy.primary} <span>→</span>
            </Link>
            <Link href={copy.secondaryHref} className="button">
              {copy.secondary}
            </Link>
          </div>
          <div className="hero-proofline">
            <span><i className="blue-dot" /> deterministic first</span>
            <span><i /> explainable verdicts</span>
            <span><i /> AI only as fallback</span>
          </div>
          <div className="surface-rail" aria-label="Role surfaces">
            {(Object.keys(HOME_COPY) as Role[]).map((surface) => (
              <Link
                href={ROLE_META[surface].surface}
                className={surface === activeRole ? "active" : ""}
                key={surface}
              >
                <span>{ROLE_META[surface].glyph}</span>
                <strong>{ROLE_META[surface].label}</strong>
                <small>{surface === "investor" ? "verify" : surface === "issuer" ? "sign" : "respond"}</small>
              </Link>
            ))}
          </div>
        </div>

        <div className="hero-visual">
          <div className="panel architecture-panel">
            <div className="panel-header">
              <span><strong>trust flow</strong> / guided scenario</span>
              <div className="panel-dots"><i /><i /><i /></div>
            </div>
            <TrustTopology />
            <div className="architecture-legend">
              <span><i className="blue" /> signed provenance</span>
              <span><i className="orange" /> investor decision</span>
              <span><i /> regulator evidence</span>
            </div>
            <div className="proof-stack" aria-label="Live proof stack">
              <div><span>01</span><strong>hash</strong><p>SHA-256 content binding</p></div>
              <div><span>02</span><strong>sign</strong><p>Ed25519 issuer proof</p></div>
              <div><span>03</span><strong>trace</strong><p>campaign evidence rail</p></div>
            </div>
            <div className="architecture-foot">
              <div>
                <span>VERDICT MODEL</span>
                <strong>07 STATES</strong>
              </div>
              <div>
                <span>CRYPTOGRAPHY</span>
                <strong>ED25519</strong>
              </div>
              <div>
                <span>CONTENT BINDING</span>
                <strong>SHA–256</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="statement-strip">
        <div className="statement-copy">
          <p className="eyebrow">ONE INPUT / THREE DECISIONS</p>
          <h2>From forwarded file<br /><span>to actionable signal.</span></h2>
        </div>
        <div className="defence-flow" aria-label="Three lines of defence">
          <div>
            <span>01</span>
            <strong>Provenance</strong>
            <p>Find the signed source and validate its issuer key.</p>
          </div>
          <i aria-hidden="true">→</i>
          <div>
            <span>02</span>
            <strong>Tamper detection</strong>
            <p>Separate harmless forwarding from a changed claim or payee.</p>
          </div>
          <i aria-hidden="true">→</i>
          <div>
            <span>03</span>
            <strong>Campaign intelligence</strong>
            <p>Link repeated indicators into evidence a regulator can review.</p>
          </div>
        </div>
      </section>

      <section className="layers-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE SYSTEM / END TO END</p>
            <h2>one trust rail.<br /><span>three operational surfaces.</span></h2>
          </div>
          <p>
            Every investor query strengthens the market-wide view without
            weakening the distinction between cryptographic fact and AI risk.
          </p>
        </div>

        <div className="layer-grid">
          {layers.map((layer) => (
            <Link href={layer.href} className={`layer-card ${layer.href === primaryHref ? "role-featured" : ""}`} key={layer.n}>
              <div className="layer-card-top">
                <span>{layer.n}</span>
                <span className="tag blue">{layer.label}</span>
              </div>
              <div>
                <h3>{layer.title}</h3>
                <p>{layer.copy}</p>
              </div>
              <div className="layer-action">
                {layer.action}
                <span>↗</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="system-principles">
        <div className="principle-intro">
          <p className="eyebrow">DESIGN PRINCIPLE</p>
          <h2>Detection guesses.<br /><span>provenance proves.</span></h2>
        </div>
        <div className="principle-table">
          <div>
            <span className="tag">01 / PROVENANCE</span>
            <h3>Is this exact content registered?</h3>
            <p>Content hash, issuer key, validity, revocation, and registry integrity.</p>
          </div>
          <div>
            <span className="tag">02 / PERCEPTUAL</span>
            <h3>Is this a forwarded or altered copy?</h3>
            <p>Recompression-tolerant fingerprints and payment-QR comparison.</p>
          </div>
          <div>
            <span className="tag">03 / RISK</span>
            <h3>What if no official record exists?</h3>
            <p>Explainable phishing analysis, never a false claim of authenticity.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
