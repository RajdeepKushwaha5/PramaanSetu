import { Router } from "express";
import { getKeyManager } from "../ai/geminiKeyManager.js";
import { env } from "../config/env.js";
import { getStore } from "../db/store.js";
import { isFfmpegAvailable } from "../fingerprint/index.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  const km = getKeyManager();
  const ffmpeg = isFfmpegAvailable();
  const ai = km.size > 0 && km.hasHealthyKey();
  const capabilities = {
    signing: true,
    imageFingerprint: true,
    pdfFingerprint: true,
    videoFingerprint: ffmpeg,
    audioFingerprint: ffmpeg,
    aiRiskEngine: ai,
    syntheticDetection: true, // forensics always available; AI layer when `ai`
  };

  // Report which optional-but-important capabilities are missing so an operator
  // sees a degraded (not falsely "ok") status. The deterministic core (signing,
  // image/PDF/text verification) always works; FFmpeg and AI are enhancements.
  const missing: string[] = [];
  if (!ffmpeg) missing.push("ffmpeg (video/audio fingerprinting)");
  if (!ai) missing.push("gemini keys (AI risk + deepfake vision)");

  const log = getStore().verifyLog();
  if (!log.valid) missing.push(`transparency log integrity (${log.reason ?? "broken"})`);

  let status: "ok" | "degraded" | "critical" = "ok";
  if (!log.valid) status = "critical";
  else if (missing.length > 0) status = "degraded";

  res.status(status === "critical" ? 503 : 200).json({
    status,
    service: "pramaansetu-backend",
    model: env.geminiModel,
    capabilities,
    degraded: missing,
    store: getStore().stats(),
  });
});
