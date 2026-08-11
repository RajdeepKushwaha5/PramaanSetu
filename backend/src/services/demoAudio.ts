/**
 * Demo audio for the audio-provenance scenario (needs FFmpeg).
 *
 *   originalM4a   : a short spoken-word-like tone mix -> signed reference
 *   compressedM4a : the SAME audio re-encoded at low bitrate -> Verified Copy
 *   unrelatedM4a  : a different recording -> Unverified (no false match)
 *
 * The compressed clip is a genuine recompression of the original (as a forwarded
 * voice note would be), so it must verify as a derivative; the unrelated clip
 * must not match anything.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegBin, isFfmpegAvailable } from "../fingerprint/ffmpeg.js";

function run(args: string[]): void {
  const r = spawnSync(ffmpegBin(), args, { encoding: "buffer" });
  if (r.status !== 0) {
    throw new Error("ffmpeg failed: " + (r.stderr?.toString().slice(-300) ?? "unknown"));
  }
}

export interface DemoAudioBundle {
  originalM4a: Buffer;
  compressedM4a: Buffer;
  unrelatedM4a: Buffer;
}

// A layered tone "utterance" - a couple of formant-like sines that give the
// spectrogram enough structure to be distinctive from the unrelated clip.
const ORIGINAL_FILTER =
  "sine=frequency=240:duration=3[a];sine=frequency=620:duration=3[b];sine=frequency=1300:duration=3[c];[a][b]amix=inputs=2[ab];[ab][c]amix=inputs=2";
const UNRELATED_FILTER =
  "sine=frequency=180:duration=3[a];sine=frequency=900:duration=3[b];[a][b]amix=inputs=2";

export function makeDemoAudio(): DemoAudioBundle | null {
  if (!isFfmpegAvailable()) return null;
  const dir = mkdtempSync(join(tmpdir(), "pramaan-demoaud-"));
  const original = join(dir, "original.m4a");
  const compressed = join(dir, "compressed.m4a");
  const unrelated = join(dir, "unrelated.m4a");
  const bitexact = ["-fflags", "+bitexact", "-map_metadata", "-1"];
  try {
    run(["-fflags", "+bitexact", "-f", "lavfi", "-i", ORIGINAL_FILTER, "-c:a", "aac", "-b:a", "128k", ...bitexact, "-y", original]);
    // Recompress the SAME audio at a much lower bitrate (forwarded voice note).
    run(["-i", original, "-c:a", "aac", "-b:a", "24k", "-ar", "16000", ...bitexact, "-y", compressed]);
    run(["-fflags", "+bitexact", "-f", "lavfi", "-i", UNRELATED_FILTER, "-c:a", "aac", "-b:a", "128k", ...bitexact, "-y", unrelated]);
    return {
      originalM4a: readFileSync(original),
      compressedM4a: readFileSync(compressed),
      unrelatedM4a: readFileSync(unrelated),
    };
  } catch (e) {
    console.error("makeDemoAudio failed:", (e as Error).message);
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
