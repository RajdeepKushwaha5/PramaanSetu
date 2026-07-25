/**
 * Rolling Gemini API key manager (resilience + load distribution).
 *
 * Holds a pool of provisioned API keys and distributes requests across them.
 * When a key returns a rate-limit or auth error it is placed on a short
 * cooldown and traffic fails over to the next healthy key automatically, so a
 * single unhealthy key never sinks a request. In production this pool would be
 * backed by per-key quotas negotiated with the provider.
 *
 * Process-wide singleton (survives across API-route invocations in one server).
 */

import { env } from "../config/env.js";

export interface KeyStat {
  index: number;
  masked: string;
  healthy: boolean;
  cooldownRemainingMs: number;
  requests: number;
  successes: number;
  rateLimits: number;
  errors: number;
  lastUsed: number | null;
}

interface KeySlot {
  key: string;
  index: number;
  cooldownUntil: number; // epoch ms; 0 = available
  requests: number;
  successes: number;
  rateLimits: number;
  errors: number;
  lastUsed: number | null;
}

function mask(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

class GeminiKeyManager {
  private slots: KeySlot[] = [];
  private cursor = 0;
  private cooldownMs: number;

  constructor(keys: string[], cooldownMs: number) {
    this.cooldownMs = cooldownMs;
    this.slots = keys.map((key, index) => ({
      key,
      index,
      cooldownUntil: 0,
      requests: 0,
      successes: 0,
      rateLimits: 0,
      errors: 0,
      lastUsed: null,
    }));
  }

  get size(): number {
    return this.slots.length;
  }

  /**
   * Pick the next usable key via round-robin, skipping any key that is still
   * cooling down. If every key is cooling down, returns the one whose cooldown
   * expires soonest (caller may still try it — better than failing outright).
   */
  acquire(): KeySlot {
    if (this.slots.length === 0) {
      throw new Error("Gemini key pool is empty. Configure GEMINI_API_KEYS.");
    }

    const now = Date.now();
    const n = this.slots.length;

    for (let i = 0; i < n; i++) {
      const slot = this.slots[this.cursor % n];
      this.cursor = (this.cursor + 1) % n;
      if (slot.cooldownUntil <= now) {
        slot.requests += 1;
        slot.lastUsed = now;
        return slot;
      }
    }

    // All keys cooling down: fall back to the soonest-available one.
    const soonest = [...this.slots].sort(
      (a, b) => a.cooldownUntil - b.cooldownUntil,
    )[0];
    soonest.requests += 1;
    soonest.lastUsed = now;
    return soonest;
  }

  reportSuccess(index: number): void {
    const slot = this.slots[index];
    if (slot) slot.successes += 1;
  }

  /** Mark a key as rate-limited and cool it down. */
  reportRateLimit(index: number, cooldownMs?: number): void {
    const slot = this.slots[index];
    if (!slot) return;
    slot.rateLimits += 1;
    slot.cooldownUntil = Date.now() + (cooldownMs ?? this.cooldownMs);
  }

  reportError(index: number): void {
    const slot = this.slots[index];
    if (slot) slot.errors += 1;
  }

  /** True if at least one key is not currently cooling down. */
  hasHealthyKey(): boolean {
    const now = Date.now();
    return this.slots.some((s) => s.cooldownUntil <= now);
  }

  stats(): KeyStat[] {
    const now = Date.now();
    return this.slots.map((s) => ({
      index: s.index,
      masked: mask(s.key),
      healthy: s.cooldownUntil <= now,
      cooldownRemainingMs: Math.max(0, s.cooldownUntil - now),
      requests: s.requests,
      successes: s.successes,
      rateLimits: s.rateLimits,
      errors: s.errors,
      lastUsed: s.lastUsed,
    }));
  }
}

// ---- Singleton wiring (survives hot reloads in dev) ------------------------

declare global {
  // eslint-disable-next-line no-var
  var __geminiKeyManager: GeminiKeyManager | undefined;
}

export function getKeyManager(): GeminiKeyManager {
  if (!globalThis.__geminiKeyManager) {
    globalThis.__geminiKeyManager = new GeminiKeyManager(
      env.geminiKeys,
      env.geminiCooldownMs,
    );
  }
  return globalThis.__geminiKeyManager;
}

export type { GeminiKeyManager };
