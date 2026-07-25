import { Router } from "express";
import { z } from "zod";
import { getStore } from "../db/store.js";
import type { EntityClass, Issuer } from "../db/types.js";
import { generateIssuerKeys } from "../crypto/signing.js";
import { env } from "../config/env.js";

export const issuersRouter = Router();

/** Never expose private keys. */
function publicIssuer(i: Issuer) {
  const { privateKey, publicKey, ...rest } = i;
  void privateKey;
  void publicKey;
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
  const issuer = getStore().addIssuer({
    name: parsed.data.name,
    sebiRegNo: parsed.data.sebiRegNo,
    entityClass: parsed.data.entityClass as EntityClass,
    validUpiHandles: parsed.data.validUpiHandles,
    trustLevel: "demo",
    registrationSource: null,
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
  });
  res.status(201).json(publicIssuer(issuer));
});
