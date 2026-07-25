import { Router } from "express";
import { getStore } from "../db/store.js";
import type { EntityClass } from "../db/types.js";
import { generateIssuerKeys } from "../crypto/signing.js";
import { signContent } from "../services/signingService.js";
import { makeDemoBundle } from "../services/demoAssets.js";

export const seedRouter = Router();

interface SeedIssuer {
  name: string;
  sebiRegNo: string;
  entityClass: EntityClass;
  validUpiHandles: string[];
  registrationSource: string;
}

// Pre-provisioned, "validated" demo issuers. In production these identities
// would be verified against SEBI's registration records; here each carries the
// public source URL where its registration can be checked.
const SEED_ISSUERS: SeedIssuer[] = [
  { name: "Securities and Exchange Board of India", sebiRegNo: "SEBI-IND-0001", entityClass: "sebi", validUpiHandles: ["sebi@valid"], registrationSource: "https://www.sebi.gov.in" },
  { name: "National Stock Exchange", sebiRegNo: "NSE-EXCH-0002", entityClass: "exchange", validUpiHandles: ["nse@valid"], registrationSource: "https://www.nseindia.com" },
  { name: "Reliance Industries Ltd", sebiRegNo: "INE002A01018", entityClass: "listed_company", validUpiHandles: ["rilinvestor@valid"], registrationSource: "https://www.bseindia.com/stock-share-price/reliance-industries-ltd" },
];

const SEED_ANNOUNCEMENTS = [
  {
    reg: "SEBI-IND-0001",
    title: "Investor Advisory: Beware of Fake Trading Apps",
    text: "SEBI advises investors to deal only with registered intermediaries. Verify UPI handles ending in @valid before any payment. SEBI never guarantees returns.",
    url: "https://www.sebi.gov.in/advisory",
  },
  {
    reg: "NSE-EXCH-0002",
    title: "NSE Circular: Revised Trading Hours",
    text: "NSE notifies revised trading hours effective next settlement cycle. Members are advised to update systems accordingly.",
    url: "https://www.nseindia.com/circulars",
  },
  {
    reg: "INE002A01018",
    title: "RIL Q1 Results Announcement",
    text: "Reliance Industries announces Q1 results. Official disclosures are available only on the exchange filing portal.",
    url: "https://www.ril.com/investors",
  },
];

seedRouter.post("/", async (_req, res) => {
  const store = getStore();

  // 1) Issuers (idempotent by SEBI reg no).
  for (const s of SEED_ISSUERS) {
    if (!store.getIssuerBySebiReg(s.sebiRegNo)) {
      const keys = generateIssuerKeys();
      store.addIssuer({
        name: s.name,
        sebiRegNo: s.sebiRegNo,
        entityClass: s.entityClass,
        validUpiHandles: s.validUpiHandles,
        trustLevel: "validated",
        registrationSource: s.registrationSource,
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
      });
    }
  }

  const signed: string[] = [];

  // 2) Text announcements.
  for (const a of SEED_ANNOUNCEMENTS) {
    const issuer = store.getIssuerBySebiReg(a.reg)!;
    const exists = store.listAssets().some((x) => x.title === a.title);
    if (!exists) {
      await signContent({
        issuerId: issuer.id,
        title: a.title,
        mimeType: "text/plain",
        text: a.text,
        authoritativeUrl: a.url,
      });
      signed.push(a.title);
    }
  }

  // 3) A signed "official circular" image + return demo variants for testing.
  const sebi = store.getIssuerBySebiReg("SEBI-IND-0001")!;
  const bundle = await makeDemoBundle();
  const circularTitle = "SEBI Master Circular (demo image)";
  if (!store.listAssets().some((x) => x.title === circularTitle)) {
    await signContent({
      issuerId: sebi.id,
      title: circularTitle,
      mimeType: "image/png",
      bytes: bundle.originalPng,
      authoritativeUrl: "https://www.sebi.gov.in/circulars",
    });
    signed.push(circularTitle);
  }

  res.json({
    message: "Seed complete.",
    newlySigned: signed,
    stats: store.stats(),
    demoImages: {
      note: "Use these with POST /api/verify to see each verdict.",
      original_png_expect_original: bundle.originalPng.toString("base64"),
      compressed_jpg_expect_derivative: bundle.compressedJpg.toString("base64"),
      altered_png_expect_altered: bundle.alteredPng.toString("base64"),
    },
  });
});
