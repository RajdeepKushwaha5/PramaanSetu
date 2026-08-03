/**
 * Pinned held-out detection-performance result.
 *
 * Measured with `npm run benchmark:detection -- --ai` on a held-out set of
 * 10 real AI-generated (diffusion) images vs 20 real photographs. The dataset
 * images are gitignored (licensing / repo size), so this committed summary is
 * what the API + dashboard serve by default — including on a fresh clone or a
 * public deployment where the images aren't present.
 *
 * Re-run the benchmark on your own held-out set to overwrite it
 * (backend/data/detection-metrics.json takes precedence when present).
 */

import type { DetectionMetrics } from "./evaluation.js";

export const heldoutMetrics: DetectionMetrics = {
  generatedAt: "2026-08-03T10:39:42.603Z",
  dataset: "held-out",
  datasetNote:
    "Held-out set: 10 real AI-generated (diffusion) images vs 20 real photographs, scored with the vision model + deterministic forensics.",
  aiEnabled: true,
  decisionThreshold: 34,
  n: 30,
  confusion: { tp: 10, tn: 19, fp: 1, fn: 0 },
  accuracy: 0.967,
  precision: 0.909,
  recall: 1,
  specificity: 0.95,
  f1: 0.952,
  perSample: [],
};
