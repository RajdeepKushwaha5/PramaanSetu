/**
 * Detection-performance evaluation.
 *
 * Runs the synthetic-media detector over a LABELLED corpus and reports standard
 * classification metrics (confusion matrix, accuracy, precision, recall, F1,
 * specificity). This is the evidence PS1 explicitly asks for — "clear evidence
 * of detection or authentication performance" — turning "we call a model" into
 * "we measured N samples and here is the confusion matrix".
 *
 * The corpus is dataset-driven: point it at a held-out set of real deepfakes and
 * real photos (see sampleCorpus) and the numbers are real. A built-in
 * illustrative set keeps the harness runnable out of the box, clearly labelled
 * so nobody mistakes it for a held-out benchmark.
 */

import { detectSynthetic } from "./detectionService.js";
import type { MediaType } from "../db/types.js";

export type Label = "authentic" | "synthetic";

export interface LabeledSample {
  id: string;
  label: Label;
  bytes: Buffer;
  mimeType: string;
  mediaType: MediaType;
  note?: string; // e.g. "hard case: smooth authentic photo"
}

export interface Confusion {
  tp: number; // synthetic predicted synthetic
  tn: number; // authentic predicted authentic
  fp: number; // authentic predicted synthetic (false alarm)
  fn: number; // synthetic predicted authentic (missed)
}

export interface DetectionMetrics {
  generatedAt: string;
  dataset: "held-out" | "illustrative";
  datasetNote: string;
  aiEnabled: boolean;
  decisionThreshold: number; // score >= threshold => predicted synthetic
  n: number;
  confusion: Confusion;
  accuracy: number;
  precision: number;
  recall: number; // sensitivity / TPR
  specificity: number; // TNR
  f1: number;
  perSample: {
    id: string;
    label: Label;
    predicted: Label;
    score: number;
    correct: boolean;
    note?: string;
  }[];
}

/**
 * score >= this => predicted "synthetic" (i.e. NOT cleared as authentic).
 * 34 is the product's real operating point: labelForScore clears content as
 * "likely-authentic" only below 34, so anything >=34 is treated as flagged.
 */
export const DECISION_THRESHOLD = 34;

function ratio(numer: number, denom: number): number {
  return denom === 0 ? 0 : numer / denom;
}

export async function evaluateDetector(
  samples: LabeledSample[],
  opts: { dataset: "held-out" | "illustrative"; datasetNote: string; aiEnabled: boolean; threshold?: number },
): Promise<DetectionMetrics> {
  const threshold = opts.threshold ?? DECISION_THRESHOLD;
  const confusion: Confusion = { tp: 0, tn: 0, fp: 0, fn: 0 };
  const perSample: DetectionMetrics["perSample"] = [];

  for (const s of samples) {
    const assessment = await detectSynthetic({
      mediaType: s.mediaType,
      bytes: s.bytes,
      mimeType: s.mimeType,
      aiEnabled: opts.aiEnabled,
    });
    const predicted: Label = assessment.syntheticScore >= threshold ? "synthetic" : "authentic";
    const correct = predicted === s.label;

    if (s.label === "synthetic" && predicted === "synthetic") confusion.tp++;
    else if (s.label === "authentic" && predicted === "authentic") confusion.tn++;
    else if (s.label === "authentic" && predicted === "synthetic") confusion.fp++;
    else confusion.fn++;

    perSample.push({ id: s.id, label: s.label, predicted, score: assessment.syntheticScore, correct, note: s.note });
  }

  const { tp, tn, fp, fn } = confusion;
  const accuracy = ratio(tp + tn, tp + tn + fp + fn);
  const precision = ratio(tp, tp + fp);
  const recall = ratio(tp, tp + fn);
  const specificity = ratio(tn, tn + fp);
  const f1 = ratio(2 * precision * recall, precision + recall);

  return {
    generatedAt: new Date().toISOString(),
    dataset: opts.dataset,
    datasetNote: opts.datasetNote,
    aiEnabled: opts.aiEnabled,
    decisionThreshold: threshold,
    n: samples.length,
    confusion,
    accuracy: round(accuracy),
    precision: round(precision),
    recall: round(recall),
    specificity: round(specificity),
    f1: round(f1),
    perSample,
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
