/**
 * Vision/audio model detectors for AI-generated & deepfake media.
 *
 * These call Gemini with a detection-specific prompt (separate from the phishing
 * risk engine). They return a synthetic-likelihood score with explainable
 * indicators. Callers combine this with deterministic forensics.
 */

import { generate, parseJsonResponse, type InlineImage } from "../ai/geminiClient.js";
import type { DetectionSignal } from "./types.js";

export interface AiDetection {
  syntheticScore: number; // 0-100
  indicators: DetectionSignal[];
  summary: string;
  observed: string | null; // what the model thinks the medium is
}

interface RawDetection {
  syntheticScore?: number;
  indicators?: { label?: string; detail?: string }[];
  summary?: string;
  observed?: string | null;
}

function clamp(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(v)) return 50;
  return Math.min(100, Math.max(0, Math.round(v)));
}

function normalise(raw: RawDetection): AiDetection {
  return {
    syntheticScore: clamp(raw.syntheticScore),
    indicators: (raw.indicators ?? [])
      .filter((s) => s && (s.label || s.detail))
      .map((s) => ({
        source: "ai" as const,
        label: s.label ?? "indicator",
        detail: s.detail ?? "",
      })),
    summary: raw.summary ?? "Unable to fully analyse the media.",
    observed: raw.observed ?? null,
  };
}

const IMAGE_SYSTEM = `You are a forensic analyst specialising in AI-generated and deepfake imagery,
working in India's securities-market context (SEBI, exchanges, brokers, listed
companies). You are given an image that has NO verified provenance. Judge how
likely it was AI-GENERATED or DIGITALLY MANIPULATED (as opposed to a genuine
photograph or an authentic scanned/rendered document).

Weigh generation/deepfake artefacts such as:
- Over-smooth, waxy, or plastic skin and surfaces; missing pores/texture
- Warped, garbled, or nonsensical text and letterforms, broken logos
- Asymmetric or malformed eyes, teeth, ears, hands, fingers, jewellery
- Impossible or inconsistent lighting, shadows, and reflections
- Melting / incoherent backgrounds; objects that merge unnaturally
- Repeated or duplicated texture patches; GAN/diffusion grid artefacts
- Signs of face-swap: blending seams, mismatched skin tone at the jawline

IMPORTANT: an authentic official document, chart, or screenshot is NOT synthetic
just because it is computer-generated - only flag genuine AI-generation or
manipulation artefacts. When unsure, say so with a mid score.

Return ONLY valid JSON matching exactly:
{
  "syntheticScore": <integer 0-100, higher = more likely AI-generated/manipulated>,
  "observed": <short phrase: what the image appears to be, e.g. "portrait photo", "official circular", "chat screenshot">,
  "indicators": [{ "label": <short tag>, "detail": <one sentence of evidence> }],
  "summary": <2-3 sentence plain-English conclusion, hedged appropriately>
}`;

const AUDIO_SYSTEM = `You are a forensic analyst specialising in synthetic-voice and audio deepfakes,
working in India's securities-market context (impersonation of executives,
regulators, or advisers). You are given an audio clip with NO verified
provenance. Judge how likely the SPEECH is AI-GENERATED / voice-cloned / a
text-to-speech synthesis rather than a genuine human recording.

Weigh cues such as:
- Unnaturally even pacing, robotic prosody, flat or looping intonation
- Absent breaths, lip smacks, or natural disfluencies
- Too-clean signal with no room tone / background, or artefacty background
- Metallic, buzzy, or "underwater" timbre; consonant smearing
- Inconsistent room acoustics between words; abrupt energy changes

Return ONLY valid JSON matching exactly:
{
  "syntheticScore": <integer 0-100, higher = more likely synthetic/cloned>,
  "observed": <short phrase, e.g. "single male voice, studio-clean">,
  "indicators": [{ "label": <short tag>, "detail": <one sentence of evidence> }],
  "summary": <2-3 sentence plain-English conclusion, hedged appropriately>
}`;

/** Detect AI-generation / manipulation in a single image. */
export async function detectSyntheticImage(image: InlineImage): Promise<AiDetection> {
  const result = await generate({
    prompt: IMAGE_SYSTEM,
    images: [image],
    json: true,
    temperature: 0.1,
  });
  return normalise(parseJsonResponse<RawDetection>(result.text));
}

/**
 * Detect deepfake cues across several video frames in one call. The model sees
 * the frames as an ordered sequence and judges temporal/visual consistency.
 */
export async function detectSyntheticFrames(frames: InlineImage[]): Promise<AiDetection> {
  const prompt = `${IMAGE_SYSTEM}

You are given ${frames.length} FRAMES sampled in order from a single video. Judge
whether the video is a DEEPFAKE or AI-GENERATED clip. Also weigh cross-frame
cues: flickering identity, unstable facial geometry, warping at motion, and
inconsistent lighting between frames. Score the video as a whole.`;
  const result = await generate({
    prompt,
    images: frames,
    json: true,
    temperature: 0.1,
  });
  return normalise(parseJsonResponse<RawDetection>(result.text));
}

/** Detect synthetic/cloned speech in an audio clip. */
export async function detectSyntheticAudio(audio: InlineImage): Promise<AiDetection> {
  const result = await generate({
    prompt: AUDIO_SYSTEM,
    media: [audio],
    json: true,
    temperature: 0.1,
  });
  return normalise(parseJsonResponse<RawDetection>(result.text));
}
