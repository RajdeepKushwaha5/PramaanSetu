import { Router } from "express";
import { z } from "zod";
import { signContent } from "../services/signingService.js";
import { resolveMime, withinUploadLimit, UPLOAD_TOO_LARGE_MESSAGE } from "../util/media.js";
import { getStore } from "../db/store.js";
import { env } from "../config/env.js";

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

  // ---- Authorisation: signing must be bound to the issuer identity ----
  const issuer = getStore().getIssuer(issuerId);
  if (!issuer) {
    res.status(404).json({ error: "Unknown issuer." });
    return;
  }
  const providedKey = req.header("x-issuer-key");
  if (providedKey) {
    // A key was supplied - it MUST belong to this exact issuer.
    if (providedKey !== issuer.apiKey) {
      res.status(401).json({ error: "Invalid issuer key for this issuer." });
      return;
    }
  } else {
    // No key: only pre-approved demo issuers may sign keyless, and only in demo
    // mode. This closes the "anyone can sign as SEBI" hole in production.
    if (!(env.demoMode && issuer.demoIssuer)) {
      res.status(401).json({
        error: "Signing requires the issuer's key (x-issuer-key header).",
      });
      return;
    }
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
