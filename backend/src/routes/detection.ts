import { Router } from "express";
import { getDetectionMetrics } from "../detect/metricsStore.js";

export const detectionRouter = Router();

// Detection-performance evidence: confusion matrix + accuracy/precision/recall/F1
// from the latest evaluation run. See backend/src/detect/evaluation.ts.
detectionRouter.get("/metrics", async (_req, res) => {
  try {
    const metrics = await getDetectionMetrics();
    // Keep the payload light: drop the per-sample breakdown; report n as the count.
    const { perSample: _perSample, ...summary } = metrics;
    void _perSample;
    res.json({ ...summary, sampleCount: metrics.n });
  } catch (e) {
    res.status(500).json({ error: `Could not compute detection metrics: ${(e as Error).message}` });
  }
});
