import { Router } from "express";
import { getDetectionMetrics } from "../detect/metricsStore.js";

export const detectionRouter = Router();

// Detection-performance evidence: confusion matrix + accuracy/precision/recall/F1
// from the latest evaluation run. See backend/src/detect/evaluation.ts.
detectionRouter.get("/metrics", async (_req, res) => {
  try {
    const metrics = await getDetectionMetrics();
    // Keep the payload light: the per-sample breakdown can be large.
    const { perSample, ...summary } = metrics;
    res.json({ ...summary, sampleCount: perSample.length });
  } catch (e) {
    res.status(500).json({ error: `Could not compute detection metrics: ${(e as Error).message}` });
  }
});
