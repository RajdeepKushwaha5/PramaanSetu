/**
 * Detection-performance benchmark.
 *
 * Runs the synthetic-media detector over a labelled corpus and reports the
 * confusion matrix and metrics (accuracy / precision / recall / specificity /
 * F1). Writes backend/data/detection-metrics.json, which the API + dashboard
 * then serve as PS1's "evidence of detection performance".
 *
 * Corpus: a held-out set from backend/datasets/detection/{authentic,synthetic}
 * if present, otherwise the built-in illustrative set.
 *
 * Usage:
 *   npm run benchmark:detection          # forensic-only (deterministic, no quota)
 *   npm run benchmark:detection -- --ai  # include the Gemini vision model
 */

const aiEnabled = process.argv.includes("--ai");

// Load backend/.env so GEMINI_API_KEYS is available for the --ai run
// (standalone scripts don't get the server's dotenv bootstrap otherwise).
if (aiEnabled) await import("dotenv/config");

// Keep Gemini truly off for the forensic-only run (so it is reproducible).
if (!aiEnabled) process.env.GEMINI_API_KEYS = "";

const { computeMetrics } = await import("../src/detect/metricsStore.ts");

console.log(`\nRunning detection benchmark (AI ${aiEnabled ? "ENABLED" : "disabled"})...\n`);
const m = await computeMetrics({ aiEnabled });

const pct = (x) => `${(x * 100).toFixed(1)}%`;
const { tp, tn, fp, fn } = m.confusion;

console.log(`=== PramaanSetu Detection-Performance Benchmark ===`);
console.log(`Dataset : ${m.dataset}  (n=${m.n})`);
console.log(`Note    : ${m.datasetNote}`);
console.log(`Detector: vision model ${m.aiEnabled ? "+ forensics" : "OFF (forensics only)"} · threshold score>=${m.decisionThreshold}\n`);

console.log(`Confusion matrix`);
console.log(`                 pred synthetic   pred authentic`);
console.log(`  actual synth      TP ${String(tp).padStart(3)}         FN ${String(fn).padStart(3)}`);
console.log(`  actual authentic  FP ${String(fp).padStart(3)}         TN ${String(tn).padStart(3)}\n`);

console.log(`  Accuracy    ${pct(m.accuracy)}`);
console.log(`  Precision   ${pct(m.precision)}   (of flagged-synthetic, how many were)`);
console.log(`  Recall      ${pct(m.recall)}   (of real synthetic, how many caught)`);
console.log(`  Specificity ${pct(m.specificity)}   (of real authentic, how many cleared)`);
console.log(`  F1          ${pct(m.f1)}\n`);

if (m.dataset === "illustrative") {
  console.log("NOTE: illustrative synthetic set. For the submission figure, drop real");
  console.log("deepfakes/photos into backend/datasets/detection/{synthetic,authentic} and re-run.\n");
}
console.log(`Wrote backend/data/detection-metrics.json (served at GET /api/detection/metrics).\n`);
