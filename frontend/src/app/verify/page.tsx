"use client";

import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";
import { RoleSurfaceNotice } from "@/components/role";

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
interface DetectionSignal { source: "ai" | "forensic"; label: string; detail: string }
interface Synthetic {
  modality: "image" | "video" | "audio";
  syntheticScore: number;
  label: "likely-authentic" | "uncertain" | "likely-synthetic";
  aiAvailable: boolean;
  forensicAvailable: boolean;
  signals: DetectionSignal[];
  summary: string;
  framesAnalysed?: number;
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
  logSeq?: number;
  logEntryHash?: string | null;
  logIntegrityValid?: boolean;
  revoked?: boolean;
  expired?: boolean;
  differences?: string[];
  tamperMap?: TamperMap;
  paymentTamper?: { foundPayee: string; approvedPayees: string[] };
}
interface VerifyResult {
  verdict: "original" | "derivative" | "altered" | "invalid_provenance" | "revoked" | "expired" | "unverified";
  mediaType: string;
  match?: Match;
  risk?: Risk;
  synthetic?: Synthetic;
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

const SAMPLES: { id: string; key: string; mime: string; name: string; label: string; tone: string }[] = [
  { id: "gi", key: "original_png_expect_original", mime: "image/png", name: "genuine-circular.png", label: "genuine image", tone: "verified" },
  { id: "fi", key: "altered_png_expect_altered", mime: "image/png", name: "forged-circular.png", label: "forged QR · image", tone: "danger" },
  { id: "gp", key: "original_pdf_expect_original", mime: "application/pdf", name: "genuine-circular.pdf", label: "genuine PDF", tone: "verified" },
  { id: "fp", key: "altered_pdf_expect_altered", mime: "application/pdf", name: "forged-circular.pdf", label: "forged QR · PDF", tone: "danger" },
  { id: "gv", key: "original_mp4_expect_original", mime: "video/mp4", name: "genuine-video.mp4", label: "genuine video", tone: "verified" },
  { id: "cv", key: "voiceclone_mp4_expect_altered", mime: "video/mp4", name: "voiceclone-video.mp4", label: "voice-cloned video", tone: "danger" },
  { id: "ga", key: "compressed_m4a_expect_derivative", mime: "audio/mp4", name: "voice-note.m4a", label: "forwarded voice note", tone: "verified" },
];

// Client-side upload guard. Kept below the server's JSON limit accounting for
// base64 inflation (~1.37x): 20 MB -> ~27 MB encoded, well under the 40 MB body.
const MAX_UPLOAD_MB = 20;
const ACCEPTED_PREFIXES = ["image/", "video/", "audio/"];
const ACCEPTED_EXACT = ["application/pdf"];

function fileTypeSupported(file: File): boolean {
  if (ACCEPTED_EXACT.includes(file.type)) return true;
  return ACCEPTED_PREFIXES.some((p) => file.type.startsWith(p));
}

// Some error responses (413 Payload Too Large, 415, proxy pages) are not JSON.
// Parse defensively so the UI never crashes on `response.json()`.
async function readResponse(response: Response): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const ct = response.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return { ok: response.ok, data: (await response.json()) as Record<string, unknown> };
  }
  await response.text().catch(() => "");
  const error =
    response.status === 413
      ? "That file is too large to verify here (server limit ~30 MB). Try a smaller file."
      : `Verification service returned an unexpected response (HTTP ${response.status}).`;
  return { ok: false, data: { error } };
}

function base64ToFile(b64: string, mime: string, name: string): File {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name, { type: mime });
}

export default function VerifyPage() {
  const [mode, setMode] = useState<"text" | "file">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sampleBusy, setSampleBusy] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const demoCache = useRef<Record<string, string> | null>(null);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Validate size/type, then accept the file. Shared by the input and drag-drop.
  function pickFile(f: File | null) {
    setError(null);
    if (!f) { setFile(null); return; }
    if (!fileTypeSupported(f)) {
      setError(`Unsupported file type${f.type ? ` (${f.type})` : ""}. Use an image, video, audio file, or PDF.`);
      return;
    }
    if (f.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`File is ${(f.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_UPLOAD_MB} MB. Try a smaller file.`);
      return;
    }
    setFile(f);
  }

  async function getDemo(): Promise<Record<string, string>> {
    if (!demoCache.current) {
      const r = await fetch(apiUrl("/api/seed"), { method: "POST" });
      const data = await r.json();
      demoCache.current = (data.demoImages ?? {}) as Record<string, string>;
    }
    return demoCache.current ?? {};
  }

  async function runSample(s: (typeof SAMPLES)[number]) {
    setSampleBusy(s.id);
    setError(null);
    setResult(null);
    try {
      const demo = await getDemo();
      const b64 = demo[s.key];
      if (!b64) throw new Error("Demo sample unavailable — is the backend running?");
      const f = base64ToFile(b64, s.mime, s.name);
      setMode("file");
      setFile(f);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(s.mime.startsWith("image/") ? URL.createObjectURL(f) : null);
      const response = await fetch(apiUrl("/api/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: b64, mimeType: s.mime }),
      });
      const { ok, data } = await readResponse(response);
      if (!ok) setError((data.error as string) || "Verification failed");
      else setResult(data as unknown as VerifyResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSampleBusy(null);
    }
  }

  // Verify content handed off from the signing rail ("verify a copy"), or a
  // shareable demo link (/verify?auto=gv) that auto-runs a sample on load.
  async function runHandoff(h: { kind: "text" | "file"; text?: string; content?: string; mimeType?: string; name?: string }) {
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const body: Record<string, unknown> =
        h.kind === "text"
          ? { text: h.text ?? "", mimeType: "text/plain" }
          : { content: h.content ?? "", mimeType: h.mimeType ?? "application/octet-stream" };
      if (h.kind === "text") { setMode("text"); setText(h.text ?? ""); }
      else if (h.content) {
        setMode("file");
        const f = base64ToFile(h.content, h.mimeType ?? "application/octet-stream", h.name ?? "signed-content");
        setFile(f);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl((h.mimeType ?? "").startsWith("image/") ? URL.createObjectURL(f) : null);
      }
      const response = await fetch(apiUrl("/api/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const { ok, data } = await readResponse(response);
      if (!ok) setError((data.error as string) || "Verification failed");
      else setResult(data as unknown as VerifyResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Verify content handed off from the signing rail ("verify a copy"), or a
  // shareable demo link (/verify?auto=gv) that auto-runs a sample on load.
  // Deferred via setTimeout(0) so it syncs from external state, not synchronously.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const raw = window.sessionStorage.getItem("pramaan-verify-handoff");
      if (raw) {
        window.sessionStorage.removeItem("pramaan-verify-handoff");
        try {
          void runHandoff(JSON.parse(raw));
          return;
        } catch {
          /* fall through to auto-sample */
        }
      }
      const id = new URLSearchParams(window.location.search).get("auto");
      const s = id ? SAMPLES.find((x) => x.id === id) : undefined;
      if (s) void runSample(s);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const { ok, data } = await readResponse(response);
      if (!ok) setError((data.error as string) || (data.detail as string) || "Verification request failed");
      else setResult(data as unknown as VerifyResult);
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
          <p className="channel-note">
            <span className="tag blue">TELEGRAM</span>
            The same verifier runs as a Telegram bot — forward a suspicious message,
            image, or PDF in chat and get the identical verdict, where scams actually spread.
          </p>
        </div>
      </section>

      <RoleSurfaceNotice surface="investor" title="Investor verifier surface" soft>
        This is the investor-facing flow. Issuers and regulators can test it, but live verification is designed for people checking forwarded content before acting.
      </RoleSurfaceNotice>

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
              <label
                className={`upload-zone ${dragActive ? "drag-active" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  pickFile(e.dataTransfer.files?.[0] ?? null);
                }}
              >
                <input
                  type="file"
                  accept="image/*,video/*,audio/*,application/pdf"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
                <span className="upload-glyph">⌁</span>
                <strong>{file ? file.name : dragActive ? "release to load file" : "drop or select suspicious content"}</strong>
                <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : `image · video · audio · PDF · max ${MAX_UPLOAD_MB} MB`}</span>
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

          <div className="demo-samples">
            <span className="micro-label">no file? verify a live sample in one click</span>
            <div className="demo-sample-row">
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  className={`demo-sample ${s.tone}`}
                  onClick={() => runSample(s)}
                  disabled={sampleBusy !== null}
                >
                  <i />
                  <span>{sampleBusy === s.id ? "verifying…" : s.label}</span>
                </button>
              ))}
            </div>
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
            ["04", "Synthetic-media detection", "Deepfake / AI-generation check on unsigned media — vision & audio models plus deterministic forensics."],
            ["05", "Unverified phishing risk", "Explainable AI signals; never called genuine."],
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
  const synthetic = result.synthetic;
  const showSynthetic = synthetic && (synthetic.aiAvailable || synthetic.forensicAvailable);
  return (
    <div className={`result-console ${verdict.tone}`}>
      <div className="verdict-banner">
        <div className="verdict-code">{verdict.code}</div>
        <div>
          <span>VERDICT</span>
          <h2>{verdict.label}</h2>
          <p>{verdict.note}</p>
        </div>
        {showSynthetic ? (
          <div className={`risk-dial synth-${synthetic!.label}`}>
            <strong>{synthetic!.syntheticScore}</strong><span>/100 SYNTHETIC</span>
          </div>
        ) : risk?.riskScore != null ? (
          <div className="risk-dial">
            <strong>{risk.riskScore}</strong><span>/100 RISK</span>
          </div>
        ) : null}
      </div>

      <div className="verdict-message">{result.message}</div>

      {result.match && <TrustChain result={result} />}

      {showSynthetic && <SyntheticPanel synthetic={synthetic!} />}

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

      {result.match?.differences && result.match.differences.length > 0 && (
        <div className="tamper-notes">
          <div className="panel-header"><strong>what changed vs the genuine record</strong></div>
          <ul>
            {result.match.differences.map((diff, i) => (
              <li key={i}>{diff}</li>
            ))}
          </ul>
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
              {result.match.registrationSource && <EvidenceRow label="reg. source" value={result.match.registrationSource} href />}
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

function TrustChain({ result }: { result: VerifyResult }) {
  const m = result.match!;
  const status = m.revoked ? "revoked" : m.expired ? "expired" : "active";
  const links = [
    { label: "issuer identity", value: `${m.issuerName} · ${m.sebiRegNo}`, ok: true },
    { label: "content hash", value: `SHA–256 · ${(result.contentHash ?? "").slice(0, 16)}…`, ok: true },
    { label: "issuer signature", value: m.signatureValid ? "Ed25519 · valid" : "Ed25519 · NOT valid", ok: m.signatureValid },
    { label: "transparency log", value: m.logIntegrityValid === false ? "INTEGRITY FAILED" : m.logSeq != null ? `entry #${m.logSeq} · ${(m.logEntryHash ?? "").slice(0, 12)}…` : "—", ok: m.logIntegrityValid !== false },
    { label: "record status", value: status, ok: status === "active" },
    { label: "evidence", value: "tamper-evident registry", ok: true },
  ];
  return (
    <div className="trust-chain">
      <div className="panel-header">
        <strong>cryptographic trust chain</strong>
        <span>PROVENANCE · NOT AI</span>
      </div>
      <div className="chain-steps">
        {links.map((l, i) => (
          <div className={`chain-step ${l.ok ? "ok" : "bad"}`} key={l.label}>
            <span className="chain-idx">{(i + 1).toString().padStart(2, "0")}</span>
            <span className="chain-mark">{l.ok ? "✓" : "✗"}</span>
            <div>
              <strong>{l.label}</strong>
              <p>{l.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const SYNTH_LABEL: Record<Synthetic["label"], { text: string; tone: string }> = {
  "likely-synthetic": { text: "Likely AI-generated / deepfake", tone: "danger" },
  uncertain: { text: "Uncertain — mixed indicators", tone: "caution" },
  "likely-authentic": { text: "No strong synthetic indicators", tone: "verified" },
};

function SyntheticPanel({ synthetic }: { synthetic: Synthetic }) {
  const meta = SYNTH_LABEL[synthetic.label];
  const ai = synthetic.signals.filter((s) => s.source === "ai");
  const forensic = synthetic.signals.filter((s) => s.source === "forensic");
  return (
    <div className={`synth-panel ${meta.tone}`}>
      <div className="panel-header">
        <strong>synthetic-media detection</strong>
        <span>AI + FORENSICS · NO PROVENANCE</span>
      </div>
      <div className="synth-head">
        <div className="synth-gauge">
          <span className="synth-score">{synthetic.syntheticScore}</span>
          <span className="synth-max">/100</span>
        </div>
        <div className="synth-verdict">
          <strong>{meta.text}</strong>
          <p>{synthetic.summary}</p>
          <div className="synth-sources">
            <span className={synthetic.aiAvailable ? "on" : "off"}>vision/audio model {synthetic.aiAvailable ? "✓" : "—"}</span>
            <span className={synthetic.forensicAvailable ? "on" : "off"}>deterministic forensics {synthetic.forensicAvailable ? "✓" : "—"}</span>
            {synthetic.framesAnalysed ? <span className="on">{synthetic.framesAnalysed} frames analysed</span> : null}
          </div>
        </div>
      </div>
      {(ai.length > 0 || forensic.length > 0) && (
        <div className="synth-signals">
          {ai.length > 0 && (
            <div className="synth-col">
              <span className="micro-label">model indicators</span>
              <ul>{ai.map((s, i) => <li key={`ai-${i}`}><b>{s.label}</b> — {s.detail}</li>)}</ul>
            </div>
          )}
          {forensic.length > 0 && (
            <div className="synth-col">
              <span className="micro-label">forensic signals</span>
              <ul>{forensic.map((s, i) => <li key={`f-${i}`}><b>{s.label}</b> — {s.detail}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      <p className="synth-caveat">
        Detection is a probabilistic <b>signal, not proof</b>. A high score means
        likely AI-generated or manipulated; it is never a guarantee, and a low
        score never certifies authenticity. Provenance (a signed record) is the
        only proof of origin.
      </p>
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
