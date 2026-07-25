import Link from "next/link";

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
              <span><strong>trust topology</strong> / live model</span>
              <div className="panel-dots"><i /><i /><i /></div>
            </div>
            <TrustTopology />
            <div className="architecture-foot">
              <div>
                <span>VERDICT MODEL</span>
                <strong>06 STATES</strong>
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
        <p>
          <span>one forwarded file.</span> three lines of defence.
          <br />
          provenance → tamper detection → campaign intelligence.
        </p>
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

function TrustTopology() {
  const nodes = [
    { x: 280, y: 45, label: "issuer" },
    { x: 438, y: 115, label: "registry" },
    { x: 468, y: 272, label: "investor" },
    { x: 356, y: 390, label: "radar" },
    { x: 190, y: 390, label: "evidence" },
    { x: 78, y: 272, label: "verifier" },
    { x: 108, y: 115, label: "content" },
  ];
  const edges = nodes.flatMap((a, i) =>
    nodes.slice(i + 1).map((b) => ({ a, b, key: `${i}-${b.label}` })),
  );
  return (
    <svg
      className="trust-topology"
      viewBox="0 0 550 440"
      role="img"
      aria-label="PramaanSetu trust topology connecting issuers, content, verification, evidence, radar, investors and registry"
    >
      <g className="topology-lines">
        {edges.map(({ a, b, key }) => (
          <line key={key} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        ))}
      </g>
      <circle className="orbit" cx="273" cy="228" r="184" />
      <circle className="core-ring" cx="273" cy="228" r="42" />
      <circle className="core" cx="273" cy="228" r="8" />
      <text className="core-label" x="273" y="220">PRAMAAN</text>
      <text className="core-sub" x="273" y="250">TRUST CORE</text>
      {nodes.map((node, i) => (
        <g key={node.label}>
          <circle className={i === 2 ? "topology-node active" : "topology-node"} cx={node.x} cy={node.y} r="13" />
          <circle className="topology-node-dot" cx={node.x} cy={node.y} r="4" />
          <text
            className="topology-label"
            x={node.x}
            y={node.y + (node.y < 100 ? -24 : 31)}
          >
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
