# PramaanSetu

**The cryptographic trust layer for India's securities market communications.**
SEBI Securities Market TechSprint 2026 — Problem Statement 1 (AI-driven detection
of synthetic media and phishing).

Make every official financial communication provable, and every impersonation
instantly detectable, so retail investors never have to guess what is real.

---

## Monorepo layout

```
pramaansetu/
├── frontend/     Next.js 16 app — UI only
├── backend/      Express + TypeScript API — all logic + Gemini rolling keys
└── package.json  root scripts to run both together
```

See [STRUCTURE.md](./STRUCTURE.md) for the full breakdown.

## The three layers

1. **Signing rail** (backend) — SEBI, exchanges and companies sign official
   communications with an Ed25519-signed, C2PA-inspired provenance manifest
   tied to their SEBI registration (full C2PA conformance is on the roadmap).
2. **Investor verifier** (frontend + backend) — forward any suspicious video,
   PDF or message and get one of four verdicts: Verified Original, Verified
   Derivative, Altered, or Unverified + AI risk analysis.
3. **SupTech radar** (backend + frontend) — fraud reports cluster into live
   campaigns for SEBI and the exchanges.

## Quick start

```bash
# 1. install everything
npm install
npm run install:all

# 2. add your free Gemini keys to backend/.env
#    GEMINI_API_KEYS=key1,key2,key3   (get them at https://aistudio.google.com/apikey)

# 3. run backend (:4000) + frontend (:3000) together
npm run dev
```

Then open <http://localhost:3000> and try the verifier (`/verify`).

### Run services separately

```bash
cd backend  && npm run dev     # http://localhost:4000
cd frontend && npm run dev     # http://localhost:3000
```

## Gemini rolling key pool

Free-tier Gemini keys have low rate limits. The backend holds a **pool of keys**
and rotates across them; when one hits a rate limit it is cooled down and traffic
moves to the next healthy key automatically. Add as many keys as you like
(comma-separated in `backend/.env`) to multiply the effective limit.

Watch the pool live at <http://localhost:4000/api/health>.

## Deploying

Two independent services:

- **backend/** → Railway or Render (long-lived Node server; FFmpeg + native libs
  work — needed for video/audio verification). Set `GEMINI_API_KEYS` and
  `CORS_ORIGIN` (your frontend URL).
- **frontend/** → Vercel. Set `NEXT_PUBLIC_API_URL` to the deployed backend URL.

## Status

- [x] Backend + frontend split, wired over HTTP with CORS + Helmet + rate limiting
- [x] Gemini key pool: load distribution + automatic failover on bad/rate-limited keys
- [x] **Layer 1** — Ed25519 signing over a C2PA-inspired manifest + hash-chain transparency log
- [x] **Authenticated signing**: `/api/sign` requires an issuer-bound key; pre-approved
      demo issuers may sign keyless only in demo mode (off in production); seeding is gated
- [x] Issuer identities are **pre-approved demo identities** (real keys, not yet externally
      validated against SEBI's registry) with registration-source links
- [x] **Layer 2** — verification engine with verdicts: Original / Copy / Altered /
      **Invalid-signature** / Revoked / Expired / Unverified
- [x] Signature-fail is never reported as genuine; revocation + expiry apply to copies too
- [x] Colour block-average fingerprinting + **tamper heatmap** localising the edited region
- [x] **QR payment-tamper detection**: decodes the QR, flags a swapped payee by name, and
      feeds that payee into campaign clustering
- [x] **Layer 3** — SupTech radar: connected-component campaign clustering by shared
      indicators, severity tiers (confirmed / suspected / low)
- [x] **Signed evidence packs**: per-event hashes, matched asset, signature result, tamper
      type, log reference, model version, and an Ed25519 integrity signature over the pack
- [x] Automated tests (`npm test`) for the verification semantics and the auth fix
- [x] MIME validation from file magic bytes (incl. audio); tamper-evident log integrity
- [ ] Real forwarded-media benchmark, PDF page/QR verification, audio fingerprinting
- [ ] Real C2PA conformance via c2pa-rs; PostgreSQL + LSH; issuer keys in HSM/KMS;
      real SEBI-registration validation for issuer identities

## Demo flow (start with investor harm)

1. Open <http://localhost:3000> → **Issuer portal** → "Seed demo data".
2. **Verifier** (`/verify`), upload mode — the seed returns three demo images
   (via the API) or sign your own:
   - genuine circular → **Verified Original** (validated issuer, valid signature)
   - re-compressed copy → **Verified Copy**
   - QR-swapped copy → **Altered**, naming the fraud payee (`fraudster12@ybl`)
3. Paste a scam message → **Unverified** + AI risk (impersonation, extracted UPI/phone).
4. **Dashboard** (`/dashboard`): submissions cluster into campaigns by shared
   indicator; export a regulator evidence pack; watch the tamper-evident log stay intact.

Video verification needs FFmpeg (`winget install Gyan.FFmpeg`). Image, text and
document verification work without it.

## Benchmark

```bash
cd backend && npm run benchmark   # or: npm test  (verification-semantics tests)
```

Runs an isolated, reproducible measurement of the deterministic verification
layer (AI disabled): original-verification rate, derivative recall after
re-compression, altered recall (QR-swap + visual edit), false-match rate on
unrelated images, and p50/p95 latency, with the exact thresholds printed.

This is a **synthetic prototype benchmark** — Jimp-generated templates and
re-compression, not real forwarded media. It is a regression check, not a
general accuracy claim. Current run: 100% original/derivative/altered recall,
0% false-match, latency in the tens of milliseconds (hardware-dependent). A
real-media evaluation (WhatsApp/Telegram round-trips, public SEBI/exchange
documents, crops/rotations/screenshots, confusion matrix, held-out calibration
set) is future work.

## Security notes (prototype)

Issuer-bound signing keys (`/api/sign` requires `x-issuer-key`; keyless signing
only for pre-approved demo issuers in demo mode), admin-gated issuer creation and
seeding, Helmet security headers, per-IP rate limiting, content-derived MIME
validation, and no key-pool internals exposed on `/api/health`. Evidence exports
are Ed25519-signed. For production: HSM/KMS-held issuer keys, per-issuer sessions,
streaming uploads, and real SEBI-registration validation of issuer identities.

## Tech

Next.js 16, React 19, Express 5, TypeScript, Google Gemini (`@google/genai`),
Jimp (perceptual hashing), jsQR + qrcode (payment-tamper), Node crypto
(Ed25519), Zod. India-region deployment target for DPDP alignment.
