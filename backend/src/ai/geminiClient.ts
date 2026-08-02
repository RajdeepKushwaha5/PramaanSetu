/**
 * Gemini client wrapper.
 *
 * Wraps @google/genai with the rolling key manager so callers never touch
 * raw keys. On a rate-limit / quota error it cools down the offending key and
 * retries with the next healthy key, up to one full pass over the pool.
 */

import { GoogleGenAI } from "@google/genai";
import { jsonrepair } from "jsonrepair";
import { env } from "../config/env.js";
import { getKeyManager } from "./geminiKeyManager.js";

// Cache one client instance per key so we don't rebuild them each call.
const clientCache = new Map<string, GoogleGenAI>();

function clientFor(apiKey: string): GoogleGenAI {
  let c = clientCache.get(apiKey);
  if (!c) {
    c = new GoogleGenAI({ apiKey });
    clientCache.set(apiKey, c);
  }
  return c;
}

function isRateLimitError(err: unknown): boolean {
  const e = err as { status?: number; code?: number; message?: string };
  const msg = (e?.message || String(err)).toLowerCase();
  return (
    e?.status === 429 ||
    e?.code === 429 ||
    msg.includes("429") ||
    msg.includes("resource_exhausted") ||
    msg.includes("rate limit") ||
    msg.includes("quota")
  );
}

export interface InlineImage {
  /** base64-encoded image bytes (no data: prefix) */
  data: string;
  mimeType: string; // e.g. "image/png", "image/jpeg"
}

export interface GenerateOptions {
  prompt: string;
  images?: InlineImage[];
  /** Inline audio/video clips (same shape as images; e.g. "audio/wav"). */
  media?: InlineImage[];
  /** Ask Gemini to return JSON. */
  json?: boolean;
  model?: string;
  temperature?: number;
}

export interface GenerateResult {
  text: string;
  keyIndex: number;
  attempts: number;
}

// The key manager holds live slots; we only need each slot's key + index here.
type Slot = ReturnType<ReturnType<typeof getKeyManager>["acquire"]>;

export async function generate(
  opts: GenerateOptions,
): Promise<GenerateResult> {
  const km = getKeyManager();
  if (km.size === 0) {
    throw new Error(
      "No Gemini API keys configured. Set GEMINI_API_KEYS in .env.local",
    );
  }

  const model = opts.model || env.geminiModel;
  const maxAttempts = km.size; // one full sweep of the pool
  let lastErr: unknown;

  const parts: Array<{ text: string } | { inlineData: InlineImage }> = [
    { text: opts.prompt },
  ];
  for (const img of opts.images ?? []) {
    parts.push({ inlineData: { data: img.data, mimeType: img.mimeType } });
  }
  for (const m of opts.media ?? []) {
    parts.push({ inlineData: { data: m.data, mimeType: m.mimeType } });
  }

  const LONG_COOLDOWN = 10 * 60_000; // park bad/invalid keys for 10 min

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const slot: Slot = km.acquire();
    try {
      const ai = clientFor(slot.key);
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: {
          temperature: opts.temperature ?? 0.2,
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
        },
      });

      km.reportSuccess(slot.index);
      return {
        text: response.text ?? "",
        keyIndex: slot.index,
        attempts: attempt,
      };
    } catch (err) {
      lastErr = err;
      if (isRateLimitError(err)) {
        km.reportRateLimit(slot.index); // short cooldown, rotate
      } else {
        // Auth/invalid-key or other error: park this key and rotate to the
        // next one so a single bad key can't sink a request.
        km.reportError(slot.index);
        km.reportRateLimit(slot.index, LONG_COOLDOWN);
      }
      // Rotate to the next key and retry.
    }
  }

  throw new Error(
    `All ${km.size} Gemini keys failed. Last error: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

/**
 * Parse a JSON response, tolerating the ways LLMs sometimes wrap or malform it:
 * markdown code fences, surrounding prose, and trailing commas.
 */
export function parseJsonResponse<T>(text: string): T {
  let s = text.trim();

  // Strip markdown code fences.
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }

  // Extract the outermost JSON object/array if surrounded by prose.
  const firstObj = s.indexOf("{");
  const firstArr = s.indexOf("[");
  const start =
    firstArr === -1 ? firstObj : firstObj === -1 ? firstArr : Math.min(firstObj, firstArr);
  const lastObj = s.lastIndexOf("}");
  const lastArr = s.lastIndexOf("]");
  const end = Math.max(lastObj, lastArr);
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }

  // Remove trailing commas before } or ].
  s = s.replace(/,(\s*[}\]])/g, "$1");

  try {
    return JSON.parse(s) as T;
  } catch {
    // Last resort: repair malformed JSON (unescaped newlines/quotes, etc.).
    return JSON.parse(jsonrepair(s)) as T;
  }
}
