import { Router } from "express";
import { z } from "zod";
import { getStore } from "../db/store.js";
import { env } from "../config/env.js";

export const revokeRouter = Router();

const bodySchema = z.object({
  assetId: z.string(),
  revoked: z.boolean().default(true),
});

/**
 * Issuer-facing revocation. An issuer can withdraw a previously signed
 * communication; verification then returns the `revoked` verdict. Authorised
 * the same way as signing: the issuer's key, or (demo mode) a pre-approved
 * demo issuer.
 */
revokeRouter.post("/", (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    return;
  }
  const store = getStore();
  const asset = store.getAsset(parsed.data.assetId);
  if (!asset) {
    res.status(404).json({ error: "Unknown asset." });
    return;
  }
  const issuer = store.getIssuer(asset.issuerId);
  if (!issuer) {
    res.status(404).json({ error: "Issuer not found." });
    return;
  }

  const providedKey = req.header("x-issuer-key");
  if (providedKey) {
    if (providedKey !== issuer.apiKey) {
      res.status(401).json({ error: "Invalid issuer key for this issuer." });
      return;
    }
  } else if (!(env.demoMode && issuer.demoIssuer)) {
    res.status(401).json({ error: "Revocation requires the issuer's key (x-issuer-key)." });
    return;
  }

  const updated = store.setRevoked(asset.id, parsed.data.revoked);
  res.json({
    assetId: asset.id,
    title: asset.title,
    revoked: updated?.revoked ?? parsed.data.revoked,
  });
});
