/**
 * Audio fingerprinting for voice-clone / audio-replacement detection.
 *
 * FFmpeg decodes the audio track to mono 8 kHz PCM; we compute a compact
 * time-by-frequency spectrogram signature (16 time windows x 16 frequency
 * bands). A re-compressed copy keeps almost the same signature; a replaced
 * (voice-cloned) track has a very different spectrum -> detectable as tampering
 * even when the video frames still match the signed original.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegBin, isFfmpegAvailable } from "./ffmpeg.js";

const SR = 8000; // sample rate after decode
const T = 16; // time windows
const F = 16; // frequency bands
const DELTA = 26; // per-cell change threshold (0-255)

// Log-spaced target frequencies from ~120 Hz to ~3500 Hz (speech band).
const FREQS: number[] = Array.from({ length: F }, (_, i) => {
  const lo = Math.log(120);
  const hi = Math.log(3500);
  return Math.exp(lo + ((hi - lo) * i) / (F - 1));
});

/** Returns base64 of a T*F spectrogram signature, or null (no audio / no ffmpeg). */
export async function audioFingerprint(buffer: Buffer, ext = "mp4"): Promise<string | null> {
  if (!isFfmpegAvailable()) return null;
  const dir = mkdtempSync(join(tmpdir(), "pramaan-aud-"));
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
      return null; // no audio track
    }
    const n = Math.floor(raw.length / 2);
    if (n < SR / 4) return null; // less than ~0.25s of audio

    const samples = new Float64Array(n);
    for (let i = 0; i < n; i++) samples[i] = raw.readInt16LE(i * 2) / 32768;

    const win = Math.floor(n / T);
    if (win < 8) return null;

    const grid = new Float64Array(T * F);
    let max = 1e-9;
    for (let t = 0; t < T; t++) {
      const start = t * win;
      for (let f = 0; f < F; f++) {
        const w = (2 * Math.PI * FREQS[f]) / SR;
        let re = 0;
        let im = 0;
        for (let k = 0; k < win; k++) {
          const s = samples[start + k];
          re += s * Math.cos(w * k);
          im -= s * Math.sin(w * k);
        }
        const mag = Math.sqrt(re * re + im * im) / win;
        grid[t * F + f] = mag;
        if (mag > max) max = mag;
      }
    }

    const out = Buffer.alloc(T * F);
    for (let i = 0; i < T * F; i++) out[i] = Math.round((grid[i] / max) * 255);
    return out.toString("base64");
  } catch (e) {
    console.error("audioFingerprint failed:", e);
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Count of spectrogram cells that changed by more than DELTA (0 = identical). */
export function audioChangedCells(aB64: string, bB64: string): number {
  const a = Buffer.from(aB64, "base64");
  const b = Buffer.from(bB64, "base64");
  if (a.length !== b.length || a.length === 0) return Number.MAX_SAFE_INTEGER;
  let c = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > DELTA) c++;
  return c;
}

/** Threshold: <= this many changed cells (of 256) = same audio; more = replaced. */
export const AUDIO_SAME_MAX = 40;
