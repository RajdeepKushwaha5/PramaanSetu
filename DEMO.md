# PramaanSetu — Demo Script (5–7 minutes)

**The one line to open and close with:**
> "Generative AI broke trust in the securities market in two ways: it lets
> scammers *fake* official communications, and it removed any way to *prove* the
> real ones. PramaanSetu does both — it **detects** synthetic media and phishing,
> and it **proves** what is genuinely from SEBI. Cryptography for what's official;
> AI to catch what isn't."

The organisers set a **5–7 minute** demo video (jury round is virtual). Keep the
whole demo inside this one story — don't show a feature unless it's a beat below.

---

## Before you start (off-screen)

1. `npm run dev` from the repo root. Wait for both services.
2. Open **http://localhost:3000** — pick a role at the mock-login card (demo
   login, no password). Start as **Investor**.
3. Open **/issuer** → click **"initialise demo registry"** (seeds issuers + a
   public corpus of signed circulars, an image/PDF/video, and detection samples).
4. Confirm capabilities: `http://localhost:4000/api/health` shows
   `videoFingerprint: true, audioFingerprint: true, aiRiskEngine: true`.
5. Have one **real AI-generated face** saved locally for the deepfake beat
   (e.g. from thispersondoesnotexist.com) and, optionally, a real photo.
6. (Optional) Telegram bot open on your phone for the finale.

---

## The sequence

**1. The problem (25s).** "A scammer can forge a SEBI circular, swap a payment QR,
or deepfake the SEBI chairman on video. Investors have no way to tell real from
fake — and detectors alone just *guess*. We attack it from both sides."

**2. Who's using it (15s) — mock roles.** From the header, show the role switch:
**Investor** (verify), **Issuer** (sign), **Regulator** (radar). "One rail, three
personas. Mock login for the demo; the flows are real."

**3. Sign — the trust rail (30s).** Switch to **Issuer**. On **/issuer**, sign a
short official notice. Show the receipt: content hash, **Ed25519 signature**,
transparency-log entry. "SEBI signs once. Now anything can be checked against it."

**4. Verify genuine — show the crypto (35s).** As **Investor** on **/verify**,
upload the **genuine image** sample (or the exact signed text). Verdict:
**Verified Original**. Point at the **Cryptographic Trust Chain**:
identity → SHA-256 → Ed25519 → transparency log → status → evidence.
"This is not AI. Every link is cryptographic proof."

**5. Catch the swapped QR (30s).** Click **"forged QR · PDF"**. Verdict:
**Altered** — and it *names the fraud payee* (`fraudster12@ybl`). "Identical
document, but the payment QR was swapped. We caught it and named the UPI."

**6. Catch the voice clone (30s).** Click **"voice-cloned video"**. Verdict:
**Altered** — "video frames match a genuine communication, but the AUDIO was
replaced." "Same face, cloned voice. Frames match the real video; the audio
doesn't. A dubbed deepfake, caught."

**7. DETECT a deepfake with no provenance (45s) — the new half.** Switch to
**media** input and upload the **real AI-generated face**. No signed record
exists, so PramaanSetu runs **synthetic-media detection**: the panel shows a
high **synthetic score**, the **vision model's** indicators (over-smooth skin,
warped detail…) *and* **deterministic forensic** signals — "two independent
layers, so we still return a verdict if the model is offline." Then click the
**"camera-like · detection"** sample → it stays **authentic**. "Crucially, it
doesn't cry wolf on a real photo."

**8. AI phishing on text (20s).** Switch to **message**, click **"load a known
scam pattern"**, verify. **Unverified + AI risk (critical)**, with extracted
UPI/phone/links. "No signed record, so now the AI reads the language — and it
never calls anything safe."

**9. Regulator intelligence (40s).** Switch to **Regulator** → **/dashboard**.
Show the campaign that formed and the **SYNTHETIC** counter. Click a **UPI
handle** — campaigns filter to everything sharing it. "Every report becomes a
sensor; shared indicators link scams into one campaign." Click **"export
evidence"** — a signed, tamper-evident pack.

**10. Revocation (15s).** Back as **Issuer**, on a signed record click **"revoke
record"**, then re-verify → **Revoked**. "Issuers stay in control."

**11. Close (20s).** "SEBI's @valid handles protect the *payment*. PramaanSetu
protects everything *before* it — the message, the document, the video that
convinced the victim to pay. It **detects** the fake and **proves** the real."

---

## If a judge tests with their own data

The organisers said the jury may upload their own samples. That's fine:
- **A real deepfake/AI image or synthetic voice** → the detection panel scores it
  and explains why (vision/audio model + forensics).
- **A real photo or a genuine document** → it should *not* be flagged synthetic;
  restraint is a feature.
- **An unknown but genuine SEBI file** → "Unverified" until an issuer signs it —
  we never fake a provenance match.

## If a judge asks "is this production-ready?"

> "It's a working prototype that proves the mechanism end-to-end. For production
> the trust chain has to be airtight: issuer identity validated against SEBI's
> real registry, keys in HSM/KMS, evidence anchored to a regulator-controlled
> key, a public Merkle log, and PostgreSQL behind it. The synthetic detectors
> would add fine-tuned deepfake models. None of it changes the architecture —
> they're known swaps, listed in the README's *Path to production* table."

## If asked about detection / accuracy

> "Two layers. Provenance is exact — on common real-world forwards (WhatsApp
> compression, screenshots, scaling) recognition is 100% with zero false matches
> (`npm run benchmark:real`); crop/rotation is the known gap. Synthetic
> detection combines a vision/audio model with deterministic forensics (ELA,
> noise uniformity, spectral stability) so a verdict survives a model outage —
> our tests assert it separates AI-render-like from camera-like media with no
> false alarm. Backend dependency audit is clean."

## Backup / gotchas

- Blank page after a big code change: stop the server, delete `frontend/.next`,
  restart (stale RSC cache).
- Video/audio need FFmpeg (`FFMPEG_PATH` in `backend/.env`). Without it, image /
  PDF / text still work, and forensic-only synthetic detection still runs.
- The dashboard is empty until you verify something — do the verify beats first.
- The two built-in "detection" samples are abstract renders: they exercise the
  **forensic** layer and the detector's restraint. For a high synthetic score on
  camera, upload a **real** AI face — that's what lights up the vision model.
