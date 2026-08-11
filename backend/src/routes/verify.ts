import { Router } from "express";
import { z } from "zod";
import { verifyContent } from "../services/verificationService.js";
import { resolveMime, withinUploadLimit, UPLOAD_TOO_LARGE_MESSAGE } from "../util/media.js";

export const verifyRouter = Router();

const bodySchema = z.object({
  mimeType: z.string().default("text/plain"),
  content: z.string().optional(), // base64 for media
  text: z.string().optional(),
});

verifyRouter.post("/", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    return;
  }
  const { mimeType, content, text } = parsed.data;
  if (!content && !text) {
    res.status(400).json({ error: "Provide 'content' (base64) or 'text'." });
    return;
  }

  try {
    let bytes: Buffer | undefined;
    let resolvedMime = mimeType;
    if (content) {
      bytes = Buffer.from(content, "base64");
      if (!withinUploadLimit(bytes)) {
        res.status(413).json({ error: UPLOAD_TOO_LARGE_MESSAGE });
        return;
      }
      const check = await resolveMime(bytes);
      if (!check.ok) {
        res.status(415).json({ error: check.reason });
        return;
      }
      resolvedMime = check.mime; // trust content, not the browser
    }
    const result = await verifyContent({ mimeType: resolvedMime, bytes, text });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
