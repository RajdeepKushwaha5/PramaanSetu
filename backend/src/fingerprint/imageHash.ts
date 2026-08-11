/**
 * Perceptual image fingerprinting via a colour block-average grid (Jimp, pure JS).
 *
 * The image is reduced to a 32x32 grid; each cell stores its average R, G, B.
 * Comparison counts cells whose strongest channel changed by more than DELTA:
 *
 *   - re-compression / re-encoding (WhatsApp) nudges every cell only slightly
 *     -> ~0 changed cells                              => Verified Derivative
 *   - a localised edit (swapped payment QR, changed figure/colour, removed
 *     disclaimer) changes the cells covering that region -> a handful of
 *     changed cells                                     => Altered
 *   - an unrelated image changes most cells             => no match (Unverified)
 *
 * Colour (not just luminance) matters: an edit can change colour while keeping
 * brightness (e.g. grey text turned red), which a grayscale hash would miss.
 */

import { Jimp } from "jimp";

const GRID = 32; // 32x32 = 1024 cells, 3 channels each
const DELTA = 30; // per-channel change (0-255) counted as "changed"

// Minimal structural type: everything gridFromJimp needs, so it accepts a
// Jimp.read() result, a .clone(), a .crop(), etc. without fighting Jimp's
// overloaded instance typings.
interface JimpLike {
  bitmap: { data: Buffer };
  resize(opts: { w: number; h: number }): unknown;
}

/** Reduce a Jimp image (mutated: resized) to the GRID*GRID*3 colour signature. */
function gridFromJimp(img: JimpLike): string {
  img.resize({ w: GRID, h: GRID });
  const d = img.bitmap.data; // RGBA
  const cells = Buffer.alloc(GRID * GRID * 3);
  for (let i = 0; i < GRID * GRID; i++) {
    cells[i * 3] = d[i * 4];
    cells[i * 3 + 1] = d[i * 4 + 1];
    cells[i * 3 + 2] = d[i * 4 + 2];
  }
  return cells.toString("base64");
}

/** Returns base64 of GRID*GRID*3 bytes (R,G,B per cell). */
export async function imageFingerprint(buffer: Buffer): Promise<string> {
  return gridFromJimp(await Jimp.read(buffer));
}

/**
 * Geometry-robust fingerprint SET for a signed reference image.
 *
 * Block-average hashing is not geometry-invariant, so a genuine forward that was
 * cropped would otherwise miss its own signed record. We fix this on the SIGNING
 * side (not the probe side): store, alongside the base fingerprint, a few
 * pre-transformed centre-crop variants. A cropped probe then matches the
 * corresponding stored variant via the existing changed-cell comparison.
 *
 * This only augments the reference set; the probe stays a single fingerprint, so
 * the strict changed-cell thresholds still gate every match. The realistic
 * benchmark (`npm run benchmark:real`) verifies this lifts crop recall to 100%
 * WITHOUT introducing false matches on unrelated images.
 *
 * Rotation is deliberately NOT augmented: small rotations land in the "altered"
 * band rather than matching cleanly, which would raise a false tamper alarm on a
 * genuinely tilted forward. Rotation-invariant matching needs feature/keypoint
 * methods (ORB/SIFT) and is left as documented production work; a tilted forward
 * stays an honest "unverified".
 */
export async function robustImageFingerprints(buffer: Buffer): Promise<string[]> {
  const base = await Jimp.read(buffer);
  const w = base.bitmap.width;
  const h = base.bitmap.height;
  const out: string[] = [gridFromJimp(base.clone())];

  // Centre-crop variants (border fraction removed), robust to cropped forwards.
  for (const b of [0.05, 0.1]) {
    const cx = Math.round(w * b);
    const cy = Math.round(h * b);
    if (w - 2 * cx < 8 || h - 2 * cy < 8) continue;
    const c = base.clone().crop({ x: cx, y: cy, w: w - 2 * cx, h: h - 2 * cy });
    out.push(gridFromJimp(c));
  }

  return out;
}

function cellChanged(a: Buffer, b: Buffer, cell: number): boolean {
  const o = cell * 3;
  return (
    Math.abs(a[o] - b[o]) > DELTA ||
    Math.abs(a[o + 1] - b[o + 1]) > DELTA ||
    Math.abs(a[o + 2] - b[o + 2]) > DELTA
  );
}

/** Count of cells whose strongest channel differs by more than DELTA. */
export function changedCells(aB64: string, bB64: string): number {
  const a = Buffer.from(aB64, "base64");
  const b = Buffer.from(bB64, "base64");
  if (a.length !== b.length || a.length === 0) return Number.MAX_SAFE_INTEGER;
  const n = a.length / 3;
  let count = 0;
  for (let i = 0; i < n; i++) if (cellChanged(a, b, i)) count++;
  return count;
}

/** Minimum changed-cell count across two sets of fingerprints. */
export function bestChangedCells(a: string[], b: string[]): number {
  let best = Number.MAX_SAFE_INTEGER;
  for (const x of a) {
    for (const y of b) {
      const d = changedCells(x, y);
      if (d < best) best = d;
    }
  }
  return best;
}

export const GRID_SIZE = GRID;

/**
 * Compact 64-bit coarse signature (8x8 grayscale average-hash) derived from the
 * full colour fingerprint. Robust to recompression, so a copy/altered image
 * shares almost all bits with its original - which lets an LSH index bucket
 * them together for sub-linear candidate search.
 */
export function coarseSignature(b64: string): bigint {
  const buf = Buffer.from(b64, "base64"); // 32x32x3
  const small = new Array<number>(64).fill(0);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const i = y * GRID + x;
      const gray = (buf[i * 3] + buf[i * 3 + 1] + buf[i * 3 + 2]) / 3;
      small[(y >> 2) * 8 + (x >> 2)] += gray;
    }
  }
  let mean = 0;
  for (let i = 0; i < 64; i++) {
    small[i] /= 16;
    mean += small[i];
  }
  mean /= 64;
  let sig = 0n;
  for (let i = 0; i < 64; i++) sig = (sig << 1n) | (small[i] > mean ? 1n : 0n);
  return sig;
}

/**
 * Per-cell change map between two fingerprints - used to localise tampering
 * (draw a heatmap over the changed region). Returns a row-major array of 0/1.
 */
export function cellDiffGrid(
  aB64: string,
  bB64: string,
): { grid: number; cells: number[]; changed: number } {
  const a = Buffer.from(aB64, "base64");
  const b = Buffer.from(bB64, "base64");
  const cells: number[] = [];
  let changed = 0;
  const n = Math.min(a.length, b.length) / 3;
  for (let i = 0; i < n; i++) {
    const c = cellChanged(a, b, i) ? 1 : 0;
    cells.push(c);
    changed += c;
  }
  return { grid: GRID, cells, changed };
}
