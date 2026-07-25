import { Router } from "express";
import { z } from "zod";
import { signContent } from "../services/signingService.js";
import { resolveMime } from "../util/media.js";

export const signRouter = Router();

const bodySchema = z.object({
  issuerId: z.string(),
  title: z.string().min(1),
  mimeType: z.string().default("text/plain"),
  content: z.string().optional(), // base64 (no data: prefix) for media
  text: z.string().optional(), // for text communications
  expiresAt: z.string().nullable().optional(),
  authoritativeUrl: z.string().nullable().optional(),
});

signRouter.post("/", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    return;
  }
  const { issuerId, title, mimeType, content, text, expiresAt, authoritativeUrl } =
    parsed.data;
  if (!content && !text) {
    res.status(400).json({ error: "Provide 'content' (base64) or 'text'." });
    return;
  }

  try {
    let bytes: Buffer | undefined;
    let resolvedMime = mimeType;
    if (content) {
      bytes = Buffer.from(content, "base64");
      const check = await resolveMime(bytes);
      if (!check.ok) {
        res.status(415).json({ error: check.reason });
        return;
      }
      resolvedMime = check.mime;
    }
    const { asset, logEntry } = await signContent({
      issuerId,
      title,
      mimeType: resolvedMime,
      bytes,
      text,
      expiresAt: expiresAt ?? null,
      authoritativeUrl: authoritativeUrl ?? null,
    });
    res.status(201).json({
      assetId: asset.id,
      title: asset.title,
      mediaType: asset.mediaType,
      contentHash: asset.contentHash,
      perceptualHashes: asset.perceptualHashes,
      signature: asset.signature,
      manifest: asset.manifest,
      transparencyLog: { seq: logEntry.seq, entryHash: logEntry.entryHash },
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});
