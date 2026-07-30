# PramaanSetu — Demo Script (~4 minutes)

**The one line to open and close with:**
> "Every other team built an AI that *guesses* whether something is fake.
> We built the trust rail that makes the genuine **provable** — and the fake
> obvious. AI is only our fallback."

Keep the whole demo inside this one story. Do not show a feature unless it is a
beat below.

---

## Before you start (60 seconds, off-screen)

1. `npm run dev` from the repo root. Wait for both services.
2. Open **http://localhost:3000/issuer** → click **"initialise demo registry"**.
3. Have three browser tabs ready: `/issuer`, `/verify`, `/dashboard`.
4. Confirm FFmpeg is on: `http://localhost:4000/api/health` shows
   `videoFingerprint: true, audioFingerprint: true`.
5. (Optional) Have your Telegram bot open on your phone for the finale.

---

## The sequence

**1. The problem (15s).** "A scammer can forge a SEBI circular, a payment QR, or
even a deepfake of the SEBI chairman. Today an investor has no way to check what
is real. Detectors guess — and lose. We prove."

**2. Sign — the trust rail (30s).** On **/issuer**, sign a short official notice.
Show the receipt: content hash, **Ed25519 signature**, transparency-log entry.
"SEBI signs its communications once. Now anything can be checked against it."

**3. Verify genuine — show the crypto (35s).** On **/verify**, upload the
**genuine image** sample (or paste the exact signed text). Verdict: **Verified
Original**. Point at the **Cryptographic Trust Chain** panel:
identity → SHA-256 → Ed25519 signature → transparency log → status → evidence.
"This is not AI. Every link is cryptographic proof. That is the difference."

**4. Catch the swapped QR (30s).** Click the **"forged QR · PDF"** sample.
Verdict: **Altered** — and it *names the fraud payee* (`fraudster12@ybl`).
"The document looks identical. But the payment QR was swapped. We caught it and
named the scammer's UPI."

**5. Catch the voice clone (30s) — the mic drop.** Click **"voice-cloned video"**.
Verdict: **Altered**, "the video frames match a genuine communication, but the
AUDIO was replaced." "Same face, cloned voice. The frames match the real video;
the audio doesn't. This is a dubbed deepfake, caught."

**6. AI only as fallback (20s).** Switch to **message** mode, click **"load a
known scam pattern"**, verify. Verdict: **Unverified + AI risk (critical)**,
extracted UPI/phone. "No signed record exists, so *now* we use AI — and it never
calls anything safe."

**7. Regulator intelligence (35s).** On **/dashboard**, show the campaign that
formed. Click a **UPI handle** — the campaigns filter to everything sharing it.
"Every report becomes a sensor. Shared indicators link scams into one campaign."
Click **"export evidence"** — a signed, tamper-evident evidence pack.

**8. Revocation (15s).** Back on **/issuer**, on a signed record click **"revoke
record"**, then re-verify it → **Revoked**. "Issuers stay in control — revoke
once, and every investor sees it instantly."

**9. Close (15s).** "SEBI's @valid handles protect the *payment*. PramaanSetu
protects everything *before* it — the message, the document, the video that
convinced the victim to pay. Cryptography for what's official; AI only when it
isn't."

---

## If a judge asks "is this production-ready?"

Be honest — it wins trust:
> "This is a working prototype that proves the mechanism. For production the
> trust chain has to be airtight: issuer identity validated against SEBI's real
> registry, keys in HSM/KMS, evidence anchored to a regulator-controlled key, a
> public Merkle log for independent verification, and PostgreSQL behind it. None
> of that changes the architecture — they're known swaps. It's in our README's
> *Path to production* table."

## If asked about accuracy / the benchmark

> "We're honest about it. On the common real-world forwards — WhatsApp
> compression, screenshots, scaling — recognition is 100% with zero false
> matches (`npm run benchmark:real`). Crop and rotation are the current
> weakness; production adds keypoint-based matching. And the backend dependency
> audit is clean."

## Backup / gotchas

- If a page is blank after a big code change, stop the server, delete
  `frontend/.next`, restart (stale RSC cache).
- Video/audio need FFmpeg (`FFMPEG_PATH` in `backend/.env`). Without it, image /
  PDF / text still work.
- The dashboard is empty until you verify something — do the verify beats first.
