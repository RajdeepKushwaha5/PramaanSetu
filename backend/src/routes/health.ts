import { Router } from "express";
import { getKeyManager } from "../ai/geminiKeyManager.js";
import { env } from "../config/env.js";
import { getStore } from "../db/store.js";
import { isFfmpegAvailable } from "../fingerprint/index.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  const km = getKeyManager();
  res.json({
    status: "ok",
    service: "pramaansetu-backend",
    model: env.geminiModel,
    capabilities: {
      signing: true,
      imageFingerprint: true,
      pdfFingerprint: true,
      videoFingerprint: isFfmpegAvailable(),
      audioFingerprint: isFfmpegAvailable(),
      aiRiskEngine: km.size > 0 && km.hasHealthyKey(),
    },
    store: getStore().stats(),
  });
});
