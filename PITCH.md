# PramaanSetu — Pitch & Q&A Playbook

The one sentence:
> **PramaanSetu is Digital Public Infrastructure for content authenticity in the
> securities market — a UPI/Aadhaar-style signed-provenance rail. SEBI and its
> regulated intermediaries sign what is official; any investor verifies it in one
> tap, on the web or inside WhatsApp/Telegram. AI only steps in to flag the fake
> when no proof exists.**

Open and close the demo on: **"Every other team built an AI that *guesses*
whether something is fake. We built the rail that makes the genuine *provable* —
and the fake obvious."**

---

## The problem (15s)
Generative AI lets scammers forge a SEBI circular, swap a payment QR, or deepfake
the SEBI chairman on video. SEBI's own problem statement names the deeper gap:
there is **no framework to verify that a communication is genuinely official.**
Detection alone is an arms race you lose as deepfakes improve.

## The thesis (why provenance beats detection)
Detection degrades — every new model generation fools yesterday's classifier.
**Provenance is decisive and doesn't degrade:** sign the genuine article once, and
any forgery is provably *not* it. So we lead with cryptographic proof
(Ed25519 + a tamper-evident log) and use AI only as the catch-net for content
that has no signed record.

## The framing that wins the room: DPI
Position it exactly like India's other public rails:
- **UPI** made payments interoperable public infrastructure.
- **Aadhaar** made identity verifiable public infrastructure.
- **PramaanSetu** makes *official communications* verifiable public
  infrastructure — a signed-provenance rail SEBI can operate for the market.

This reframes "it's a Gemini wrapper" into "it's DPI with an AI safety net."

---

## The hardest question — and the answer that must be automatic

**"Signed email (DKIM/S/MIME) existed for 20 years and phishing still thrives.
Why is yours different?"**

> "Two reasons, and they're the whole point.
>
> **One — mandate.** DKIM and S/MIME failed on *voluntary* adoption. SEBI is a
> **regulator with authority over every intermediary** — brokers, exchanges,
> listed companies, advisers. It can make signing a *compliance obligation*, the
> way it already mandates disclosures and @valid UPI handles. This isn't a
> standard hoping for uptake; it's infrastructure a regulator can compel.
>
> **Two — verification where the scam lives.** Those standards failed because
> victims never checked signatures in some settings screen. We put verification
> **inside WhatsApp and Telegram** — forward the suspicious message to the bot
> and get the verdict in the same chat the scam arrived in. No behaviour change,
> no new app to open."

Follow-up: **"How do you bootstrap before every issuer signs?"**
> "We don't wait. We crawl SEBI's and the exchanges' **public** circulars and
> fingerprint them, so a forged or altered version of any *existing* official
> communication is already detectable on day one — zero issuer onboarding.
> Issuer signing then layers on top for new communications."

---

## Evidence of performance (answer the 'is it real?' question)
- **Authentication is exact:** SHA-256 + Ed25519; a matched record is only
  reported genuine if its signature validates. On common real-world image
  forwards (WhatsApp compression, screenshots, scaling, small crops) recognition
  is 100% with **zero false matches** (`npm run benchmark:real`).
- **Detection is measured, not claimed:** a reproducible confusion-matrix harness
  (`npm run benchmark:detection`, live at `/api/detection/metrics` and on the
  dashboard) reports accuracy / precision / recall / specificity / F1. Run it on
  a held-out set of real deepfakes + real photos for the submission figure.
- **Backend dependency audit is clean;** see `SECURITY.md`.

## If asked "is it production-ready?"
> "It's a working reference prototype that proves the mechanism end to end. For
> production the swaps are known and listed in the README's *Path to production*:
> issuer identity against SEBI's registry, keys in HSM/KMS, a public Merkle log,
> PostgreSQL. None of it changes the architecture."

---

## The 5–7 minute demo (one story)
Sign → verify genuine (show the crypto trust chain) → catch a swapped payment QR
→ catch a voice-clone video → detect an unsigned deepfake → phishing text → the
SupTech radar links a campaign → export signed evidence → revoke. Full beat sheet
in [DEMO.md](DEMO.md). Open and close on the one line at the top of this file.

## Judging-criteria cheat sheet
- **Market impact:** protects the message/document/video *before* the payment —
  the layer @valid UPI handles don't cover.
- **Technology:** Ed25519 provenance + transparency log + multi-modal perceptual
  matching + a vision/audio deepfake detector with a measured confusion matrix.
- **Feasibility:** SEBI can mandate signing; verify-in-chat needs no behaviour
  change; public-corpus crawl bootstraps day one.
- **Scalability:** LSH index (~33–80× faster candidate search at 10k+ assets);
  Postgres/pgvector path documented.
- **Alignment:** authentication of official communications is the exact gap SEBI
  named as unsolved.
