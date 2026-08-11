/**
 * Demo videos for the voice-clone scenario (needs FFmpeg).
 *
 *   originalMp4   : test-pattern video + audio A  -> signed reference
 *   compressedMp4 : re-encoded original (same audio A) -> Verified Copy
 *   clonedMp4     : SAME video stream + audio B     -> Altered (audio replaced)
 *
 * The cloned video reuses the original's exact video stream (-c:v copy) so the
 * frames still match, isolating the audio replacement - exactly a dubbed /
 * voice-cloned deepfake.
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

export interface DemoVideoBundle {
  originalMp4: Buffer;
  compressedMp4: Buffer;
  clonedMp4: Buffer;
}

export function makeDemoVideos(): DemoVideoBundle | null {
  if (!isFfmpegAvailable()) return null;
  const dir = mkdtempSync(join(tmpdir(), "pramaan-demovid-"));
  const base = join(dir, "base.mp4");
  const original = join(dir, "original.mp4");
  const clone = join(dir, "clone.mp4");
  const compressed = join(dir, "compressed.mp4");
  try {
    const bitexact = ["-fflags", "+bitexact", "-flags:v", "+bitexact", "-map_metadata", "-1"];
    // 1) base video, no audio (deterministic test pattern)
    run(["-fflags", "+bitexact", "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=12:duration=3", "-pix_fmt", "yuv420p", ...bitexact, "-y", base]);
    // 2) original = base video + tone A
    run(["-i", base, "-f", "lavfi", "-i", "sine=frequency=320:duration=3", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-shortest", ...bitexact, "-y", original]);
    // 3) clone = SAME video stream + different audio (voice-clone stand-in)
    run(["-i", base, "-f", "lavfi", "-i", "sine=frequency=760:duration=3", "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-shortest", ...bitexact, "-y", clone]);
    // 4) compressed = re-encode original (same audio, lower-quality video)
    run(["-i", original, "-c:v", "libx264", "-crf", "34", "-c:a", "aac", "-b:a", "32k", ...bitexact, "-y", compressed]);
    return {
      originalMp4: readFileSync(original),
      compressedMp4: readFileSync(compressed),
      clonedMp4: readFileSync(clone),
    };
  } catch (e) {
    console.error("makeDemoVideos failed:", (e as Error).message);
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
