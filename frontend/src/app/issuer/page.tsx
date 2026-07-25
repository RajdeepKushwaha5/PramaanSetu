"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";

interface Issuer {
  id: string;
  name: string;
  sebiRegNo: string;
  entityClass: string;
  validUpiHandles: string[];
  trustLevel?: "demo" | "validated";
  registrationSource?: string | null;
}

interface SignResult {
  assetId: string;
  title: string;
  mediaType: string;
  contentHash: string;
  signature: string;
  manifest: {
    publishedAt?: string;
    issuer?: { name?: string; sebiRegNo?: string };
  };
  transparencyLog: { seq: number; entryHash: string };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function IssuerPage() {
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [issuerId, setIssuerId] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"text" | "file">("file");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SignResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadIssuers = useCallback(async () => {
    try {
      const response = await fetch(apiUrl("/api/issuers"));
      if (!response.ok) throw new Error("Issuer registry unavailable");
      const data = (await response.json()) as Issuer[];
      setIssuers(data);
      setIssuerId((current) => current || data[0]?.id || "");
    } catch {
      setError("Cannot reach the signing service.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadIssuers(), 0);
    return () => window.clearTimeout(timer);
  }, [loadIssuers]);

  async function seed() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(apiUrl("/api/seed"), { method: "POST" });
      if (!response.ok) throw new Error("Demo registry could not be seeded");
      await loadIssuers();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sign() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const body: Record<string, unknown> = { issuerId, title };
      if (mode === "text") {
        body.text = text;
        body.mimeType = "text/plain";
      } else if (file) {
        body.content = await fileToBase64(file);
        body.mimeType = file.type || "application/octet-stream";
      }
      const response = await fetch(apiUrl("/api/sign"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Signing failed");
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const selected = issuers.find((issuer) => issuer.id === issuerId);

  return (
    <main className="page issuer-page">
      <section className="page-intro">
        <div className="page-intro-index">
          <strong>01</strong>
          <div><span>ISSUER SURFACE</span><span>PROVENANCE ORIGIN</span></div>
        </div>
        <div className="page-intro-copy">
          <p className="eyebrow">SIGNING RAIL / AUTHENTIC COMMUNICATIONS</p>
          <h1 className="page-title">
            make the genuine
            <span className="muted"> cryptographically obvious.</span>
          </h1>
          <p className="page-lede">
            Register an official communication before distribution. Every record
            is content-bound, issuer-signed, and linked into the transparency chain.
          </p>
        </div>
      </section>

      <section className="signing-workspace">
        <aside className="signing-steps">
          <div className="panel-header">
            <strong>signing protocol</strong>
            <span>04 STEPS</span>
          </div>
          {[
            ["01", "Select issuer", "Choose the identity whose key signs the claim."],
            ["02", "Attach content", "Supply the exact text, document, image, or video."],
            ["03", "Create binding", "Hash content and generate perceptual fingerprints."],
            ["04", "Publish proof", "Sign the manifest and append the registry record."],
          ].map(([n, title, copy], index) => (
            <div className={`signing-step ${index < 2 ? "active" : ""}`} key={n}>
              <span>{n}</span>
              <div><strong>{title}</strong><p>{copy}</p></div>
            </div>
          ))}
          <div className="prototype-notice">
            <span className="tag orange">PROTOTYPE CONTROL</span>
            <p>Production issuers should authenticate with issuer-bound credentials and HSM-held keys.</p>
          </div>
        </aside>

        <div className="signing-form">
          <div className="signing-form-head">
            <div>
              <span className="micro-label">NEW PROVENANCE RECORD</span>
              <h2>sign communication</h2>
            </div>
            <span className="record-status"><i /> DRAFT</span>
          </div>

          {issuers.length === 0 ? (
            <div className="seed-state">
              <div className="seed-glyph">＋</div>
              <h3>No issuer registry loaded</h3>
              <p>Load the isolated SEBI, NSE, and listed-company demo identities.</p>
              <button className="button primary" onClick={seed} disabled={busy}>
                {busy ? "initialising…" : "initialise demo registry"} →
              </button>
            </div>
          ) : (
            <div className="signing-form-body">
              <label className="field">
                <span>01 / issuer identity</span>
                <select className="form-control" value={issuerId} onChange={(e) => setIssuerId(e.target.value)}>
                  {issuers.map((issuer) => (
                    <option key={issuer.id} value={issuer.id}>
                      {issuer.name} / {issuer.sebiRegNo}
                    </option>
                  ))}
                </select>
              </label>

              {selected && (
                <div className="issuer-identity-card">
                  <div className="issuer-monogram">{selected.name.slice(0, 2).toUpperCase()}</div>
                  <div>
                    <strong>{selected.name}</strong>
                    <span>{selected.entityClass.replace("_", " ")} · {selected.sebiRegNo}</span>
                  </div>
                  <span className={`tag ${selected.trustLevel === "validated" ? "green" : "orange"}`}>
                    {selected.trustLevel ?? "demo"}
                  </span>
                </div>
              )}

              <label className="field">
                <span>02 / communication title</span>
                <input
                  className="form-control"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Investor advisory / Q1 results / circular"
                />
              </label>

              <div className="field">
                <span>03 / content payload</span>
                <div className="tabs">
                  <button className={mode === "file" ? "active" : ""} onClick={() => setMode("file")}>media / document</button>
                  <button className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}>text notice</button>
                </div>
              </div>

              {mode === "file" ? (
                <label className="compact-upload">
                  <input type="file" accept="image/*,video/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                  <span>⌁</span>
                  <div>
                    <strong>{file?.name ?? "select content to bind"}</strong>
                    <p>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB · ${file.type || "binary"}` : "PNG · JPG · WEBP · MP4 · PDF"}</p>
                  </div>
                  <b>BROWSE</b>
                </label>
              ) : (
                <textarea
                  className="form-control"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Enter the exact official communication…"
                />
              )}

              <div className="sign-action-row">
                <div>
                  <span className="micro-label">OUTPUT</span>
                  <p>manifest + signature + log receipt</p>
                </div>
                <button
                  className="button primary"
                  onClick={sign}
                  disabled={busy || !issuerId || !title.trim() || (mode === "text" ? !text.trim() : !file)}
                >
                  {busy ? "creating proof…" : "sign & register"} →
                </button>
              </div>
            </div>
          )}
          {error && <div className="error-box signing-error">{error}</div>}
        </div>
      </section>

      <section className="receipt-region">
        <div className="result-region-heading">
          <span className="micro-label">SIGNED RECORD / RECEIPT</span>
          <span>{result ? "COMMITTED" : "NO RECORD YET"}</span>
        </div>
        {result ? <SigningReceipt result={result} selected={selected} /> : (
          <div className="receipt-empty">
            <span>manifest://awaiting-content</span>
            <p>The cryptographic receipt will appear after signing.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function SigningReceipt({ result, selected }: { result: SignResult; selected?: Issuer }) {
  return (
    <div className="signing-receipt">
      <div className="receipt-success">
        <div className="receipt-check">✓</div>
        <div>
          <span>PROVENANCE COMMITTED</span>
          <h2>{result.title}</h2>
          <p>Content can now be matched against this issuer-signed record.</p>
        </div>
        <Link href="/verify" className="button">verify a copy →</Link>
      </div>
      <dl>
        <ReceiptRow label="asset id" value={result.assetId} />
        <ReceiptRow label="issuer" value={selected?.name ?? result.manifest.issuer?.name ?? "—"} />
        <ReceiptRow label="media type" value={result.mediaType.toUpperCase()} />
        <ReceiptRow label="content hash" value={result.contentHash} />
        <ReceiptRow label="ed25519 signature" value={result.signature} />
        <ReceiptRow label="transparency log" value={`SEQ ${result.transparencyLog.seq.toString().padStart(4, "0")} / ${result.transparencyLog.entryHash}`} />
      </dl>
    </div>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}
