/** Shared types for the synthetic-media detection layer. */

export type SyntheticModality = "image" | "video" | "audio";

export type SyntheticLabel =
  | "likely-authentic" // no strong synthetic indicators
  | "uncertain" // mixed / weak indicators — treat with caution
  | "likely-synthetic"; // strong AI-generation / deepfake indicators

export type SignalSource = "ai" | "forensic";

export interface DetectionSignal {
  source: SignalSource;
  label: string; // short tag, e.g. "over-smooth texture"
  detail: string; // one sentence
}

/**
 * Result of running the synthetic-media detector on unsigned content.
 * Higher `syntheticScore` = more likely AI-generated / manipulated.
 *
 * This is a DETECTION signal, never a proof. It sits alongside the phishing
 * `risk` assessment on content that has no signed provenance.
 */
export interface SyntheticAssessment {
  modality: SyntheticModality;
  syntheticScore: number; // 0-100
  label: SyntheticLabel;
  aiAvailable: boolean; // a vision/audio model contributed
  forensicAvailable: boolean; // deterministic forensics contributed
  signals: DetectionSignal[];
  summary: string;
  framesAnalysed?: number; // video only
}

export function labelForScore(score: number): SyntheticLabel {
  if (score >= 66) return "likely-synthetic";
  if (score >= 34) return "uncertain";
  return "likely-authentic";
}
