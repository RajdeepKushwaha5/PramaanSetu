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

/** Returns base64 of GRID*GRID*3 bytes (R,G,B per cell). */
export async function imageFingerprint(buffer: Buffer): Promise<string> {
  const img = await Jimp.read(buffer);
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
 * Per-cell change map between two fingerprints — used to localise tampering
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
