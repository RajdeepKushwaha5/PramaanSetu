# PramaanSetu — Project Structure

Two separately-deployable services in one monorepo.

```
pramaansetu/
├── frontend/                 Next.js 16 app (UI only)
│   ├── src/app/
│   │   ├── page.tsx          Landing page
│   │   ├── verify/page.tsx   Investor verifier UI      (Layer 2)
│   │   ├── issuer/page.tsx   Issuer signing UI         (Layer 1)
│   │   └── dashboard/page.tsx SupTech radar UI         (Layer 3)
│   ├── src/components/app-shell.tsx  Shared nav shell
│   ├── src/lib/api.ts        Backend base URL helper
│   └── .env.local            NEXT_PUBLIC_API_URL -> backend
│
├── backend/                  Express + TypeScript API
│   ├── src/
│   │   ├── index.ts          Server entry (Helmet, CORS, rate limit, routers)
│   │   ├── config/env.ts     Env, Gemini keys, admin key, demo mode
│   │   ├── ai/               Gemini key pool, client, risk engine
│   │   ├── crypto/signing.ts Ed25519 signing + api-key + evidence signing
│   │   ├── fingerprint/      Content hash, colour block hash, video, QR decode
│   │   ├── db/               JSON store: registry, hash-chain log, events
│   │   ├── services/         signing, verification, campaign, evidence, demo assets
│   │   ├── util/media.ts     Magic-byte MIME validation
│   │   └── routes/           health, sign, verify, issuers, seed, campaigns, risk
│   ├── scripts/benchmark.mjs Synthetic verification benchmark
│   ├── tests/                node:test verification-semantics tests
│   └── .env                  Gemini keys, PORT, CORS_ORIGIN, ADMIN_API_KEY
│
└── package.json              Root scripts (dev / typecheck / benchmark)
```

## Run both (from repo root)

```bash
npm install            # installs concurrently (root only)
npm run install:all    # installs frontend + backend deps
npm run dev            # runs backend (:4000) + frontend (:3000) together
```

Or run each separately:

```bash
cd backend  && npm run dev     # http://localhost:4000
cd frontend && npm run dev     # http://localhost:3000
```

## How they talk

The frontend calls the backend over HTTP. The base URL comes from
`NEXT_PUBLIC_API_URL` (frontend `.env.local`). CORS on the backend allows the
frontend origin (`CORS_ORIGIN` in backend `.env`).

## Deploying (independent services)

- **backend/** → Railway or Render (long-lived Node server; FFmpeg + native
  libs work here — needed for video/audio verification later).
- **frontend/** → Vercel (or the same host). Set `NEXT_PUBLIC_API_URL` to the
  deployed backend URL, and set `CORS_ORIGIN` on the backend to the deployed
  frontend URL.

## Where the Gemini keys live

Only the **backend** holds Gemini keys (`backend/.env`). The frontend never
sees them. The rolling key manager (`backend/src/ai/geminiKeyManager.ts`)
rotates across all keys and cools down any key that hits a rate limit.
