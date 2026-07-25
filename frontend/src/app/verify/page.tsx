"use client";

import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";

interface RiskSignal { label: string; detail: string }
interface Risk {
  riskLevel?: string;
  riskScore?: number;
  impersonatedEntity?: string | null;
  signals?: RiskSignal[];
  paymentHandles?: string[];
  phoneNumbers?: string[];
  urls?: string[];
  summary?: string;
  summaryHindi?: string;
  unavailable?: boolean;
  reason?: string;
}
interface TamperMap { grid: number; changedCells: number; cells: number[] }
interface Match {
  title: string;
  issuerName: string;
  sebiRegNo: string;
  trustLevel: "demo" | "validated";
  registrationSource: string | null;
  signatureValid: boolean;
  publishedAt: string;
  authoritativeUrl: string | null;
  approvedPaymentHandles: string[];
  perceptualDistance: number | null;
  differences?: string[];
  tamperMap?: TamperMap;
  paymentTamper?: { foundPayee: string; approvedPayees: string[] };
}
interface VerifyResult {
  verdict: "original" | "derivative" | "altered" | "invalid_provenance" | "revoked" | "expired" | "unverified";
  mediaType: string;
  match?: Match;
  risk?: Risk;
  message: string;
  contentHash?: string;
}

const SAMPLE = `URGENT! SEBI registered advisor here. Join our VIP WhatsApp group for guaranteed 300% returns. Limited seats! Pay Rs 5000 to 9876543210@paytm and start earning. Download our app: bit.ly/trade-win`;

const VERDICT: Record<string, { label: string; code: string; tone: string; note: string }> = {
  original: { label: "Verified original", code: "V–01", tone: "verified", note: "Exact signed record found" },
  derivative: { label: "Verified copy", code: "V–02", tone: "verified", note: "Forwarded or recompressed copy" },
  altered: { label: "Altered content", code: "A–01", tone: "danger", note: "Matched source, material changes found" },
  invalid_provenance: { label: "Invalid signature", code: "A–02", tone: "danger", note: "Cryptographic proof failed" },
  revoked: { label: "Revoked", code: "A–03", tone: "danger", note: "Issuer withdrew this communication" },
  expired: { label: "Expired", code: "C–01", tone: "caution", note: "Authentic, but no longer current" },
  unverified: { label: "Unverified", code: "U–01", tone: "caution", note: "No official signed record found" },
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function VerifyPage() {
  const [mode, setMode] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function switchMode(next: "text" | "file") {
    setMode(next);
    setResult(null);
    setError(null);
  }

  async function submit() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body: Record<string, unknown> = {};
      if (mode === "text") {
        body.text = text;
        body.mimeType = "text/plain";
      } else if (file) {
        body.content = await fileToBase64(file);
        body.mimeType = file.type || "application/octet-stream";
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(file));
      }
      const response = await fetch(apiUrl("/api/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) setError(data.error || data.detail || "Verification request failed");
      else setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page verifier-page">
      <section className="page-intro">
        <div className="page-intro-index">
          <strong>02</strong>
          <div><span>INVESTOR SURFACE</span><span>DETERMINISTIC → AI</span></div>
        </div>
        <div className="page-intro-copy">
          <p className="eyebrow">INVESTOR VERIFIER / CONTENT INTAKE</p>
          <h1 className="page-title">
            do not trust the styling.
            <span className="muted"> verify the source.</span>
          </h1>
          <p className="page-lede">
            Paste the message you received or upload the forwarded file. PramaanSetu
            checks provenance first, then uses AI only when cryptographic evidence is absent.
          </p>
        </div>
      </section>

      <section className="verifier-workspace">
        <div className="verify-form-column">
          <div className="workspace-heading">
            <span className="micro-label">01 / SELECT INPUT</span>
            <div className="tabs" role="tablist" aria-label="Verification input type">
              <button className={mode === "text" ? "active" : ""} onClick={() => switchMode("text")}>message</button>
              <button className={mode === "file" ? "active" : ""} onClick={() => switchMode("file")}>media / document</button>
            </div>
          </div>

          <div className="intake-zone">
            {mode === "text" ? (
              <>
                <label className="field">
                  <span>Suspicious message</span>
                  <textarea
                    className="form-control intake-textarea"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Paste a WhatsApp message, investment tip, offer, or advisory…"
                  />
                </label>
                <button className="sample-link" onClick={() => setText(SAMPLE)}>
                  <span>↳</span> load a known scam pattern
                </button>
              </>
            ) : (
              <label className="upload-zone">
                <input
                  type="file"
                  accept="image/*,video/*,application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <span className="upload-glyph">⌁</span>
                <strong>{file ? file.name : "drop or select suspicious content"}</strong>
                <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "PNG · JPG · WEBP · MP4 · PDF"}</span>
              </label>
            )}
          </div>

          <div className="intake-actions">
            <div>
              <span className="micro-label">PROCESS</span>
              <p>hash → signature → fingerprint → risk</p>
            </div>
            <button
              className="button primary verify-button"
              onClick={submit}
              disabled={loading || (mode === "text" ? !text.trim() : !file)}
            >
              {loading ? "running verification…" : "run verification"}
              <span>→</span>
            </button>
          </div>
          {error && <div className="error-box">{error}</div>}
        </div>

        <aside className="verify-guide">
          <div className="panel-header">
            <span><strong>decision pipeline</strong></span>
            <div className="panel-dots"><i /><i /><i /></div>
          </div>
          {[
            ["01", "Exact provenance", "SHA–256 lookup and Ed25519 signature validation."],
            ["02", "Forwarded-copy match", "Perceptual comparison tolerant to recompression."],
            ["03", "Tamper localisation", "QR payee and changed-region analysis."],
            ["04", "Unverified risk", "Explainable AI signals; never called genuine."],
          ].map(([n, title, copy]) => (
            <div className="pipeline-step" key={n}>
              <span>{n}</span>
              <div><strong>{title}</strong><p>{copy}</p></div>
            </div>
          ))}
        </aside>
      </section>

      <section className="result-region">
        <div className="result-region-heading">
          <span className="micro-label">02 / VERIFICATION OUTPUT</span>
          <span>{result ? "ANALYSIS COMPLETE" : "AWAITING INPUT"}</span>
        </div>
        {!result ? (
          <div className="result-placeholder">
            <div className="scan-orbit"><i /><i /><i /></div>
            <p>No verdict generated.</p>
            <span>Your cryptographic and risk evidence will appear here.</span>
          </div>
        ) : (
          <VerificationResult result={result} previewUrl={previewUrl} />
        )}
      </section>
    </main>
  );
}

function VerificationResult({ result, previewUrl }: { result: VerifyResult; previewUrl: string | null }) {
  const verdict = VERDICT[result.verdict];
  const risk = result.risk;
  return (
    <div className={`result-console ${verdict.tone}`}>
      <div className="verdict-banner">
        <div className="verdict-code">{verdict.code}</div>
        <div>
          <span>VERDICT</span>
          <h2>{verdict.label}</h2>
          <p>{verdict.note}</p>
        </div>
        {risk?.riskScore != null && (
          <div className="risk-dial">
            <strong>{risk.riskScore}</strong><span>/100 RISK</span>
          </div>
        )}
      </div>

      <div className="verdict-message">{result.message}</div>

      {result.match?.paymentTamper && (
        <div className="payment-alert">
          <div><span>!</span></div>
          <div>
            <strong>PAYMENT REDIRECTION DETECTED</strong>
            <p>
              QR points to <b>{result.match.paymentTamper.foundPayee}</b>. Approved:
              {" "}{result.match.paymentTamper.approvedPayees.join(", ")}.
            </p>
          </div>
        </div>
      )}

      <div className="evidence-grid">
        {result.match && (
          <div className="evidence-panel">
            <div className="panel-header"><strong>provenance record</strong><TrustBadge level={result.match.trustLevel} /></div>
            <dl className="evidence-list">
              <EvidenceRow label="issuer" value={result.match.issuerName} />
              <EvidenceRow label="registration" value={result.match.sebiRegNo} />
              <EvidenceRow label="record" value={result.match.title} />
              <EvidenceRow label="signature" value={result.match.signatureValid ? "VALID / ED25519" : "NOT VALID"} tone={result.match.signatureValid ? "good" : "bad"} />
              {result.match.perceptualDistance != null && <EvidenceRow label="visual delta" value={`${result.match.perceptualDistance} changed cells`} />}
              {result.match.authoritativeUrl && <EvidenceRow label="official source" value={result.match.authoritativeUrl} href />}
            </dl>
          </div>
        )}

        {risk && !risk.unavailable && (
          <div className="evidence-panel">
            <div className="panel-header"><strong>risk intelligence</strong><span className="tag orange">{risk.riskLevel}</span></div>
            <div className="risk-summary">
              <p>{risk.summary}</p>
              {risk.summaryHindi && <p className="hindi">{risk.summaryHindi}</p>}
            </div>
            {risk.impersonatedEntity && <EvidenceRow label="impersonates" value={risk.impersonatedEntity} />}
          </div>
        )}

        {result.match?.tamperMap && result.match.tamperMap.changedCells > 0 && previewUrl && (
          <TamperHeatmap url={previewUrl} tamperMap={result.match.tamperMap} />
        )}
      </div>

      {risk?.signals && risk.signals.length > 0 && (
        <div className="signal-section">
          <div className="panel-header"><strong>observed warning signals</strong><span>{risk.signals.length.toString().padStart(2, "0")} MATCHES</span></div>
          <div className="signal-grid">
            {risk.signals.map((signal, i) => (
              <div key={`${signal.label}-${i}`}>
                <span>{(i + 1).toString().padStart(2, "0")}</span>
                <strong>{signal.label}</strong>
                <p>{signal.detail}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(risk?.paymentHandles?.length || risk?.phoneNumbers?.length || risk?.urls?.length) ? (
        <div className="indicator-bar">
          <Indicators label="UPI" items={risk.paymentHandles} />
          <Indicators label="PHONE" items={risk.phoneNumbers} />
          <Indicators label="LINKS" items={risk.urls} />
        </div>
      ) : null}

      {risk?.unavailable && <div className="error-box">AI risk engine unavailable: {risk.reason}</div>}
    </div>
  );
}

function TrustBadge({ level }: { level: "demo" | "validated" }) {
  return <span className={`tag ${level === "validated" ? "green" : "orange"}`}>{level === "validated" ? "validated issuer" : "demo issuer"}</span>;
}

function EvidenceRow({ label, value, tone, href }: { label: string; value: string; tone?: "good" | "bad"; href?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={tone ?? ""}>
        {href ? <a className="inline-link" href={value} target="_blank" rel="noreferrer">{value}</a> : value}
      </dd>
    </div>
  );
}

function Indicators({ label, items }: { label: string; items?: string[] }) {
  if (!items?.length) return null;
  return <div><span>{label}</span><strong>{items.join(", ")}</strong></div>;
}

function TamperHeatmap({ url, tamperMap }: { url: string; tamperMap: TamperMap }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 520 / image.width);
      canvas.width = image.width * scale;
      canvas.height = image.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const cellW = canvas.width / tamperMap.grid;
      const cellH = canvas.height / tamperMap.grid;
      ctx.fillStyle = "rgba(255,77,79,.48)";
      tamperMap.cells.forEach((changed, i) => {
        if (changed) ctx.fillRect((i % tamperMap.grid) * cellW, Math.floor(i / tamperMap.grid) * cellH, cellW, cellH);
      });
    };
    image.src = url;
  }, [url, tamperMap]);
  return (
    <div className="evidence-panel heatmap-panel">
      <div className="panel-header"><strong>tamper map</strong><span>{tamperMap.changedCells} REGIONS</span></div>
      <div className="heatmap-canvas"><canvas ref={canvasRef} /></div>
    </div>
  );
}
