/**
 * Central environment configuration.
 * Server-only. Never import this into a client component.
 */

function parseKeyList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
}

/**
 * Gemini API keys. Provide one or more; the key manager distributes load across
 * the pool and fails over automatically if a key is rate-limited or unhealthy.
 *
 * In .env set either:
 *   GEMINI_API_KEYS=key1,key2,key3
 * or individual keys:
 *   GEMINI_API_KEY_1=...
 *   GEMINI_API_KEY_2=...
 */
function loadGeminiKeys(): string[] {
  const listed = parseKeyList(process.env.GEMINI_API_KEYS);

  const numbered: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const v = process.env[`GEMINI_API_KEY_${i}`];
    if (v && v.trim()) numbered.push(v.trim());
  }

  const single = process.env.GEMINI_API_KEY?.trim();
  if (single) numbered.push(single);

  // De-duplicate while preserving order.
  return Array.from(new Set([...listed, ...numbered]));
}

export const env = {
  geminiKeys: loadGeminiKeys(),
  geminiModel: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
  // Cooldown (ms) applied to a key after it returns a rate-limit error.
  geminiCooldownMs: Number(process.env.GEMINI_COOLDOWN_MS) || 60_000,
  // Gates issuer creation. If unset, public issuer creation is disabled.
  adminApiKey: process.env.ADMIN_API_KEY?.trim() || "",
  nodeEnv: process.env.NODE_ENV || "development",
};

export function assertGeminiConfigured(): void {
  if (env.geminiKeys.length === 0) {
    throw new Error(
      "No Gemini API keys configured. Set GEMINI_API_KEYS (comma-separated) in .env.local",
    );
  }
}
