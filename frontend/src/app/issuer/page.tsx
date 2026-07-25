"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/api";

interface Issuer {
  id: string;
  name: string;
  sebiRegNo: string;
  entityClass: string;
  validUpiHandles: string[];
}

interface SignResult {
  assetId: string;
  title: string;
  mediaType: string;
  contentHash: string;
  signature: string;
  manifest: unknown;
  transparencyLog: { seq: number; entryHash: string };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
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

  async function loadIssuers() {
    try {
      const res = await fetch(apiUrl("/api/issuers"));
      const data = (await res.json()) as Issuer[];
      setIssuers(data);
      if (data.length && !issuerId) setIssuerId(data[0].id);
    } catch {
      setError("Cannot reach backend. Is it running on port 4000?");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadIssuers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function seed() {
    setBusy(true);
    try {
      await fetch(apiUrl("/api/seed"), { method: "POST" });
      await loadIssuers();
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
      const res = await fetch(apiUrl("/api/sign"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Signing failed");
      else setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-[color:var(--blue)] underline">
        ← Back
      </Link>
      <h1 className="mt-4 text-3xl font-extrabold text-[color:var(--navy)]">
        Issuer Signing Portal
      </h1>
      <p className="mt-2 text-slate-600">
        Sign an official communication so investors can prove it is genuine.
        Signed with Ed25519, tied to the issuer&apos;s SEBI registration, and
        anchored in the transparency log.
      </p>

      {issuers.length === 0 ? (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            No issuers yet. Load the demo issuers (SEBI, NSE, Reliance) and
            sample signed documents.
          </p>
          <button
            onClick={seed}
            disabled={busy}
            className="mt-3 rounded-lg bg-[color:var(--navy)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Seeding..." : "Seed demo data"}
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <Field label="Issuer">
            <select
              value={issuerId}
              onChange={(e) => setIssuerId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"
            >
              {issuers.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.sebiRegNo})
                </option>
              ))}
            </select>
          </Field>

          <Field label="Title of communication">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Q1 Results Announcement"
              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"
            />
          </Field>

          <div className="flex gap-2">
            <TabButton active={mode === "file"} onClick={() => setMode("file")}>
              Upload file (image / video)
            </TabButton>
            <TabButton active={mode === "text"} onClick={() => setMode("text")}>
              Text communication
            </TabButton>
          </div>

          {mode === "file" ? (
            <input
              type="file"
              accept="image/*,video/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm"
            />
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Paste the official announcement text..."
              className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm"
            />
          )}

          <button
            onClick={sign}
            disabled={busy || !title || (mode === "text" ? !text : !file)}
            className="rounded-lg bg-[color:var(--accent)] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Signing..." : "Sign & register"}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-8 rounded-lg border border-green-300 bg-green-50 p-5">
          <div className="text-lg font-bold text-green-900">
            ✓ Signed & registered
          </div>
          <dl className="mt-3 space-y-2 text-sm">
            <Row k="Title" v={result.title} />
            <Row k="Media type" v={result.mediaType} />
            <Row k="Content hash (SHA-256)" v={result.contentHash} mono />
            <Row k="Signature (Ed25519)" v={`${result.signature.slice(0, 40)}…`} mono />
            <Row
              k="Transparency log"
              v={`seq #${result.transparencyLog.seq} · ${result.transparencyLog.entryHash.slice(0, 24)}…`}
              mono
            />
          </dl>
          <p className="mt-3 text-xs text-green-800">
            Any forwarded copy of this communication can now be verified. Try it
            on the{" "}
            <Link href="/verify" className="underline">
              verifier
            </Link>
            .
          </p>
        </div>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-[color:var(--navy)]">
        {label}
      </span>
      {children}
    </label>
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

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="min-w-40 font-semibold text-slate-500">{k}</dt>
      <dd className={`text-slate-800 ${mono ? "break-all font-mono text-xs" : ""}`}>
        {v}
      </dd>
    </div>
  );
}
