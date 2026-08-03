/**
 * Detection-metrics cache. Serves the latest evaluation to the API/UI.
 *
 * On first request (nothing stored) it computes a deterministic FORENSIC-ONLY
 * baseline on the illustrative corpus — fast, no Gemini quota — so the app
 * always shows evidence. Running `npm run benchmark:detection` (optionally with
 * the vision model and a held-out set) overwrites the stored metrics with
 * stronger numbers that the API then serves.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateDetector, type DetectionMetrics } from "./evaluation.js";
import { buildIllustrativeCorpus, loadHeldOutCorpus } from "./sampleCorpus.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const METRICS_PATH =
  process.env.PRAMAAN_METRICS_PATH ?? join(__dirname, "..", "..", "data", "detection-metrics.json");

let cache: DetectionMetrics | null = null;

function readStored(): DetectionMetrics | null {
  if (cache) return cache;
  try {
    if (existsSync(METRICS_PATH)) {
      cache = JSON.parse(readFileSync(METRICS_PATH, "utf8")) as DetectionMetrics;
      return cache;
    }
  } catch (e) {
    console.error("Failed to read detection metrics:", (e as Error).message);
  }
  return null;
}

export function writeMetrics(m: DetectionMetrics): void {
  cache = m;
  try {
    mkdirSync(dirname(METRICS_PATH), { recursive: true });
    writeFileSync(METRICS_PATH, JSON.stringify(m, null, 2), "utf8");
  } catch (e) {
    console.error("Failed to write detection metrics:", (e as Error).message);
  }
}

export async function computeMetrics(opts: { aiEnabled: boolean }): Promise<DetectionMetrics> {
  const heldOut = loadHeldOutCorpus();
  const samples = heldOut ?? (await buildIllustrativeCorpus());
  const dataset = heldOut ? "held-out" : "illustrative";
  const datasetNote = heldOut
    ? "Held-out set from backend/datasets/detection (real samples you provided)."
    : "Built-in illustrative synthetic set — NOT a real deepfake benchmark. Drop real images into backend/datasets/detection/{authentic,synthetic} and re-run for held-out numbers.";
  const metrics = await evaluateDetector(samples, { dataset, datasetNote, aiEnabled: opts.aiEnabled });
  writeMetrics(metrics);
  return metrics;
}

/** Stored metrics, or a computed forensic-only baseline on first use. */
export async function getDetectionMetrics(): Promise<DetectionMetrics> {
  const stored = readStored();
  if (stored) return stored;
  return computeMetrics({ aiEnabled: false });
}
