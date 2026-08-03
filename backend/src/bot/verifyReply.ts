/**
 * Turns a verification result into an investor-friendly chat reply.
 *
 * This is the pure, testable core of the messaging-app channel (Telegram now;
 * WhatsApp Business API is the same integration pattern for production). It
 * reuses the exact same verification engine as the web verifier, so a scam
 * forwarded in the chat app gets the identical verdict.
 *
 * Output is HTML (Telegram parse_mode: "HTML"); every dynamic value is escaped
 * so attacker-controlled text cannot break formatting or inject links.
 */

import { verifyContent, type VerifyResult } from "../services/verificationService.js";

/** Escape the 3 characters Telegram HTML mode treats as special. */
export function esc(s: unknown): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const HEADER: Record<string, string> = {
  original: "VERIFIED ORIGINAL",
  derivative: "VERIFIED COPY",
  altered: "ALTERED — DO NOT TRUST",
  invalid_provenance: "INVALID SIGNATURE — DO NOT TRUST",
  revoked: "REVOKED — DO NOT ACT ON THIS",
  expired: "EXPIRED — NO LONGER CURRENT",
  unverified: "UNVERIFIED — BE CAUTIOUS",
};

const SAFE = new Set(["original", "derivative"]);

export function formatVerdict(r: VerifyResult): string {
  const lines: string[] = [];
  const mark = SAFE.has(r.verdict) ? "✅" : "⚠️";
  lines.push(`${mark} <b>${esc(HEADER[r.verdict] ?? r.verdict.toUpperCase())}</b>`);
  lines.push("");
  lines.push(esc(r.message));

  if (r.match) {
    lines.push("");
    lines.push(`Issuer: ${esc(r.match.issuerName)} (${esc(r.match.sebiRegNo)})`);
    if (SAFE.has(r.verdict)) {
      lines.push(`Signature: ${r.match.signatureValid ? "valid (Ed25519)" : "not valid"}`);
    }
    if (r.match.paymentTamper) {
      lines.push("");
      lines.push(`🚫 <b>PAYMENT REDIRECTION</b>: the QR now pays "${esc(r.match.paymentTamper.foundPayee)}"`);
      lines.push(`Approved only: ${esc(r.match.paymentTamper.approvedPayees.join(", "))}`);
      lines.push("Do NOT pay this.");
    }
    if (r.match.authoritativeUrl) {
      lines.push(`Official source: ${esc(r.match.authoritativeUrl)}`);
    }
  }

  // Synthetic-media detection (same as the web verifier) for unsigned media.
  const s = r.synthetic;
  if (s && (s.aiAvailable || s.forensicAvailable)) {
    const labelText =
      s.label === "likely-synthetic"
        ? "LIKELY AI-GENERATED / DEEPFAKE"
        : s.label === "uncertain"
          ? "UNCERTAIN — mixed indicators"
          : "no strong synthetic indicators";
    lines.push("");
    lines.push(`🧪 Synthetic-media check: <b>${esc(labelText)}</b> (${esc(s.syntheticScore)}/100)`);
    const topSignal = s.signals?.[0];
    if (topSignal) lines.push(esc(`${topSignal.label} — ${topSignal.detail}`));
    lines.push("<i>Detection is a signal, not proof.</i>");
  }

  if (r.risk && !("unavailable" in r.risk)) {
    lines.push("");
    lines.push(`AI risk: ${esc(String(r.risk.riskLevel).toUpperCase())} (${esc(r.risk.riskScore)}/100)`);
    if (r.risk.impersonatedEntity) lines.push(`Appears to impersonate: ${esc(r.risk.impersonatedEntity)}`);
    if (r.risk.summary) lines.push(esc(r.risk.summary));
    if (r.risk.paymentHandles?.length) lines.push(`Payment handles: ${esc(r.risk.paymentHandles.join(", "))}`);
    if (r.risk.phoneNumbers?.length) lines.push(`Phone numbers: ${esc(r.risk.phoneNumbers.join(", "))}`);
  }

  lines.push("");
  lines.push("<i>PramaanSetu · verify before you trust or pay</i>");
  return lines.join("\n");
}

export interface ChatInput {
  text?: string;
  bytes?: Buffer;
  mimeType?: string;
}

/** Verify a chat submission and return the formatted reply text (HTML). */
export async function verifyAndFormat(input: ChatInput): Promise<string> {
  const result = await verifyContent({
    mimeType: input.mimeType ?? "text/plain",
    bytes: input.bytes,
    text: input.text,
  });
  return formatVerdict(result);
}
