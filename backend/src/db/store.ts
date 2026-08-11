/**
 * JSON-file-backed store.
 *
 * A deliberately simple persistence layer for the prototype: everything is held
 * in memory and flushed to backend/data/db.json on each mutation. The public
 * methods form a repository interface that can later be swapped for PostgreSQL
 * without touching callers.
 */

import { createHash, generateKeyPairSync, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  DbShape,
  Issuer,
  LogEntry,
  SignedAsset,
  VerificationEvent,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Allow tests/benchmarks to isolate their data with PRAMAAN_DB_PATH.
const DB_PATH = process.env.PRAMAAN_DB_PATH
  ? process.env.PRAMAAN_DB_PATH
  : join(__dirname, "..", "..", "data", "db.json");
const DATA_DIR = dirname(DB_PATH);

function emptyDb(): DbShape {
  return { issuers: [], assets: [], log: [], events: [] };
}

class Store {
  private db: DbShape;
  private autoFlush = true;

  constructor() {
    this.db = this.load();
  }

  /** Defer disk writes during bulk loads; pass true to flush once and resume. */
  setAutoFlush(on: boolean): void {
    this.autoFlush = on;
    if (on) this.flush();
  }

  /** Wipe all demo data back to an empty store (demo-mode reset only). */
  reset(): void {
    this.db = emptyDb();
    this.flush();
  }

  private load(): DbShape {
    try {
      if (existsSync(DB_PATH)) {
        return JSON.parse(readFileSync(DB_PATH, "utf8")) as DbShape;
      }
    } catch (e) {
      console.error("Failed to read db.json, starting fresh:", e);
    }
    return emptyDb();
  }

  private flush(): void {
    if (!this.autoFlush) return;
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DB_PATH, JSON.stringify(this.db, null, 2), "utf8");
  }

  // ---- Issuers ----
  addIssuer(input: Omit<Issuer, "id" | "createdAt">): Issuer {
    const issuer: Issuer = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.db.issuers.push(issuer);
    this.flush();
    return issuer;
  }

  getIssuer(id: string): Issuer | undefined {
    return this.db.issuers.find((i) => i.id === id);
  }

  getIssuerBySebiReg(sebiRegNo: string): Issuer | undefined {
    return this.db.issuers.find((i) => i.sebiRegNo === sebiRegNo);
  }

  listIssuers(): Issuer[] {
    return this.db.issuers;
  }

  // ---- Signed assets (registry) ----
  addAsset(input: Omit<SignedAsset, "id">): SignedAsset {
    const asset: SignedAsset = { ...input, id: randomUUID() };
    this.db.assets.push(asset);
    this.flush();
    return asset;
  }

  getAsset(id: string): SignedAsset | undefined {
    return this.db.assets.find((a) => a.id === id);
  }

  getAssetByContentHash(hash: string): SignedAsset | undefined {
    return this.db.assets.find((a) => a.contentHash === hash);
  }

  listAssets(): SignedAsset[] {
    return this.db.assets;
  }

  setRevoked(id: string, revoked: boolean): SignedAsset | undefined {
    const asset = this.getAsset(id);
    if (asset) {
      asset.revoked = revoked;
      this.flush();
    }
    return asset;
  }

  setAssetLogSeq(id: string, seq: number): void {
    const asset = this.getAsset(id);
    if (asset) {
      asset.logSeq = seq;
      this.flush();
    }
  }

  // ---- Transparency log (hash chain) ----
  lastLogHash(): string {
    const last = this.db.log[this.db.log.length - 1];
    return last ? last.entryHash : "GENESIS";
  }

  appendLog(assetId: string, contentHash: string): LogEntry {
    const seq = this.db.log.length;
    const timestamp = new Date().toISOString();
    const prevHash = this.lastLogHash();
    const entryHash = createHash("sha256")
      .update(`${seq}|${timestamp}|${assetId}|${contentHash}|${prevHash}`)
      .digest("hex");
    const entry: LogEntry = {
      seq,
      timestamp,
      assetId,
      contentHash,
      prevHash,
      entryHash,
    };
    this.db.log.push(entry);
    this.flush();
    return entry;
  }

  getLog(): LogEntry[] {
    return this.db.log;
  }

  /**
   * Verify the transparency chain is intact AND consistent with the registry:
   *  - hash chain links are correct and sequence numbers are continuous
   *  - every entry references an asset that exists
   *  - the entry's content hash matches that asset's content hash
   *  - the asset's logSeq resolves back to this entry
   */
  verifyLog(): { valid: boolean; brokenAt: number | null; reason: string | null } {
    let prev = "GENESIS";
    for (let i = 0; i < this.db.log.length; i++) {
      const e = this.db.log[i];
      const expected = createHash("sha256")
        .update(`${e.seq}|${e.timestamp}|${e.assetId}|${e.contentHash}|${prev}`)
        .digest("hex");
      if (e.seq !== i) return { valid: false, brokenAt: i, reason: "non-continuous sequence" };
      if (expected !== e.entryHash || e.prevHash !== prev) {
        return { valid: false, brokenAt: e.seq, reason: "hash chain broken" };
      }
      const asset = this.getAsset(e.assetId);
      if (!asset) return { valid: false, brokenAt: e.seq, reason: "entry references missing asset" };
      if (asset.contentHash !== e.contentHash) {
        return { valid: false, brokenAt: e.seq, reason: "content hash mismatch with asset" };
      }
      if (asset.logSeq !== e.seq) {
        return { valid: false, brokenAt: e.seq, reason: "asset logSeq does not resolve to entry" };
      }
      prev = e.entryHash;
    }
    return { valid: true, brokenAt: null, reason: null };
  }

  /**
   * Confirm a specific asset's provenance is backed by an intact transparency
   * log: the whole hash chain validates AND this asset has a log entry that
   * matches its id and content hash. A genuine verdict must NOT be returned if
   * this fails - otherwise a corrupted registry could still show "original".
   */
  verifyAssetProvenance(asset: SignedAsset): { ok: boolean; reason: string | null } {
    const chain = this.verifyLog();
    if (!chain.valid) {
      return { ok: false, reason: chain.reason ?? "transparency-log hash chain broken" };
    }
    const entry = this.db.log.find((e) => e.seq === asset.logSeq);
    if (!entry) return { ok: false, reason: "no transparency-log entry for this record" };
    if (entry.assetId !== asset.id) return { ok: false, reason: "log entry references a different asset" };
    if (entry.contentHash !== asset.contentHash) {
      return { ok: false, reason: "log entry content-hash mismatch" };
    }
    return { ok: true, reason: null };
  }

  // ---- Verification events ----
  addEvent(input: Omit<VerificationEvent, "id" | "timestamp">): VerificationEvent {
    const event: VerificationEvent = {
      ...input,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };
    this.db.events.push(event);
    this.flush();
    return event;
  }

  listEvents(): VerificationEvent[] {
    return this.db.events;
  }

  /** Ed25519 keypair for signing exported evidence packs (created on first use). */
  getEvidenceKeyPair(): { publicKey: string; privateKey: string } {
    if (!this.db.evidenceKey) {
      const { publicKey, privateKey } = generateKeyPairSync("ed25519");
      this.db.evidenceKey = {
        publicKey: publicKey.export({ type: "spki", format: "der" }).toString("base64"),
        privateKey: privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
      };
      this.flush();
    }
    return this.db.evidenceKey;
  }

  stats() {
    return {
      issuers: this.db.issuers.length,
      signedAssets: this.db.assets.length,
      logEntries: this.db.log.length,
      verificationEvents: this.db.events.length,
    };
  }
}

// Singleton (survives tsx hot reload in dev).
declare global {
  // eslint-disable-next-line no-var
  var __pramaanStore: Store | undefined;
}

export function getStore(): Store {
  if (!globalThis.__pramaanStore) {
    globalThis.__pramaanStore = new Store();
  }
  return globalThis.__pramaanStore;
}

export type { Store };
