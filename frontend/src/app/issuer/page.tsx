"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiUrl } from "@/lib/api";
import { RoleSurfaceNotice, useRole } from "@/components/role";

type Handoff =
  | { kind: "text"; text: string }
  | { kind: "file"; content: string; mimeType: string; name: string };

const MAX_UPLOAD_MB = 20; // matches the verifier; stays under the 40 MB JSON body

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
    contentHash?: string;
    issuer?: { name?: string; sebiRegNo?: string };
    [k: string]: unknown;
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
  const { role } = useRole();
  const router = useRouter();
  const [issuers, setIssuers] = useState<Issuer[]>([]);
  const [issuerId, setIssuerId] = useState("");
  const [issuerKey, setIssuerKey] = useState("");
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<"text" | "file">("file");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SignResult | null>(null);

  // Signing/revocation finish in a few ms; hold the busy state briefly so the
  // step is visible on camera before the receipt appears. Presentational only.
  const MIN_SPIN_MS = 850;
  const holdFor = async (startedAt: number) => {
    const remaining = MIN_SPIN_MS - (Date.now() - startedAt);
    if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));
  };
  const [signedPayload, setSignedPayload] = useState<Handoff | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validate file size before accepting (the signing rail lacked this guard).
  function pickFile(f: File | null) {
    setError(null);
    if (f && f.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`File is ${(f.size / 1024 / 1024).toFixed(1)} MB - the limit is ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    setFile(f);
  }

  // Download a self-contained proof bundle (manifest + signature + issuer public
  // key + content) that anyone can verify OFFLINE with `npm run verify:record`,
  // without trusting this server's verdict.
  async function downloadProofBundle() {
    if (!result || !signedPayload) return;
    try {
      const kr = await fetch(apiUrl(`/api/issuers/${issuerId}/key`));
      if (!kr.ok) throw new Error("Could not fetch the issuer public key.");
      const key = await kr.json();
      const content =
        signedPayload.kind === "text"
          ? { encoding: "utf8", value: signedPayload.text }
          : { encoding: "base64", value: signedPayload.content };
      const bundle = {
        format: "pramaansetu-proof-bundle/1.0",
        note: "Independently verifiable offline: `npm run verify:record -- <this-file>` - no PramaanSetu server required.",
        manifest: result.manifest,
        signature: result.signature,
        signatureAlgorithm: "Ed25519",
        issuer: { publicKey: key.publicKey, keyId: key.keyId, name: key.name, sebiRegNo: key.sebiRegNo },
        content,
      };
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `pramaansetu-proof-${result.assetId}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // Carry the just-signed content to the verifier so "verify a copy" actually
  // re-verifies it instead of opening an empty form.
  function verifyCopy() {
    if (signedPayload) {
      window.sessionStorage.setItem("pramaan-verify-handoff", JSON.stringify(signedPayload));
    }
    router.push("/verify");
  }

  async function revoke() {
    if (!result) return;
    const t0 = Date.now();
    setBusy(true);
    setError(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (issuerKey.trim()) headers["x-issuer-key"] = issuerKey.trim();
      const response = await fetch(apiUrl("/api/revoke"), {
        method: "POST",
        headers,
        body: JSON.stringify({ assetId: result.assetId, revoked: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Revocation failed");
      await holdFor(t0);
      setRevoked(true);
      setIssuerKey("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

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
    const t0 = Date.now();
    setBusy(true);
    setError(null);
    setResult(null);
    setRevoked(false);
    try {
      const body: Record<string, unknown> = { issuerId, title };
      let handoff: Handoff | null = null;
      if (mode === "text") {
        body.text = text;
        body.mimeType = "text/plain";
        handoff = { kind: "text", text };
      } else if (file) {
        const content = await fileToBase64(file);
        const mimeType = file.type || "application/octet-stream";
        body.content = content;
        body.mimeType = mimeType;
        handoff = { kind: "file", content, mimeType, name: file.name };
      }
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (issuerKey.trim()) headers["x-issuer-key"] = issuerKey.trim();

      const response = await fetch(apiUrl("/api/sign"), {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Signing failed");
      await holdFor(t0);
      setResult(data);
      setSignedPayload(handoff);
      setIssuerKey(""); // don't retain the signing key in memory after use
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const selected = issuers.find((issuer) => issuer.id === issuerId);
  const canOperate = role === "issuer";

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

      <RoleSurfaceNotice surface="issuer" title="Issuer controls are protected">
        Signing, registry seeding, and revocation are issuer operations. Switch to Issuer mode to create or withdraw official provenance records.
      </RoleSurfaceNotice>

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
          ].map(([n, title, copy], index) => {
            // Reflect real progress: content ready (2) -> signing (3) -> done (4).
            const phase = result ? 4 : busy ? 3 : (mode === "text" ? text.trim() : file) ? 2 : 1;
            return (
              <div className={`signing-step ${index < phase ? "active" : ""} ${index < phase - 1 || result ? "done" : ""}`} key={n}>
                <span>{n}</span>
                <div><strong>{title}</strong><p>{copy}</p></div>
              </div>
            );
          })}
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
            <span className={`record-status ${result ? "committed" : busy ? "signing" : ""}`}>
              <i /> {result ? (revoked ? "REVOKED" : "COMMITTED") : busy ? "SIGNING…" : "DRAFT"}
            </span>
          </div>

          {issuers.length === 0 ? (
            <div className="seed-state">
              <div className="seed-glyph">＋</div>
              <h3>No issuer registry loaded</h3>
              <p>Load the isolated SEBI, NSE, and listed-company demo identities.</p>
              <button className="button primary" onClick={seed} disabled={!canOperate || busy}>
                {busy ? "initialising…" : canOperate ? "initialise demo registry" : "switch to issuer to initialise"} →
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

              <label className="field credential-field">
                <span>issuer signing key / optional for local demo issuers</span>
                <input
                  className="form-control"
                  type="password"
                  autoComplete="off"
                  value={issuerKey}
                  onChange={(e) => setIssuerKey(e.target.value)}
                  placeholder="psk_••••••••••••••••"
                />
                <small>Required for production issuers. The key is sent only with this signing request.</small>
              </label>

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
                  <input type="file" accept="image/*,video/*,audio/*,application/pdf" onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
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
                  disabled={!canOperate || busy || !issuerId || !title.trim() || (mode === "text" ? !text.trim() : !file)}
                >
                  {busy ? "creating proof…" : canOperate ? "sign & register" : "issuer mode required"} →
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
        {result ? (
          <SigningReceipt result={result} selected={selected} revoked={revoked} onRevoke={revoke} onVerifyCopy={verifyCopy} onDownloadBundle={downloadProofBundle} busy={busy} canOperate={canOperate} />
        ) : (
          <div className="receipt-empty">
            <span>manifest://awaiting-content</span>
            <p>The cryptographic receipt will appear after signing.</p>
          </div>
        )}
      </section>
    </main>
  );
}

function SigningReceipt({ result, selected, revoked, onRevoke, onVerifyCopy, onDownloadBundle, busy, canOperate }: { result: SignResult; selected?: Issuer; revoked: boolean; onRevoke: () => void; onVerifyCopy: () => void; onDownloadBundle: () => void; busy: boolean; canOperate: boolean }) {
  return (
    <div className={`signing-receipt ${revoked ? "is-revoked" : ""}`}>
      <div className="receipt-success">
        <div className="receipt-check">{revoked ? "⦸" : "✓"}</div>
        <div>
          <span>{revoked ? "PROVENANCE REVOKED" : "PROVENANCE COMMITTED"}</span>
          <h2>{result.title}</h2>
          <p>
            {revoked
              ? "This record is revoked. Verifying this content now returns REVOKED."
              : "Content can now be matched against this issuer-signed record."}
          </p>
        </div>
        <div className="receipt-actions">
          <button type="button" className="button" onClick={onVerifyCopy}>verify a copy →</button>
          <button type="button" className="button" onClick={onDownloadBundle} title="Self-contained proof, verifiable offline with npm run verify:record">download proof bundle ↓</button>
          {!revoked && (
            <button type="button" className="button danger" onClick={onRevoke} disabled={!canOperate || busy}>
              {busy ? "revoking…" : canOperate ? "revoke record" : "issuer mode required"}
            </button>
          )}
        </div>
      </div>
      <dl>
        <ReceiptRow label="asset id" value={result.assetId} />
        <ReceiptRow label="issuer" value={result.manifest.issuer?.name ?? selected?.name ?? "-"} />
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
