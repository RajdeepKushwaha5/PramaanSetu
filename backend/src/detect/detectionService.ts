/**
 * Synthetic-media detection orchestrator.
 *
 * Runs on UNSIGNED media (no provenance match) to answer the other half of the
 * problem statement: "is this content itself AI-generated / a deepfake?". It
 * combines a vision/audio model opinion with deterministic forensics so a
 * verdict still appears when the model is rate-limited.
 *
 * Weighting: when both are available the model leads (0.68) and forensics
 * corroborate (0.32); either alone is used directly, with forensic-only capped
 * so heuristics never over-convict a real photo.
 */

import type { MediaType } from "../db/types.js";
import { extFromMime } from "../fingerprint/index.js";
import { env } from "../config/env.js";
import type { InlineImage } from "../ai/geminiClient.js";
import {
  detectSyntheticImage,
  detectSyntheticFrames,
  detectSyntheticAudio,
  type AiDetection,
} from "./deepfakeVision.js";
import { imageForensics } from "./imageForensics.js";
import { audioForensics } from "./audioForensics.js";
import { extractFrames } from "./frames.js";
import { labelForScore, type DetectionSignal, type SyntheticAssessment, type SyntheticModality } from "./types.js";

const AI_WEIGHT = 0.68;
const FORENSIC_ONLY_CAP = 74;

function hasKeys(): boolean {
  return env.geminiKeys.length > 0;
}

interface Combined {
  score: number;
  aiAvailable: boolean;
  forensicAvailable: boolean;
  signals: DetectionSignal[];
  aiSummary: string | null;
}

function combine(
  ai: AiDetection | null,
  forensic: { score: number; signals: DetectionSignal[]; available: boolean } | null,
): Combined {
  const aiOk = !!ai;
  const fOk = !!forensic && forensic.available;
  const signals = [...(ai?.indicators ?? []), ...(forensic?.signals ?? [])];

  let score: number;
  if (aiOk && fOk) {
    score = Math.round(AI_WEIGHT * ai!.syntheticScore + (1 - AI_WEIGHT) * forensic!.score);
  } else if (aiOk) {
    score = ai!.syntheticScore;
  } else if (fOk) {
    score = Math.min(FORENSIC_ONLY_CAP, forensic!.score);
  } else {
    score = 0;
  }

  return { score, aiAvailable: aiOk, forensicAvailable: fOk, signals, aiSummary: ai?.summary ?? null };
}

function summarise(c: Combined, modality: SyntheticModality): string {
  if (!c.aiAvailable && !c.forensicAvailable) {
    return "Synthetic-media detection could not run on this file (no AI key configured and no deterministic signal available). Treat the content as unverified.";
  }
  const label = labelForScore(c.score);
  const noun =
    modality === "audio" ? "audio" : modality === "video" ? "video" : "image";
  const base =
    label === "likely-synthetic"
      ? `This ${noun} shows strong signs of being AI-generated or manipulated.`
      : label === "uncertain"
        ? `This ${noun} has some synthetic-media indicators but the evidence is mixed.`
        : `No strong synthetic-media indicators were found in this ${noun}, but it is still unverified.`;
  return c.aiSummary ? `${base} ${c.aiSummary}` : base;
}

function toInline(bytes: Buffer, mimeType: string): InlineImage {
  return { data: bytes.toString("base64"), mimeType };
}

async function safeAi<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.error("synthetic AI detection failed:", (e as Error).message);
    return null;
  }
}

export async function detectSynthetic(input: {
  mediaType: MediaType;
  bytes: Buffer;
  mimeType: string;
  /** Force the vision/audio model on or off (default: on when keys exist).
   *  The evaluation harness uses `false` for a deterministic forensic-only run. */
  aiEnabled?: boolean;
}): Promise<SyntheticAssessment> {
  const { bytes, mimeType } = input;
  const ext = extFromMime(mimeType);
  const modality = input.mediaType as SyntheticModality;
  const useAi = input.aiEnabled ?? hasKeys();

  let ai: AiDetection | null = null;
  let forensic: { score: number; signals: DetectionSignal[]; available: boolean } | null = null;
  let framesAnalysed: number | undefined;

  if (modality === "image") {
    const f = await imageForensics(bytes);
    forensic = { ...f, available: true };
    if (useAi) ai = await safeAi(() => detectSyntheticImage(toInline(bytes, mimeType)));
  } else if (modality === "video") {
    const frames = await extractFrames(bytes, ext, 4);
    framesAnalysed = frames.length;
    if (frames.length > 0) {
      // Forensics on the sharpest-available middle frame.
      const mid = frames[Math.floor(frames.length / 2)];
      const imgF = await imageForensics(mid);
      const audF = audioForensics(bytes, ext);
      forensic = {
        available: true,
        score: audF.available ? Math.round(0.6 * imgF.score + 0.4 * audF.score) : imgF.score,
        signals: [...imgF.signals, ...audF.signals],
      };
      if (useAi) {
        const inlineFrames = frames.map((fr) => toInline(fr, "image/png"));
        ai = await safeAi(() => detectSyntheticFrames(inlineFrames));
      }
    } else {
      // No FFmpeg: can't sample frames. Still try audio forensics on the bytes.
      const audF = audioForensics(bytes, ext);
      if (audF.available) forensic = audF;
    }
  } else if (modality === "audio") {
    const f = audioForensics(bytes, ext);
    if (f.available) forensic = f;
    if (useAi) ai = await safeAi(() => detectSyntheticAudio(toInline(bytes, mimeType)));
  }

  const c = combine(ai, forensic);
  return {
    modality,
    syntheticScore: c.score,
    label: labelForScore(c.score),
    aiAvailable: c.aiAvailable,
    forensicAvailable: c.forensicAvailable,
    signals: c.signals,
    summary: summarise(c, modality),
    framesAnalysed,
  };
}
