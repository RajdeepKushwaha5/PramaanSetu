import { Router } from "express";
import { getStore } from "../db/store.js";
import { env } from "../config/env.js";
import type { EntityClass } from "../db/types.js";
import { generateApiKey, generateIssuerKeys } from "../crypto/signing.js";
import { signContent } from "../services/signingService.js";
import { makeDemoBundle } from "../services/demoAssets.js";
import { makeDemoVideos } from "../services/demoVideo.js";
import { makeDemoAudio } from "../services/demoAudio.js";

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

// A small "public corpus": representative official communications, fingerprinted
// so a forged/altered version of any of them is detectable with zero issuer
// onboarding. In production a crawler ingests the full public SEBI/exchange
// corpus; here we seed a representative set.
const SEED_ANNOUNCEMENTS = [
  { reg: "SEBI-IND-0001", title: "Investor Advisory: Beware of Fake Trading Apps", text: "SEBI advises investors to deal only with registered intermediaries. Verify UPI handles ending in @valid before any payment. SEBI never guarantees returns.", url: "https://www.sebi.gov.in" },
  { reg: "SEBI-IND-0001", title: "SEBI Check: Verify Intermediary UPI and Bank Details", text: "Before paying any intermediary, verify the UPI ID, bank account and IFSC using SEBI Check on the SEBI SCORES / SAARTHI app.", url: "https://www.sebi.gov.in" },
  { reg: "SEBI-IND-0001", title: "Caution against Deepfake and Impersonation Content", text: "SEBI cautions investors against deepfake videos and social media posts impersonating SEBI officials, exchanges and market experts promising assured returns.", url: "https://www.sebi.gov.in" },
  { reg: "SEBI-IND-0001", title: "Master Circular for Stock Brokers", text: "Consolidated directions applicable to stock brokers, including client funds, reporting obligations and technology governance.", url: "https://www.sebi.gov.in" },
  { reg: "SEBI-IND-0001", title: "Advisory on Unregistered Investment Advisers", text: "Investors are advised to deal only with SEBI-registered investment advisers. Verify registration on the SEBI website before acting on any advice.", url: "https://www.sebi.gov.in" },
  { reg: "NSE-EXCH-0002", title: "NSE Circular: Revised Trading Hours", text: "NSE notifies revised trading hours effective next settlement cycle. Members are advised to update systems accordingly.", url: "https://www.nseindia.com" },
  { reg: "NSE-EXCH-0002", title: "NSE Circular: Verified Trading App Advisory", text: "NSE advises investors to download trading applications only from official app stores and verified member sources.", url: "https://www.nseindia.com" },
  { reg: "NSE-EXCH-0002", title: "NSE Circular: Margin Reporting Framework Update", text: "Members are notified of updates to the margin reporting framework effective from the next settlement cycle.", url: "https://www.nseindia.com" },
  { reg: "NSE-EXCH-0002", title: "NSE Circular: Guidance on Social Media Solicitation", text: "Members shall not solicit clients through unverified social media channels promising assured returns.", url: "https://www.nseindia.com" },
  { reg: "INE002A01018", title: "RIL Q1 Results Announcement", text: "Reliance Industries announces Q1 results. Official disclosures are available only on the exchange filing portal.", url: "https://www.ril.com" },
  { reg: "INE002A01018", title: "RIL Investor Notice: Beware of Fake Dividend Messages", text: "Reliance Industries cautions shareholders against fraudulent messages requesting payment to claim dividends or bonus shares.", url: "https://www.ril.com" },
  { reg: "INE002A01018", title: "RIL Board Meeting Intimation", text: "Intimation of the board meeting to consider and approve financial results. Official filings are on the exchange portals only.", url: "https://www.ril.com" },
];

// Demo reset: wipe the store so a recording can start from a clean state.
// Gated exactly like seeding (demo mode, or the admin key).
seedRouter.post("/reset", (req, res) => {
  if (!env.demoMode && req.header("x-admin-key") !== env.adminApiKey) {
    res.status(403).json({ error: "Reset is disabled in production without the admin key." });
    return;
  }
  getStore().reset();
  res.json({ message: "Store reset.", stats: getStore().stats() });
});

seedRouter.post("/", async (req, res) => {
  // Seeding mints signing identities, so it is gated: allowed in demo mode, or
  // with the admin key. Disabled by default in production.
  if (!env.demoMode && req.header("x-admin-key") !== env.adminApiKey) {
    res.status(403).json({ error: "Seeding is disabled in production without the admin key." });
    return;
  }
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
        // Pre-approved demo identities: real key material, but identity is not
        // externally validated against SEBI's registry yet.
        trustLevel: "demo",
        demoIssuer: true,
        registrationSource: s.registrationSource,
        apiKey: generateApiKey(),
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

  // 3) A signed "official circular" as both image and PDF + demo variants.
  const sebi = store.getIssuerBySebiReg("SEBI-IND-0001")!;
  const bundle = await makeDemoBundle();
  const circularTitle = "SEBI Master Circular (demo image)";
  if (!store.listAssets().some((x) => x.title === circularTitle)) {
    await signContent({
      issuerId: sebi.id,
      title: circularTitle,
      mimeType: "image/png",
      bytes: bundle.originalPng,
      authoritativeUrl: "https://www.sebi.gov.in",
    });
    signed.push(circularTitle);
  }
  const pdfTitle = "SEBI Master Circular (demo PDF)";
  if (!store.listAssets().some((x) => x.title === pdfTitle)) {
    await signContent({
      issuerId: sebi.id,
      title: pdfTitle,
      mimeType: "application/pdf",
      bytes: bundle.originalPdf,
      authoritativeUrl: "https://www.sebi.gov.in",
    });
    signed.push(pdfTitle);
  }

  // 4) A signed video (if FFmpeg is available) for the voice-clone demo.
  const demoVideos: Record<string, string> = {};
  const videos = makeDemoVideos();
  if (videos) {
    const videoTitle = "SEBI official video statement (demo)";
    if (!store.listAssets().some((x) => x.title === videoTitle)) {
      await signContent({
        issuerId: sebi.id,
        title: videoTitle,
        mimeType: "video/mp4",
        bytes: videos.originalMp4,
        authoritativeUrl: "https://www.sebi.gov.in",
      });
      signed.push(videoTitle);
    }
    demoVideos.original_mp4_expect_original = videos.originalMp4.toString("base64");
    demoVideos.compressed_mp4_expect_derivative = videos.compressedMp4.toString("base64");
    demoVideos.voiceclone_mp4_expect_altered = videos.clonedMp4.toString("base64");
  }

  // 5) A signed audio advisory (if FFmpeg is available) for audio provenance.
  const audio = makeDemoAudio();
  if (audio) {
    const audioTitle = "SEBI audio advisory (demo)";
    if (!store.listAssets().some((x) => x.title === audioTitle)) {
      await signContent({
        issuerId: sebi.id,
        title: audioTitle,
        mimeType: "audio/mp4",
        bytes: audio.originalM4a,
        authoritativeUrl: "https://www.sebi.gov.in",
      });
      signed.push(audioTitle);
    }
    demoVideos.original_m4a_expect_original = audio.originalM4a.toString("base64");
    demoVideos.compressed_m4a_expect_derivative = audio.compressedM4a.toString("base64");
    demoVideos.unrelated_m4a_expect_unverified = audio.unrelatedM4a.toString("base64");
  }

  res.json({
    message: "Seed complete.",
    newlySigned: signed,
    stats: store.stats(),
    ffmpeg: !!videos,
    demoImages: {
      note: "Use these with POST /api/verify to see each verdict.",
      original_png_expect_original: bundle.originalPng.toString("base64"),
      compressed_jpg_expect_derivative: bundle.compressedJpg.toString("base64"),
      altered_png_expect_altered: bundle.alteredPng.toString("base64"),
      original_pdf_expect_original: bundle.originalPdf.toString("base64"),
      altered_pdf_expect_altered: bundle.alteredPdf.toString("base64"),
      ...demoVideos,
    },
  });
});
