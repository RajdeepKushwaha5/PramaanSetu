"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { apiUrl } from "@/lib/api";

interface RiskSignal {
  label: string;
  detail: string;
}
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
interface TamperMap {
  grid: number;
  changedCells: number;
  cells: number[];
}
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
  verdict:
    | "original"
    | "derivative"
    | "altered"
    | "invalid_provenance"
    | "revoked"
    | "expired"
    | "unverified";
  mediaType: string;
  match?: Match;
  risk?: Risk;
  message: string;
}

const SAMPLE = `URGENT! SEBI registered advisor here. Join our VIP WhatsApp group for guaranteed 300% returns. Limited seats! Pay Rs 5000 to 9876543210@paytm and start earning. Download our app: bit.ly/trade-win`;

const VERDICT: Record<string, { label: string; cls: string; icon: string }> = {
  original: { label: "Verified Original", cls: "bg-green-100 border-green-400 text-green-900", icon: "✓" },
  derivative: { label: "Verified Copy", cls: "bg-green-50 border-green-300 text-green-800", icon: "✓" },
  altered: { label: "Altered — Do Not Trust", cls: "bg-orange-100 border-orange-400 text-orange-900", icon: "▲" },
  invalid_provenance: { label: "Invalid Signature", cls: "bg-red-100 border-red-500 text-red-900", icon: "✗" },
  revoked: { label: "Revoked", cls: "bg-red-100 border-red-400 text-red-900", icon: "✗" },
  expired: { label: "Expired", cls: "bg-amber-100 border-amber-400 text-amber-900", icon: "▲" },
  unverified: { label: "Unverified", cls: "bg-red-50 border-red-300 text-red-900", icon: "✗" },
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve((r.result as string).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
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
        setPreviewUrl(URL.createObjectURL(file));
      }
      const res = await fetch(apiUrl("/api/verify"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || data.detail || "Request failed");
      else setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const v = result ? VERDICT[result.verdict] : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-[color:var(--blue)] underline">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-extrabold text-[color:var(--navy)]">
        Investor Verifier
      </h1>
      <p className="mt-2 text-slate-600">
        Forward any suspicious message or upload a document / image. We check it
        against signed official records first, then run AI risk analysis only if
        it is unverified.
      </p>

      <div className="mt-6 flex gap-2">
        <TabButton active={mode === "text"} onClick={() => setMode("text")}>
          Paste message
        </TabButton>
        <TabButton active={mode === "file"} onClick={() => setMode("file")}>
          Upload image / document
        </TabButton>
      </div>

      <div className="mt-4">
        {mode === "text" ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder="Paste a suspicious WhatsApp / Telegram message..."
            className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm"
          />
        ) : (
          <input
            type="file"
            accept="image/*,video/*,application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"
          />
        )}
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={submit}
            disabled={loading || (mode === "text" ? !text.trim() : !file)}
            className="rounded-lg bg-[color:var(--navy)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {loading ? "Checking..." : "Verify this"}
          </button>
          {mode === "text" && (
            <button
              onClick={() => setText(SAMPLE)}
              className="text-sm text-[color:var(--blue)] underline"
            >
              Load a sample scam
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && v && (
        <div className="mt-8 space-y-4">
          <div className={`rounded-lg border-2 p-5 ${v.cls}`}>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-black">{v.icon}</span>
              <span className="text-2xl font-extrabold">{v.label}</span>
            </div>
            <p className="mt-2 text-sm">{result.message}</p>
          </div>

          {/* Payment redirection — the headline fraud signal */}
          {result.match?.paymentTamper && (
            <div className="rounded-lg border-2 border-red-500 bg-red-50 p-4">
              <div className="text-sm font-bold uppercase tracking-wide text-red-700">
                Payment redirection detected
              </div>
              <p className="mt-1 text-sm text-red-900">
                The payment QR now points to{" "}
                <span className="font-mono font-bold">
                  {result.match.paymentTamper.foundPayee}
                </span>
                , which is not an approved handle. Approved:{" "}
                <span className="font-mono">
                  {result.match.paymentTamper.approvedPayees.join(", ")}
                </span>
                .
              </p>
            </div>
          )}

          {/* Tamper heatmap over the uploaded image */}
          {result.match?.tamperMap &&
            result.match.tamperMap.changedCells > 0 &&
            previewUrl && (
              <TamperHeatmap url={previewUrl} tamperMap={result.match.tamperMap} />
            )}

          {result.match && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[color:var(--navy)]">
                  Provenance match
                </span>
                <TrustBadge level={result.match.trustLevel} />
              </div>
              <dl className="mt-2 space-y-1">
                <Row k="Issuer" v={result.match.issuerName} />
                <Row k="SEBI reg. no." v={result.match.sebiRegNo} />
                <Row k="Original title" v={result.match.title} />
                <Row
                  k="Signature"
                  v={result.match.signatureValid ? "Valid (Ed25519)" : "NOT valid"}
                />
                {result.match.registrationSource && (
                  <Row k="Registration source" v={result.match.registrationSource} link />
                )}
                {result.match.authoritativeUrl && (
                  <Row k="Official source" v={result.match.authoritativeUrl} link />
                )}
                {result.match.approvedPaymentHandles.length > 0 && (
                  <Row
                    k="Approved payment"
                    v={result.match.approvedPaymentHandles.join(", ")}
                  />
                )}
              </dl>
              {result.match.differences && (
                <ul className="mt-3 list-disc pl-5 text-orange-800">
                  {result.match.differences.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result.risk && !result.risk.unavailable && <RiskCard risk={result.risk} />}
          {result.risk?.unavailable && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              AI risk engine unavailable: {result.risk.reason}
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function TrustBadge({ level }: { level: "demo" | "validated" }) {
  if (level === "validated") {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
        Validated issuer
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
      Demo issuer (identity not externally validated)
    </span>
  );
}

function TamperHeatmap({ url, tamperMap }: { url: string; tamperMap: TamperMap }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const img = new Image();
    img.onload = () => {
      const maxW = 420;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const g = tamperMap.grid;
      const cw = canvas.width / g;
      const ch = canvas.height / g;
      ctx.fillStyle = "rgba(220,20,60,0.45)";
      for (let i = 0; i < tamperMap.cells.length; i++) {
        if (tamperMap.cells[i]) {
          const cx = (i % g) * cw;
          const cy = Math.floor(i / g) * ch;
          ctx.fillRect(cx, cy, cw, ch);
        }
      }
    };
    img.src = url;
  }, [url, tamperMap]);
  return (
    <div className="rounded-lg border border-orange-300 bg-white p-4">
      <div className="text-sm font-semibold text-[color:var(--navy)]">
        Tamper heatmap — {tamperMap.changedCells} regions changed vs the genuine original
      </div>
      <canvas ref={canvasRef} className="mt-2 rounded border border-slate-200" />
    </div>
  );
}

function RiskCard({ risk }: { risk: Risk }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-lg border border-red-300 bg-red-50 p-4">
        <div>
          <div className="text-xs font-semibold uppercase text-red-700">AI risk level</div>
          <div className="text-2xl font-extrabold capitalize text-red-900">
            {risk.riskLevel}
          </div>
        </div>
        <div className="text-right text-red-900">
          <div className="text-3xl font-extrabold">{risk.riskScore}</div>
          <div className="text-xs">/ 100</div>
        </div>
      </div>

      {risk.impersonatedEntity && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <span className="font-semibold text-[color:var(--navy)]">
            Appears to impersonate:{" "}
          </span>
          {risk.impersonatedEntity}
        </div>
      )}

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-sm font-semibold text-[color:var(--navy)]">
          Why this looks risky
        </div>
        <p className="mt-1 text-sm text-slate-700">{risk.summary}</p>
        {risk.summaryHindi && (
          <p className="mt-2 text-sm text-slate-500">{risk.summaryHindi}</p>
        )}
      </div>

      {risk.signals && risk.signals.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-sm font-semibold text-[color:var(--navy)]">
            Warning signals
          </div>
          <ul className="mt-2 space-y-2">
            {risk.signals.map((s, i) => (
              <li key={i} className="text-sm">
                <span className="font-semibold text-[color:var(--accent)]">
                  {s.label}:
                </span>{" "}
                <span className="text-slate-700">{s.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Extracted label="Payment handles" items={risk.paymentHandles} />
      <Extracted label="Phone numbers" items={risk.phoneNumbers} />
      <Extracted label="Links" items={risk.urls} />

      <p className="text-xs text-slate-400">
        &quot;Unverified&quot; does not prove content is fake, but no official
        signed record was found. Never pay based on unverified messages.
      </p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
        active
          ? "border-[color:var(--navy)] bg-[color:var(--navy)] text-white"
          : "border-slate-300 bg-white text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

function Row({ k, v, link }: { k: string; v: string; link?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="min-w-36 font-semibold text-slate-500">{k}</dt>
      <dd className="break-all text-slate-800">
        {link ? (
          <a href={v} target="_blank" rel="noreferrer" className="text-[color:var(--blue)] underline">
            {v}
          </a>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}

function Extracted({ label, items }: { label: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
      <span className="font-semibold text-[color:var(--navy)]">{label}: </span>
      <span className="font-mono text-slate-700">{items.join(", ")}</span>
    </div>
  );
}
