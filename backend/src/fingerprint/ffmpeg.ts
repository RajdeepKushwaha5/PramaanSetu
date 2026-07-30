/**
 * Shared FFmpeg access. Uses FFMPEG_PATH (absolute path to ffmpeg.exe) if set,
 * otherwise falls back to "ffmpeg" on PATH. Everything that shells out to
 * FFmpeg (video frames, audio fingerprint) goes through here.
 */

import { spawnSync } from "node:child_process";

export function ffmpegBin(): string {
  return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

let checked = false;
let available = false;

export function isFfmpegAvailable(): boolean {
  if (!checked) {
    try {
      const r = spawnSync(ffmpegBin(), ["-version"], { encoding: "utf8" });
      available = r.status === 0;
    } catch {
      available = false;
    }
    checked = true;
  }
  return available;
}
