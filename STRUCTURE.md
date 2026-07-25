# PramaanSetu — Project Structure

Two separately-deployable services in one monorepo.

```
pramaansetu/
├── frontend/                 Next.js 16 app (UI only)
│   ├── src/app/
│   │   ├── page.tsx          Landing page
│   │   ├── verify/page.tsx   Investor verifier UI      (Layer 2)
│   │   ├── issuer/page.tsx   Issuer signing UI         (Layer 1)  [todo]
│   │   └── dashboard/page.tsx SupTech radar UI         (Layer 3)  [todo]
│   ├── src/lib/api.ts        Backend base URL helper
│   └── .env.local            NEXT_PUBLIC_API_URL -> backend
│
├── backend/                  Express + TypeScript API
│   ├── src/
│   │   ├── index.ts          Server entry (CORS, JSON, routers)
│   │   ├── config/env.ts     Env + Gemini key list
│   │   ├── ai/
│   │   │   ├── geminiKeyManager.ts   Rolling free-tier key pool
│   │   │   ├── geminiClient.ts       Gemini wrapper (retry + rotate)
│   │   │   └── riskEngine.ts         Phishing / impersonation analysis
│   │   ├── crypto/           C2PA signing + hash-chain log (Layer 1)  [todo]
│   │   ├── fingerprint/      Perceptual hashing, FFmpeg (Layer 2)     [todo]
│   │   ├── db/               Registry + events store                  [todo]
│   │   └── routes/
│   │       ├── health.ts     GET /api/health  (key-pool status)
│   │       └── risk.ts       POST /api/risk   (AI risk engine)
│   └── .env                  Gemini keys, PORT, CORS_ORIGIN
│
└── package.json              Root scripts to run both together
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
