# PramaanSetu Demo Video Script

**Target length:** 6 to 7 minutes

**Style:** Clear, confident, and conversational

**Main message:** Proof before persuasion.

## Opening line

> "A scammer can copy a logo, fake a circular, clone a voice, and replace a
> payment QR code. The result can look completely official. PramaanSetu gives
> investors something stronger than appearance. It proves what is genuine,
> detects what has been changed, and connects repeated fraud reports for the
> regulator."

## Before recording

1. Run `npm run dev` from the project root.
2. Open <http://localhost:3000>.
3. Choose the **Issuer** role and initialise the demo registry.
4. Confirm <http://localhost:4000/api/health> reports the backend as `ok`.
5. Keep the following tabs ready:
   - Overview: <http://localhost:3000>
   - Signing rail: <http://localhost:3000/issuer>
   - Investor verifier: <http://localhost:3000/verify>
   - SupTech radar: <http://localhost:3000/dashboard>
6. If Gemini is configured, confirm `aiRiskEngine` is `true` in the health
   response.
7. Save a **real AI-generated face** image locally for the synthetic-media step
   (e.g. from thispersondoesnotexist.com). The built-in samples deliberately do
   not include a fake "deepfake"; a real AI face is what the detector flags.
8. Clear any old filters on the SupTech radar.
9. Record at 1080p and keep browser zoom near 100 percent.

## Official problem links to show in the video

Show these links for a few seconds while explaining the problem. Do not read
the full URLs aloud. Add them as text in the video or place them in the video
description.

- [Official SEBI Securities Market TechSprint problem statement](https://www.globalfintechfest.com/gff-hackathons/sebi-techsprint)
- [SEBI Investor: How to spot a scam](https://investor.sebi.gov.in/spot-any-scam.html)
- [SEBI caution to investors](https://investor.sebi.gov.in/cautiontoinvestor.html)
- [SEBI Validated UPI Handles circular](https://www.sebi.gov.in/legal/circulars/jun-2025/adoption-of-standardised-validated-and-exclusive-upi-ids-for-payment-collection-by-sebi-registered-intermediaries-from-investors_94535.html)
- [SEBI Check and Validated UPI Handles](https://www.sebi.gov.in/media-and-notifications/press-releases/oct-2025/sebi-rolls-out-validated-upi-handles-and-sebi-check-for-secure-investor-payments_97020.html)
- [SEBI recognised intermediaries directory](https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognised=yes)

The official TechSprint problem asks teams to detect deepfakes, AI phishing,
and synthetic media targeting investors, while also verifying whether official
financial communications are genuine. PramaanSetu addresses both parts.

---

## Full recording script

### 0:00 to 0:30 | The hook

**On screen:** Start with a genuine-looking circular or the forged QR sample.
Then show the official TechSprint problem statement link.

**Say:**

> "This document looks like an official securities-market communication. It
> uses the right name, the right colours, and a professional payment QR code.
> But one small change can send an investor's money to a scammer.
>
> This is the problem defined by the SEBI Securities Market TechSprint: detect
> synthetic media and phishing attacks, and verify whether official financial
> communications are actually genuine.
>
> Today, investors are often asked to judge trust from appearance. In the age
> of generative AI, appearance is no longer proof."

**On-screen caption:** `A logo can be copied. A source must be proven.`

### 0:30 to 1:05 | The solution

**On screen:** Open the PramaanSetu overview page. Let the trust-flow diagram
play through two or three steps.

**Say:**

> "This is PramaanSetu, a trust layer for securities-market communications.
> It is designed around one simple rule: prove the genuine communication first,
> and use AI only when signed proof does not exist.
>
> It serves three users. An issuer signs an official communication. An investor
> verifies a suspicious message or file. A regulator sees repeated fraud
> reports as connected campaigns.
>
> The complete flow is sign, verify, detect, warn, link, and respond."

**Point to the diagram while saying:**

> "The moving token shows the same trust event travelling through the whole
> system, from content intake to verification, investor warning, evidence, and
> campaign intelligence."

### 1:05 to 1:50 | Killer feature 1: make genuine content provable

**On screen:** Switch to the **Issuer** role and open the signing rail. Enter a
short title and message, then select **sign and register**.

Suggested message:

```text
Investor advisory: SEBI never guarantees investment returns. Verify every
intermediary and payment handle before transferring money.
```

**Say:**

> "First, an issuer registers an official communication before distributing
> it. PramaanSetu creates a SHA-256 content hash. It builds a provenance
> manifest containing the issuer, publication time, content identity, and
> approved payment information. The manifest is signed using Ed25519 and added
> to a tamper-evident transparency chain.
>
> The receipt contains the content hash, signature, asset ID, and transparency
> log entry. If even one byte changes, the exact hash changes. If the issuer
> signature or transparency chain fails, PramaanSetu will not call the content
> genuine."

**On-screen caption:** `SHA-256 binding + Ed25519 issuer proof + transparency log`

### 1:50 to 2:25 | Killer feature 2: verify the genuine communication

**On screen:** Select **verify a copy**, or switch to the Investor role and
paste the exact signed message. Run verification.

**Say:**

> "Now I am the investor. I submit the same content, and PramaanSetu returns
> Verified Original.
>
> This result does not come from an AI guess. The system found the exact
> content hash, validated the issuer's Ed25519 signature, checked revocation and
> expiry, and verified the transparency chain.
>
> AI can be uncertain. Cryptographic proof is deterministic. That is the main
> difference between PramaanSetu and a normal fake-content classifier."

**Point to:** issuer identity, signature status, content hash, log integrity,
and official source when available.

### 2:25 to 3:00 | Killer feature 3: catch a swapped payment QR

**On screen:** Load the built-in **forged QR PDF** sample and run verification.

**Say:**

> "Now I will verify a forwarded copy that looks almost identical to a signed
> circular. The layout still matches the genuine document, but the payment QR
> has been replaced.
>
> PramaanSetu first finds the related signed document using perceptual
> fingerprints. It then decodes the QR and compares the UPI payee with the
> issuer's approved payment handles.
>
> The verdict is Altered, and the system names the suspicious payee,
> fraudster12@ybl. It does not only say that something looks unusual. It tells
> the investor what changed and why they should not pay."

**On-screen caption:** `Genuine document detected. Payment destination altered.`

### 3:00 to 3:30 | Killer feature 4: detect voice replacement

**On screen:** Load the built-in **voice-cloned video** sample.

**Say:**

> "The same idea also works across media. In this video, the visual frames
> match a signed communication, but the audio track has been replaced.
>
> PramaanSetu compares sampled video frames and an audio spectrogram
> fingerprint. It identifies that the face and video came from the genuine
> source, while the voice did not.
>
> The result is an Altered verdict with an audio-replacement warning. This is
> useful for dubbed misinformation and voice-clone attacks."

### 3:30 to 4:15 | Killer feature 5: synthetic media and AI phishing

**On screen:** In the media input, **upload a real AI-generated face** (saved
beforehand — see the prep checklist) and run verification; the synthetic-media
panel shows a high synthetic score with model + forensic signals. Then switch to
message input, load the known scam pattern, and verify it.

**Say:**

> "What happens when no signed record exists? PramaanSetu stays honest. It
> returns Unverified. It never invents provenance and never calls unknown
> content genuine.
>
> For unsigned images, video, and audio, the synthetic-media layer combines AI
> analysis with deterministic forensic signals such as compression residuals,
> noise patterns, frame consistency, and audio stability. The result is a risk
> signal with an explanation, not a claim of cryptographic proof.
>
> For a suspicious message, the AI risk engine looks for impersonation,
> guaranteed-return language, urgency, payment requests, phone numbers, domains,
> and UPI handles. These indicators are saved for campaign correlation.
>
> This gives PramaanSetu two separate answers: cryptography answers, 'Is this
> official?' AI and forensics answer, 'If it is not proven, what risks can we
> see?'"

**Important recording note:** Do not claim a general deepfake accuracy from the
built-in sample. Say that the current dashboard shows an illustrative benchmark
and that a real held-out dataset is part of production validation.

### 4:15 to 5:10 | Killer feature 6: turn reports into SupTech intelligence

**On screen:** Switch to the **Regulator** role and open the SupTech radar.
Show the counters, campaigns, UPI handles, entities, phone graph, verdicts, and
detection-performance section.

**Say:**

> "Protecting one investor is useful. Seeing the full campaign is more
> powerful.
>
> Every verification creates a structured event. PramaanSetu links suspicious
> events when they share an impersonated entity, UPI handle, phone number, or
> domain. That converts isolated reports into market-wide campaign
> intelligence.
>
> Confirmed tampering is kept separate from AI-scored suspicion. I can select a
> UPI handle or phone number and see the campaigns that share it. The dashboard
> also shows signed assets, verification activity, synthetic-media signals, and
> transparency-log health.
>
> The detection-performance panel reports a confusion matrix, accuracy,
> precision, recall, specificity, and F1. The current built-in dataset is
> clearly labelled illustrative, so the system does not present a demo number
> as real-world accuracy."

**On-screen caption:** `One report protects one investor. Shared indicators protect the market.`

### 5:10 to 5:40 | Killer feature 7: signed regulator evidence

**On screen:** Open the Evidence tab and export a campaign evidence pack as the
Regulator role. Briefly show the downloaded JSON in a formatted viewer.

**Say:**

> "A regulator can export a campaign evidence pack. It contains the campaign,
> linked submissions, submitted content hashes, matched assets, risk signals,
> payment handles, phone numbers, log references, and the verification
> methodology.
>
> The evidence pack is signed using Ed25519, making later changes detectable.
> This creates a reproducible record for human review instead of a dashboard
> screenshot with no audit trail."

### 5:40 to 6:05 | Killer feature 8: revocation

**On screen:** Return to the Issuer role, revoke the record signed earlier, then
verify the same message again.

**Say:**

> "Trust must also change when facts change. An issuer can revoke a published
> record. When I verify the same content again, PramaanSetu no longer returns
> Verified Original. It returns Revoked and tells the investor not to act on
> it.
>
> The same mechanism can support expired advisories, withdrawn notices, and
> corrected communications."

### 6:05 to 6:35 | Why this is different

**On screen:** Return to the overview page. Show the three product surfaces.

**Say:**

> "Most solutions begin by asking AI whether something looks fake. PramaanSetu
> begins with a stronger question: can the claimed source be proven?
>
> SEBI Check and Validated UPI Handles help investors verify where a payment is
> going. PramaanSetu complements that protection by checking the communication
> that persuades the investor before the payment, including messages,
> documents, images, video, and audio.
>
> It is one trust rail with three connected surfaces: issuer provenance,
> investor verification, and regulator intelligence."

### 6:35 to 6:55 | Scale, honesty, and closing

**On screen:** Show a compact results card or terminal screenshot with the
verified benchmark results.

**Say:**

> "The prototype has 22 passing backend tests across text, image, PDF, video,
> audio, QR tampering, signature failure, log corruption, campaign linking, and
> evidence generation.
>
> At 10,001 signed assets, the LSH fingerprint index reduced candidate search
> from about 295 milliseconds to about 5 milliseconds in the latest local run.
> Common compression, screenshots, scaling, and small crops were recognised in
> the test corpus. Rotation remains a known limitation, and the synthetic-media
> benchmark still needs a large real held-out dataset.
>
> PramaanSetu is a working reference prototype, not a production SEBI system.
> Production would use verified issuer onboarding, HSM or KMS protected keys,
> PostgreSQL, durable queues, regulator authentication, and an independently
> anchored transparency log.
>
> The goal is simple: do not ask an investor to trust the styling. Let them
> verify the source. PramaanSetu, proof before persuasion."

---

## One-minute product explanation for the video description

PramaanSetu is a provenance-first trust layer for securities-market
communications. Issuers sign official messages and media using Ed25519.
Investors verify suspicious text, images, documents, video, or audio against a
SHA-256 content registry and perceptual fingerprints. The system detects
recompressed copies, altered documents, swapped payment QR codes, and replaced
audio. When no signed record exists, synthetic-media forensics and an AI risk
engine explain possible deepfake or phishing signals without claiming the
content is genuine or fake with certainty. Verification events are linked by
UPI handles, phone numbers, domains, and impersonated entities to create
regulator-facing campaign intelligence and signed evidence exports.

## Feature summary for an end card

- Ed25519 issuer signatures
- SHA-256 content binding
- Tamper-evident transparency chain
- Image, PDF, video, audio, and text verification
- Recompression and forwarded-copy matching
- Payment QR and UPI tamper detection
- Voice-replacement detection
- Synthetic-media and phishing risk signals
- Campaign linking by shared fraud indicators
- Signed regulator evidence packs
- Revocation and expiry-aware verdicts
- Telegram verification channel
- Reproducible detection and scale benchmarks

## If judges ask difficult questions

### "Is every Unverified file fake?"

> "No. Unverified only means that no signed provenance record was found. We
> deliberately avoid calling unknown content fake. AI and forensic results are
> shown separately as risk signals."

### "Is this production-ready?"

> "It is a working reference prototype that proves the complete architecture.
> Production needs verified issuer onboarding, real authentication and RBAC,
> HSM or KMS key custody, PostgreSQL, durable worker queues, privacy controls,
> and an independently anchored transparency log."

### "Why not use only a deepfake detector?"

> "A detector estimates whether media looks synthetic. It cannot prove who
> published a genuine file. PramaanSetu uses cryptography to prove known
> official content and keeps AI as a fallback for content with no provenance."

### "What happens when a genuine file is compressed by WhatsApp?"

> "The exact SHA-256 hash changes, so PramaanSetu also uses perceptual
> fingerprints. The current benchmark recognises common JPEG compression,
> screenshots, scaling, and small crops. Rotation is a known limitation."

### "Does the project already support WhatsApp?"

> "The web verifier and Telegram channel are implemented. WhatsApp Business is
> the next channel integration and would call the same verification API."

### "Where does AI enter the system?"

> "Only after provenance matching fails. AI helps assess synthetic media,
> phishing language, impersonation, and fraud indicators. It never overrides a
> broken signature or creates a genuine verdict."

### "How will this scale?"

> "The prototype already uses an LSH index to narrow perceptual candidates.
> Production would move records to PostgreSQL, media to object storage, and
> expensive video, audio, and AI work to background workers."

## Recording checklist

- Keep the mouse still while speaking.
- Zoom into proof fields before explaining them.
- Do not scroll while reading an important verdict.
- Use the same forged document throughout the story.
- Show the suspicious UPI handle clearly.
- Wait for each loading state to finish before speaking about the result.
- Do not claim that mock roles are real authentication.
- Do not claim that the illustrative detection benchmark is a real-world
  accuracy result.
- Do not claim that WhatsApp or an official-source crawler is already
  implemented.
- End on the overview page with the words **Proof before persuasion** visible.

## Backup plan

- If Gemini is unavailable, demonstrate deterministic provenance, QR tampering,
  voice replacement, revocation, and forensic-only detection.
- If FFmpeg is unavailable, skip the video and audio segment. Image, PDF, text,
  QR, campaign, and evidence flows still work.
- If the dashboard is empty, run the verification examples first.
- If the server was restarted, initialise the demo registry again.
- Keep screenshots of the genuine, altered, revoked, campaign, evidence, and
  benchmark results as editing backups.
