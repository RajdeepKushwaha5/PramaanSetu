/**
 * Deterministic image forensics for synthetic / manipulated-media cues.
 *
 * These are corroborating heuristics, not a proof. They exist so that a
 * detection verdict still appears when the vision model is rate-limited, and so
 * a jury can see a concrete, reproducible signal alongside the AI opinion.
 *
 * Two classic cues, both pure-JS via Jimp:
 *
 *  1. Error-Level Analysis (ELA): re-encode to JPEG and measure the residual.
 *     A camera photo carries an uneven JPEG-compression history, so its ELA
 *     residual varies a lot across the frame. A freshly rendered AI image (or a
 *     locally spliced region) tends to have a flat, spatially-uniform residual.
 *
 *  2. Noise uniformity: high-pass the luma and measure sensor-noise energy per
 *     block. Real capture has noise that varies across the scene; diffusion/GAN
 *     output is often unnaturally smooth and uniform.
 *
 * We deliberately keep the standalone forensic verdict conservative — it biases
 * toward "uncertain" unless a cue is strong — because false-positives on a real
 * photo would embarrass the demo.
 */

import { Jimp } from "jimp";
import type { DetectionSignal } from "./types.js";

export interface ForensicResult {
  score: number; // 0-100, higher = more synthetic-looking
  signals: DetectionSignal[];
}

const BLOCK = 16;

function luma(d: Buffer, i: number): number {
  // Rec. 601 luma from RGBA byte offset i.
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
}

/** Mean and variance-across-blocks of the JPEG re-encode residual (ELA). */
async function elaCues(buffer: Buffer): Promise<{ mean: number; blockCv: number }> {
  const orig = await Jimp.read(buffer);
  // Cap size so forensics stay fast on large uploads.
  if (orig.bitmap.width > 512) orig.resize({ w: 512 });
  const w = orig.bitmap.width;
  const h = orig.bitmap.height;

  const reBuf = await orig.getBuffer("image/jpeg", { quality: 90 });
  const re = await Jimp.read(reBuf);
  re.resize({ w, h });

  const a = orig.bitmap.data;
  const b = re.bitmap.data;

  // Residual per pixel, aggregated into block means.
  const bx = Math.max(1, Math.floor(w / BLOCK));
  const by = Math.max(1, Math.floor(h / BLOCK));
  const blockSum = new Float64Array(bx * by);
  const blockCnt = new Float64Array(bx * by);
  let total = 0;
  let n = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const diff = Math.abs(luma(a, i) - luma(b, i));
      total += diff;
      n++;
      const gx = Math.min(bx - 1, Math.floor((x / w) * bx));
      const gy = Math.min(by - 1, Math.floor((y / h) * by));
      const bi = gy * bx + gx;
      blockSum[bi] += diff;
      blockCnt[bi] += 1;
    }
  }

  const mean = n > 0 ? total / n : 0;

  // Coefficient of variation of block-mean residuals: low = uniform (suspicious).
  const blockMeans: number[] = [];
  for (let i = 0; i < blockSum.length; i++) {
    if (blockCnt[i] > 0) blockMeans.push(blockSum[i] / blockCnt[i]);
  }
  const bm = blockMeans.reduce((s, v) => s + v, 0) / (blockMeans.length || 1);
  const bvar =
    blockMeans.reduce((s, v) => s + (v - bm) * (v - bm), 0) / (blockMeans.length || 1);
  const blockCv = bm > 0.001 ? Math.sqrt(bvar) / bm : 0;

  return { mean, blockCv };
}

/** Per-block high-pass noise energy and how uniform it is across the frame. */
async function noiseCues(buffer: Buffer): Promise<{ energy: number; uniformity: number }> {
  const img = await Jimp.read(buffer);
  if (img.bitmap.width > 512) img.resize({ w: 512 });
  const w = img.bitmap.width;
  const h = img.bitmap.height;
  const d = img.bitmap.data;

  const bx = Math.max(1, Math.floor(w / BLOCK));
  const by = Math.max(1, Math.floor(h / BLOCK));
  const blockEnergy = new Float64Array(bx * by);
  const blockCnt = new Float64Array(bx * by);

  // 4-neighbour Laplacian magnitude as a noise/texture proxy.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      const c = luma(d, i);
      const lap =
        Math.abs(4 * c - luma(d, i - 4) - luma(d, i + 4) - luma(d, i - w * 4) - luma(d, i + w * 4));
      const gx = Math.min(bx - 1, Math.floor((x / w) * bx));
      const gy = Math.min(by - 1, Math.floor((y / h) * by));
      const bi = gy * bx + gx;
      blockEnergy[bi] += lap;
      blockCnt[bi] += 1;
    }
  }

  const energies: number[] = [];
  for (let i = 0; i < blockEnergy.length; i++) {
    if (blockCnt[i] > 0) energies.push(blockEnergy[i] / blockCnt[i]);
  }
  const mean = energies.reduce((s, v) => s + v, 0) / (energies.length || 1);
  const variance =
    energies.reduce((s, v) => s + (v - mean) * (v - mean), 0) / (energies.length || 1);
  // Uniformity: 1 = perfectly uniform noise (suspicious), 0 = highly varied.
  const cv = mean > 0.001 ? Math.sqrt(variance) / mean : 0;
  const uniformity = Math.max(0, Math.min(1, 1 - cv));

  return { energy: mean, uniformity };
}

/**
 * Combine the cues into a conservative 0-100 forensic synthetic score with
 * human-readable signals. Thresholds are prototype heuristics.
 */
export async function imageForensics(buffer: Buffer): Promise<ForensicResult> {
  const signals: DetectionSignal[] = [];
  let score = 20; // neutral-low prior; forensics rarely convict on their own

  try {
    const ela = await elaCues(buffer);
    const noise = await noiseCues(buffer);

    // ELA residual very uniform across blocks -> no natural compression history.
    if (ela.blockCv < 0.35) {
      score += 22;
      signals.push({
        source: "forensic",
        label: "uniform compression residual",
        detail: `Error-level analysis is spatially flat (block CV ${ela.blockCv.toFixed(2)}), which is typical of a freshly rendered or fully re-generated image rather than a camera capture.`,
      });
    } else if (ela.blockCv > 0.9) {
      // Very uneven residual is a sign of local splicing / an edited region.
      score += 14;
      signals.push({
        source: "forensic",
        label: "localised residual spike",
        detail: `Error-level analysis is uneven across the frame (block CV ${ela.blockCv.toFixed(2)}), consistent with a locally edited or spliced region.`,
      });
    }

    // Noise unnaturally uniform -> diffusion/GAN smoothness.
    if (noise.uniformity > 0.72 && noise.energy < 12) {
      score += 24;
      signals.push({
        source: "forensic",
        label: "over-smooth, uniform noise",
        detail: `Sensor-noise energy is low and uniform across the image (uniformity ${noise.uniformity.toFixed(2)}), a common trait of AI-generated imagery.`,
      });
    } else if (noise.energy > 55) {
      // Lots of natural high-frequency detail -> looks like a real capture.
      score -= 12;
      signals.push({
        source: "forensic",
        label: "natural high-frequency detail",
        detail: "Noise/texture varies naturally across the frame, which is more consistent with a genuine capture than with a rendered image.",
      });
    }
  } catch (e) {
    // Forensics are best-effort; never let them break the request.
    return {
      score: 0,
      signals: [
        {
          source: "forensic",
          label: "forensics unavailable",
          detail: `Could not compute image forensics: ${(e as Error).message}.`,
        },
      ],
    };
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), signals };
}
