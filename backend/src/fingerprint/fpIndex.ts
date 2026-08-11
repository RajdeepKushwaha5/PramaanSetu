/**
 * LSH index over perceptual fingerprints for sub-linear candidate search.
 *
 * The verifier must compare a submitted image against every signed asset. That
 * linear scan is fine for a demo but O(n) at national scale. This index uses
 * banded LSH on a 64-bit coarse signature: the signature is split into 4 bands
 * of 16 bits, and two fingerprints are candidates if they match on ANY band.
 * A re-compressed or lightly-altered copy shares almost all coarse bits with
 * its original, so it lands in the same buckets; unrelated images do not.
 *
 * The exact verdict is still decided by the precise changed-cell comparison -
 * the index only narrows WHICH assets get compared, so verdict correctness is
 * unchanged (as long as the true match is among the candidates, which the
 * banding guarantees with high recall).
 */

import type { SignedAsset } from "../db/types.js";
import { coarseSignature } from "./imageHash.js";

const BANDS = 4;
const BAND_BITS = 16;
const BAND_MASK = (1n << BigInt(BAND_BITS)) - 1n;

function bandsOf(sig: bigint): number[] {
  const out: number[] = [];
  for (let b = 0; b < BANDS; b++) {
    out.push(Number((sig >> BigInt(b * BAND_BITS)) & BAND_MASK));
  }
  return out;
}

class FingerprintIndex {
  // One bucket map per band: key = `${band}:${value}` -> set of asset ids.
  private buckets = new Map<string, Set<string>>();
  private builtForCount = -1;

  private add(assetId: string, fingerprint: string): void {
    const bands = bandsOf(coarseSignature(fingerprint));
    for (let b = 0; b < BANDS; b++) {
      const key = `${b}:${bands[b]}`;
      let set = this.buckets.get(key);
      if (!set) {
        set = new Set();
        this.buckets.set(key, set);
      }
      set.add(assetId);
    }
  }

  /** Rebuild the index if the asset set has changed. */
  private ensureBuilt(assets: SignedAsset[]): void {
    if (this.builtForCount === assets.length) return;
    this.buckets.clear();
    for (const a of assets) {
      for (const fp of a.perceptualHashes) this.add(a.id, fp);
    }
    this.builtForCount = assets.length;
  }

  /**
   * Return the candidate assets whose coarse signature shares a band with any
   * probe fingerprint. Falls back to all assets when the index is empty (small
   * n), guaranteeing no recall regression.
   */
  candidates(probeFingerprints: string[], assets: SignedAsset[]): SignedAsset[] {
    this.ensureBuilt(assets);
    const ids = new Set<string>();
    for (const fp of probeFingerprints) {
      for (const [b, value] of bandsOf(coarseSignature(fp)).entries()) {
        const set = this.buckets.get(`${b}:${value}`);
        if (set) for (const id of set) ids.add(id);
      }
    }
    if (ids.size === 0) return assets; // cold / no bucket hit: be safe
    const byId = new Map(assets.map((a) => [a.id, a]));
    return [...ids].map((id) => byId.get(id)).filter((a): a is SignedAsset => !!a);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __pramaanFpIndex: FingerprintIndex | undefined;
}

export function getFingerprintIndex(): FingerprintIndex {
  if (!globalThis.__pramaanFpIndex) {
    globalThis.__pramaanFpIndex = new FingerprintIndex();
  }
  return globalThis.__pramaanFpIndex;
}
