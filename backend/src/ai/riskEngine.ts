/**
 * AI risk engine.
 *
 * Runs ONLY on unsigned content (content with no provenance match). Produces a
 * risk assessment for a suspected securities-market phishing / impersonation
 * message. Never labels content "safe" - the highest it can say is "low risk,
 * still unverified".
 */

import { generate, parseJsonResponse, type InlineImage } from "./geminiClient.js";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface RiskSignal {
  label: string;
  detail: string;
}

export interface RiskAssessment {
  riskLevel: RiskLevel;
  /** 0-100 */
  riskScore: number;
  impersonatedEntity: string | null;
  signals: RiskSignal[];
  paymentHandles: string[];
  phoneNumbers: string[];
  urls: string[];
  summary: string;
  summaryHindi: string;
}

const SYSTEM_INSTRUCTION = `You are a fraud analyst for India's securities market (SEBI context).
You receive a message, document, or screenshot that could NOT be verified as an
official communication. Assess how likely it is to be an investment scam,
phishing attempt, or impersonation of SEBI / a stock exchange / a listed company
/ a registered broker or adviser.

Look for known scam patterns:
- Guaranteed / unrealistic returns, "sure-shot tips", pump-and-dump language
- Urgency and pressure ("last chance", "join now", "limited seats")
- Requests to move to WhatsApp / Telegram groups
- Payment to personal UPI handles / bank accounts (registered intermediaries use @valid UPI handles)
- Impersonation of well-known people or institutions
- Fake "SEBI registration" claims, forged circular styling
- Links to download private/APK trading apps
- Withdrawal / tax / processing fee traps

Return ONLY valid JSON matching exactly this schema:
{
  "riskLevel": "low" | "medium" | "high" | "critical",
  "riskScore": <integer 0-100>,
  "impersonatedEntity": <string or null>,
  "signals": [{ "label": <short tag>, "detail": <one sentence> }],
  "paymentHandles": [<UPI ids / account refs found>],
  "phoneNumbers": [<phone numbers found>],
  "urls": [<links found>],
  "summary": <2-3 sentence plain-English explanation of the risk>,
  "summaryHindi": <same explanation in simple Hindi>
}

Never claim the content is genuine or "safe". If risk is low, still note it is
unverified. Extract handles/phones/urls accurately for downstream campaign
clustering.`;

export interface RiskInput {
  text?: string;
  image?: InlineImage;
}

export async function assessRisk(input: RiskInput): Promise<
  RiskAssessment & { _meta: { keyIndex: number; attempts: number } }
> {
  const userText = input.text?.trim()
    ? `CONTENT TO ANALYSE:\n"""\n${input.text.trim()}\n"""`
    : "CONTENT TO ANALYSE: (see attached image)";

  const prompt = `${SYSTEM_INSTRUCTION}\n\n${userText}`;

  const result = await generate({
    prompt,
    images: input.image ? [input.image] : undefined,
    json: true,
    temperature: 0.1,
  });

  const parsed = parseJsonResponse<RiskAssessment>(result.text);

  // Defensive normalisation.
  const assessment: RiskAssessment = {
    riskLevel: parsed.riskLevel ?? "medium",
    riskScore: clampScore(parsed.riskScore),
    impersonatedEntity: parsed.impersonatedEntity ?? null,
    signals: Array.isArray(parsed.signals) ? parsed.signals : [],
    paymentHandles: parsed.paymentHandles ?? [],
    phoneNumbers: parsed.phoneNumbers ?? [],
    urls: parsed.urls ?? [],
    summary: parsed.summary ?? "Unable to fully analyse; treat as unverified.",
    summaryHindi: parsed.summaryHindi ?? "",
  };

  return {
    ...assessment,
    _meta: { keyIndex: result.keyIndex, attempts: result.attempts },
  };
}

function clampScore(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(v)) return 50;
  return Math.min(100, Math.max(0, Math.round(v)));
}
