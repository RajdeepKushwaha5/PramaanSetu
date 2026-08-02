/**
 * Deterministic audio forensics for synthetic-voice cues.
 *
 * FFmpeg decodes the track to mono 16 kHz PCM. We compute frame-wise band
 * energies (Goertzel over log-spaced speech frequencies) and derive cues that
 * tend to separate genuine human recordings from TTS / voice-cloned speech:
 *
 *  - Spectral-shape stability: synthetic voices often hold an unnaturally
 *    constant spectral envelope frame-to-frame (low temporal variation).
 *  - Noise floor: cloned/TTS audio is frequently "too clean" — almost no room
 *    tone between phonemes.
 *
 * Like the image forensics, these are conservative corroborating heuristics; the
 * model opinion is the primary signal. Returns score 0 + a note if no FFmpeg /
 * no audio track, so callers can fall back to the model alone.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegBin, isFfmpegAvailable } from "../fingerprint/ffmpeg.js";
import type { DetectionSignal } from "./types.js";

export interface ForensicResult {
  score: number;
  signals: DetectionSignal[];
  available: boolean;
}

const SR = 16000;
const FRAME = 512; // ~32 ms
const BANDS = 12;
const FREQS: number[] = Array.from({ length: BANDS }, (_, i) => {
  const lo = Math.log(150);
  const hi = Math.log(6000);
  return Math.exp(lo + ((hi - lo) * i) / (BANDS - 1));
});

function decodePcm(buffer: Buffer, ext: string): Float64Array | null {
  if (!isFfmpegAvailable()) return null;
  const dir = mkdtempSync(join(tmpdir(), "pramaan-det-aud-"));
  const inPath = join(dir, `in.${ext}`);
  const outPath = join(dir, "out.raw");
  try {
    writeFileSync(inPath, buffer);
    spawnSync(
      ffmpegBin(),
      ["-i", inPath, "-vn", "-ac", "1", "-ar", String(SR), "-f", "s16le", "-y", outPath],
      { encoding: "buffer" },
    );
    let raw: Buffer;
    try {
      raw = readFileSync(outPath);
    } catch {
      return null;
    }
    const n = Math.floor(raw.length / 2);
    if (n < SR / 2) return null; // < 0.5s
    const samples = new Float64Array(n);
    for (let i = 0; i < n; i++) samples[i] = raw.readInt16LE(i * 2) / 32768;
    return samples;
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function bandEnergies(frame: Float64Array): number[] {
  const out = new Array<number>(BANDS);
  for (let f = 0; f < BANDS; f++) {
    const w = (2 * Math.PI * FREQS[f]) / SR;
    let re = 0;
    let im = 0;
    for (let k = 0; k < frame.length; k++) {
      re += frame[k] * Math.cos(w * k);
      im -= frame[k] * Math.sin(w * k);
    }
    out[f] = Math.sqrt(re * re + im * im) / frame.length;
  }
  return out;
}

export function audioForensics(buffer: Buffer, ext = "wav"): ForensicResult {
  const samples = decodePcm(buffer, ext);
  if (!samples) {
    return {
      available: false,
      score: 0,
      signals: [
        {
          source: "forensic",
          label: "audio forensics unavailable",
          detail: "No decodable audio track (or FFmpeg not installed); relying on the model opinion only.",
        },
      ],
    };
  }

  const nFrames = Math.floor(samples.length / FRAME);
  if (nFrames < 8) return { available: false, score: 0, signals: [] };

  // Per-frame normalised spectral shape + per-frame RMS.
  const shapes: number[][] = [];
  const rms: number[] = [];
  for (let t = 0; t < nFrames; t++) {
    const frame = samples.subarray(t * FRAME, t * FRAME + FRAME);
    let energy = 0;
    for (let k = 0; k < frame.length; k++) energy += frame[k] * frame[k];
    rms.push(Math.sqrt(energy / frame.length));
    const be = bandEnergies(frame);
    const sum = be.reduce((s, v) => s + v, 0) || 1e-9;
    shapes.push(be.map((v) => v / sum));
  }

  // Temporal variation of the spectral shape (mean over bands of per-band CV).
  let shapeVar = 0;
  for (let f = 0; f < BANDS; f++) {
    const col = shapes.map((s) => s[f]);
    const m = col.reduce((s, v) => s + v, 0) / col.length;
    const v = col.reduce((s, x) => s + (x - m) * (x - m), 0) / col.length;
    shapeVar += m > 1e-6 ? Math.sqrt(v) / m : 0;
  }
  shapeVar /= BANDS;

  // Noise floor: median RMS of the quietest 20% of frames.
  const sortedRms = [...rms].sort((a, b) => a - b);
  const floor = sortedRms[Math.floor(sortedRms.length * 0.1)] ?? 0;
  const peak = sortedRms[Math.floor(sortedRms.length * 0.9)] ?? 1e-6;
  const dynamicRange = peak > 1e-6 ? floor / peak : 0; // ~0 = very clean gaps

  const signals: DetectionSignal[] = [];
  let score = 20;

  if (shapeVar < 0.55) {
    score += 24;
    signals.push({
      source: "forensic",
      label: "over-stable spectrum",
      detail: `The spectral envelope barely changes frame-to-frame (variation ${shapeVar.toFixed(2)}), which is more typical of synthesized speech than natural speech.`,
    });
  } else if (shapeVar > 1.1) {
    score -= 8;
    signals.push({
      source: "forensic",
      label: "natural spectral variation",
      detail: "The spectrum varies naturally across the clip, consistent with a genuine recording.",
    });
  }

  if (dynamicRange < 0.02) {
    score += 18;
    signals.push({
      source: "forensic",
      label: "unnaturally clean gaps",
      detail: `Silent gaps have almost no room tone (floor/peak ${dynamicRange.toFixed(3)}), a common trait of TTS/voice-cloned audio.`,
    });
  }

  return { available: true, score: Math.max(0, Math.min(100, Math.round(score))), signals };
}
