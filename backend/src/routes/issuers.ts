import { Router } from "express";
import { z } from "zod";
import { getStore } from "../db/store.js";
import type { EntityClass, Issuer } from "../db/types.js";
import { generateApiKey, generateIssuerKeys } from "../crypto/signing.js";
import { env } from "../config/env.js";

export const issuersRouter = Router();

/** Never expose private keys or the signing API key. */
function publicIssuer(i: Issuer) {
  const { privateKey, publicKey, apiKey, ...rest } = i;
  void privateKey;
  void publicKey;
  void apiKey;
  return rest;
}

issuersRouter.get("/", (_req, res) => {
  res.json(getStore().listIssuers().map(publicIssuer));
});

const createSchema = z.object({
  name: z.string().min(2),
  sebiRegNo: z.string().min(3),
  entityClass: z.enum([
    "sebi",
    "exchange",
    "depository",
    "listed_company",
    "broker",
    "investment_adviser",
  ]),
  validUpiHandles: z.array(z.string()).default([]),
});

/**
 * Creating an issuer mints a signing identity, so it is privileged: it requires
 * the admin API key. Without ADMIN_API_KEY configured, public creation is
 * disabled entirely (the deployed demo relies on pre-provisioned issuers).
 * Issuers created this way are marked trustLevel "demo" — the cryptography then
 * only proves PramaanSetu generated the key, NOT that SEBI/NSE owns it.
 */
issuersRouter.post("/", (req, res) => {
  if (!env.adminApiKey) {
    res.status(403).json({
      error:
        "Public issuer creation is disabled. Issuers are pre-provisioned via /api/seed. Set ADMIN_API_KEY to enable.",
    });
    return;
  }
  if (req.header("x-admin-key") !== env.adminApiKey) {
    res.status(401).json({ error: "Invalid or missing x-admin-key." });
    return;
  }

  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", issues: parsed.error.issues });
    return;
  }
  const keys = generateIssuerKeys();
  const apiKey = generateApiKey();
  const issuer = getStore().addIssuer({
    name: parsed.data.name,
    sebiRegNo: parsed.data.sebiRegNo,
    entityClass: parsed.data.entityClass as EntityClass,
    validUpiHandles: parsed.data.validUpiHandles,
    trustLevel: "demo",
    demoIssuer: false, // ad-hoc issuers must authenticate signing with their key
    registrationSource: null,
    apiKey,
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  });
  // Return the signing key ONCE, to the admin who created it.
  res.status(201).json({ ...publicIssuer(issuer), apiKey });
});
