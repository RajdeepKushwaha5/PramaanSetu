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
              <span><strong>trust flow</strong> / deterministic path</span>
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

function TrustTopology() {
  const nodes = [
    { x: 275, y: 58, label: "issuer", state: "PUBLISH", labelY: 22, stateY: 38 },
    { x: 82, y: 132, label: "content", state: "INPUT", labelY: 162, stateY: 177 },
    { x: 468, y: 132, label: "registry", state: "KNOWN", labelY: 162, stateY: 177 },
    { x: 82, y: 300, label: "verifier", state: "CHECK", labelY: 331, stateY: 346 },
    { x: 468, y: 300, label: "investor", state: "DECIDE", labelY: 331, stateY: 346 },
    { x: 198, y: 400, label: "evidence", state: "EXPORT", labelY: 431, stateY: 446 },
    { x: 352, y: 400, label: "radar", state: "LINK", labelY: 431, stateY: 446 },
  ];
  const paths = [
    { id: "issuer-core", d: "M 275 74 L 275 177", kind: "primary" },
    { id: "content-core", d: "M 98 137 C 165 145 207 178 235 207", kind: "primary" },
    { id: "core-registry", d: "M 315 207 C 354 177 405 143 452 137", kind: "primary" },
    { id: "core-verifier", d: "M 235 242 C 190 257 148 281 98 296", kind: "primary" },
    { id: "verifier-investor", d: "M 98 305 C 205 354 345 354 452 305", kind: "decision" },
    { id: "verifier-evidence", d: "M 91 315 C 115 352 151 383 187 397", kind: "secondary" },
    { id: "evidence-radar", d: "M 214 400 L 336 400", kind: "secondary" },
    { id: "radar-registry", d: "M 364 390 C 426 340 461 237 466 148", kind: "secondary" },
  ];
  return (
    <svg
      className="trust-topology"
      viewBox="0 0 550 460"
      role="img"
      aria-label="Directional PramaanSetu flow from issuer and content through provenance, verification, investor decision, evidence and regulator radar"
    >
      <defs>
        <marker id="flow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" />
        </marker>
      </defs>
      <g className="topology-lines">
        {paths.map((path) => (
          <path
            id={path.id}
            className={path.kind}
            key={path.id}
            d={path.d}
            markerEnd="url(#flow-arrow)"
          />
        ))}
      </g>
      <g className="topology-particles" aria-hidden="true">
        <circle r="3">
          <animateMotion path="M 275 74 L 275 177" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <circle r="3">
          <animateMotion path="M 98 137 C 165 145 207 178 235 207" dur="3s" begin=".5s" repeatCount="indefinite" />
        </circle>
        <circle r="3">
          <animateMotion path="M 315 207 C 354 177 405 143 452 137" dur="2.8s" begin="1s" repeatCount="indefinite" />
        </circle>
        <circle r="3">
          <animateMotion path="M 98 305 C 205 354 345 354 452 305" dur="3.6s" begin=".8s" repeatCount="indefinite" />
        </circle>
        <circle r="3">
          <animateMotion path="M 214 400 L 336 400" dur="2.2s" begin=".2s" repeatCount="indefinite" />
        </circle>
      </g>
      <circle className="orbit orbit-outer" cx="275" cy="225" r="75" />
      <circle className="orbit orbit-inner" cx="275" cy="225" r="57" />
      <circle className="scan-ring" cx="275" cy="225" r="50" />
      <circle className="core-ring" cx="275" cy="225" r="44" />
      <circle className="core" cx="275" cy="225" r="8" />
      <text className="core-label" x="275" y="218">PRAMAAN</text>
      <text className="core-sub" x="275" y="244">TRUST ENGINE</text>
      {nodes.map((node) => (
        <g className="topology-station" key={node.label}>
          <circle className={node.label === "investor" ? "topology-node active" : "topology-node"} cx={node.x} cy={node.y} r="15" />
          <circle className="topology-node-dot" cx={node.x} cy={node.y} r="4" />
          <text className="topology-label" x={node.x} y={node.labelY}>{node.label}</text>
          <text className="topology-node-state" x={node.x} y={node.stateY}>{node.state}</text>
        </g>
      ))}
    </svg>
  );
}
