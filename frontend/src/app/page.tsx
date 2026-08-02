import Link from "next/link";
import { TrustTopology } from "@/components/trust-topology";

const LAYERS = [
  {
    n: "01",
    label: "SIGN",
    title: "Issuer signing rail",
    copy: "Official communications are bound to a verified issuer identity, content hash, and tamper-evident registry entry.",
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

export default function Home() {
  return (
    <main className="page home-page">
      <section className="home-hero">
        <div className="hero-copy">
          <p className="eyebrow">AUTHENTICITY INFRASTRUCTURE / INDIA</p>
          <h1>
            prove the source.
            <span>before the scam proves persuasive.</span>
          </h1>
          <p className="hero-lede">
            PramaanSetu is a cryptographic trust layer for securities-market
            communications. It separates what is <b>provably official</b> from
            what merely looks official.
          </p>
          <div className="hero-actions">
            <Link href="/verify" className="button primary">
              verify content <span>→</span>
            </Link>
            <Link href="/dashboard" className="button">
              open fraud radar
            </Link>
          </div>
          <div className="hero-proofline">
            <span><i className="blue-dot" /> deterministic first</span>
            <span><i /> explainable verdicts</span>
            <span><i /> AI only as fallback</span>
          </div>
        </div>

        <div className="hero-visual">
          <div className="panel architecture-panel">
            <div className="panel-header">
              <span><strong>trust flow</strong> / live scenario</span>
              <div className="panel-dots"><i /><i /><i /></div>
            </div>
            <TrustTopology />
            <div className="architecture-legend">
              <span><i className="blue" /> signed provenance</span>
              <span><i className="orange" /> investor decision</span>
              <span><i /> regulator evidence</span>
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
          {LAYERS.map((layer) => (
            <Link href={layer.href} className="layer-card" key={layer.n}>
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
