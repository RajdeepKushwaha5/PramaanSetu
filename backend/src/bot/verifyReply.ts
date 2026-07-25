/**
 * Turns a verification result into an investor-friendly chat reply.
 *
 * This is the pure, testable core of the messaging-app channel (Telegram now;
 * WhatsApp Business API is the same integration pattern for production). It
 * reuses the exact same verification engine as the web verifier, so a scam
 * forwarded in the chat app gets the identical verdict.
 */

import { verifyContent, type VerifyResult } from "../services/verificationService.js";

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
  lines.push(`${mark} *${HEADER[r.verdict] ?? r.verdict.toUpperCase()}*`);
  lines.push("");
  lines.push(r.message);

  if (r.match) {
    lines.push("");
    lines.push(`Issuer: ${r.match.issuerName} (${r.match.sebiRegNo})`);
    if (SAFE.has(r.verdict)) {
      lines.push(`Signature: ${r.match.signatureValid ? "valid (Ed25519)" : "not valid"}`);
    }
    if (r.match.paymentTamper) {
      lines.push("");
      lines.push(`🚫 PAYMENT REDIRECTION: the QR now pays "${r.match.paymentTamper.foundPayee}"`);
      lines.push(`Approved only: ${r.match.paymentTamper.approvedPayees.join(", ")}`);
      lines.push("Do NOT pay this.");
    }
    if (r.match.authoritativeUrl) {
      lines.push(`Official source: ${r.match.authoritativeUrl}`);
    }
  }

  if (r.risk && !("unavailable" in r.risk)) {
    lines.push("");
    lines.push(`AI risk: ${String(r.risk.riskLevel).toUpperCase()} (${r.risk.riskScore}/100)`);
    if (r.risk.impersonatedEntity) lines.push(`Appears to impersonate: ${r.risk.impersonatedEntity}`);
    if (r.risk.summary) lines.push(r.risk.summary);
    if (r.risk.paymentHandles?.length) lines.push(`Payment handles: ${r.risk.paymentHandles.join(", ")}`);
    if (r.risk.phoneNumbers?.length) lines.push(`Phone numbers: ${r.risk.phoneNumbers.join(", ")}`);
  }

  lines.push("");
  lines.push("_PramaanSetu · verify before you trust or pay_");
  return lines.join("\n");
}

export interface ChatInput {
  text?: string;
  bytes?: Buffer;
  mimeType?: string;
}

/** Verify a chat submission and return the formatted reply text. */
export async function verifyAndFormat(input: ChatInput): Promise<string> {
  const result = await verifyContent({
    mimeType: input.mimeType ?? "text/plain",
    bytes: input.bytes,
    text: input.text,
  });
  return formatVerdict(result);
}
