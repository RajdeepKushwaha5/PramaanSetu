/**
 * Video perceptual hashing via FFmpeg.
 *
 * Extracts a handful of evenly-spaced keyframes and dHashes each. A compressed
 * re-upload yields nearly the same frame hashes; a doctored clip diverges.
 *
 * Degrades gracefully: if FFmpeg is not installed, returns an empty hash list
 * and the verification engine falls back to exact-hash matching only.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { imageFingerprint } from "./imageHash.js";
import { ffmpegBin, isFfmpegAvailable } from "./ffmpeg.js";

export { isFfmpegAvailable };

/** Extract up to `maxFrames` keyframes and return their dHashes. */
export async function videoFrameHashes(
  buffer: Buffer,
  ext = "mp4",
  maxFrames = 8,
): Promise<string[]> {
  if (!isFfmpegAvailable()) return [];

  const dir = mkdtempSync(join(tmpdir(), "pramaan-vid-"));
  const inPath = join(dir, `in.${ext}`);
  try {
    writeFileSync(inPath, buffer);
    // Sample 1 frame every 2s, downscale to 64px wide, cap at maxFrames.
    spawnSync(
      ffmpegBin(),
      [
        "-i", inPath,
        "-vf", "fps=1/2,scale=64:-1",
        "-frames:v", String(maxFrames),
        "-y",
        join(dir, "frame_%02d.png"),
      ],
      { encoding: "utf8" },
    );

    const frames = readdirSync(dir)
      .filter((f) => f.startsWith("frame_") && f.endsWith(".png"))
      .sort();

    const hashes: string[] = [];
    for (const f of frames) {
      hashes.push(await imageFingerprint(readFileSync(join(dir, f))));
    }
    return hashes;
  } catch (e) {
    console.error("videoFrameHashes failed:", e);
    return [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
