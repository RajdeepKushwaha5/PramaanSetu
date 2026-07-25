import { Router } from "express";
import { z } from "zod";
import { assessRisk } from "../ai/riskEngine.js";
import { assertGeminiConfigured } from "../config/env.js";

export const riskRouter = Router();

const bodySchema = z.object({
  text: z.string().optional(),
  image: z
    .object({
      data: z.string(), // base64, no data: prefix
      mimeType: z.string(),
    })
    .optional(),
});

riskRouter.post("/", async (req, res) => {
  try {
    assertGeminiConfigured();
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
    return;
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Validation failed", issues: parsed.error.issues });
    return;
  }
  if (!parsed.data.text && !parsed.data.image) {
    res.status(400).json({ error: "Provide 'text' and/or 'image'." });
    return;
  }

  try {
    const assessment = await assessRisk(parsed.data);
    res.json(assessment);
  } catch (e) {
    res
      .status(502)
      .json({ error: "Risk analysis failed", detail: (e as Error).message });
  }
});
