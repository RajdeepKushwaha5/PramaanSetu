/**
 * Extract representative frames from a video as PNG buffers, for the deepfake
 * detectors (vision model + image forensics). Mirrors videoHash's sampling but
 * returns the frame bytes instead of their hashes. Degrades to [] without
 * FFmpeg.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegBin, isFfmpegAvailable } from "../fingerprint/ffmpeg.js";

export async function extractFrames(
  buffer: Buffer,
  ext = "mp4",
  maxFrames = 4,
): Promise<Buffer[]> {
  if (!isFfmpegAvailable()) return [];
  const dir = mkdtempSync(join(tmpdir(), "pramaan-det-vid-"));
  const inPath = join(dir, `in.${ext}`);
  try {
    writeFileSync(inPath, buffer);
    // Sample evenly; keep frames reasonably sized for the vision model.
    spawnSync(
      ffmpegBin(),
      [
        "-i", inPath,
        "-vf", "fps=1/2,scale=320:-1",
        "-frames:v", String(maxFrames),
        "-y",
        join(dir, "frame_%02d.png"),
      ],
      { encoding: "buffer" },
    );
    const frames = readdirSync(dir)
      .filter((f) => f.startsWith("frame_") && f.endsWith(".png"))
      .sort();
    return frames.map((f) => readFileSync(join(dir, f)));
  } catch (e) {
    console.error("extractFrames failed:", e);
    return [];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
