# Deploying PramaanSetu (public demo)

Goal: a URL a jury can open and test with their own files, no screen-share.

Architecture: **frontend on Vercel** (Next.js), **backend on Render** (Docker,
so FFmpeg for video/audio is included). ~15 minutes end to end.

---

## 1. Backend → Render (Docker)

Render reads `render.yaml` at the repo root (a "Blueprint").

1. Push this repo to GitHub (already done if you cloned it).
2. On [render.com](https://render.com): **New → Blueprint**, pick this repo.
   Render detects `render.yaml` and creates the `pramaansetu-backend` service
   from `backend/Dockerfile` (FFmpeg is installed in the image).
3. Set the environment variables it prompts for (`sync: false` ones):
   - `GEMINI_API_KEYS` — comma-separated keys (optional but recommended; enables
     AI risk + deepfake vision).
   - `ADMIN_API_KEY` — any strong string.
   - `CORS_ORIGIN` — leave blank for now; set it in step 3 once you have the
     Vercel URL.
   - `DEMO_MODE` is preset to `1` so the jury can seed/sign without a key.
4. Deploy. Health check is `/api/health`. Note the service URL, e.g.
   `https://pramaansetu-backend.onrender.com`.

> Free Render instances sleep when idle and take ~30 s to wake. Hit the URL once
> a few minutes before the demo, or upgrade to a paid instance for the jury day.

Without Docker you can instead use a Node service: build `npm --prefix backend
run build`, start `node backend/dist/index.js`, and install FFmpeg on the host —
but Docker is simpler because FFmpeg is baked in.

## 2. Frontend → Vercel

1. On [vercel.com](https://vercel.com): **New Project**, import this repo.
2. Set **Root Directory = `frontend`** (Vercel then reads `frontend/vercel.json`
   and auto-detects Next.js).
3. Add an environment variable:
   - `NEXT_PUBLIC_API_URL` = your Render backend URL from step 1.
4. Deploy. Note the Vercel URL, e.g. `https://pramaansetu.vercel.app`.

## 3. Close the loop (CORS)

Back on Render, set `CORS_ORIGIN` to your Vercel URL (comma-separate multiple),
then redeploy the backend. Done — the frontend can now call the backend.

## 4. Seed the demo

Open the deployed site → **/issuer** → **initialise demo registry**. This signs
the demo corpus (issuers, circulars, video, audio, samples) on the live backend
so verification and the dashboard have data.

---

## Environment variables

**Backend** (Render): `GEMINI_API_KEYS`, `GEMINI_MODEL`, `CORS_ORIGIN`,
`ADMIN_API_KEY`, `DEMO_MODE`, `FFMPEG_PATH` (`ffmpeg` in Docker), `NODE_ENV`
(`production`). See `backend/.env.example`.

**Demo keys and trust directory** (backend):

- `PRAMAAN_DEMO_KEYS` - path to the gitignored file holding the demo issuer
  private keys (default `backend/data/demo-issuer-keys.json`).
- `PRAMAAN_TRUST_DIR` - path to the published trusted-issuer directory of PUBLIC
  keys the verifier anchors against (default `backend/trusted-issuers.json`).
- `PRAMAAN_DEMO_SEED` - optional. When set, the demo keys are derived
  deterministically from this seed, so a restart on an ephemeral disk regenerates
  the SAME keys and any proof bundle a judge already downloaded keeps verifying.
  Set this on any hosted demo. Without it, keys are random and persisted to
  `PRAMAAN_DEMO_KEYS` (fine for local dev, lost on an ephemeral-disk restart).

**Frontend** (Vercel): `NEXT_PUBLIC_API_URL`. See `frontend/.env.example`.

## Post-deploy checklist (run through this before showing anyone)

1. Backend `/api/health` returns ok on the Render URL.
2. On Render, these are set: `CORS_ORIGIN` (= Vercel URL), `PRAMAAN_DEMO_SEED`
   (any fixed random string), `GEMINI_API_KEYS` (for AI risk + deepfake vision),
   `ADMIN_API_KEY`, and `TELEGRAM_BOT_TOKEN` if you want the bot.
3. On Vercel, `NEXT_PUBLIC_API_URL` points at the Render URL and the site loads
   without CORS errors in the browser console.
4. Seed: `/issuer` -> initialise demo registry (re-do this after any restart -
   the free instance's disk is ephemeral).
5. Verify a genuine sample -> Original; the built-in forged-QR sample -> Altered
   (names the payee); upload a real AI image -> synthetic detected.
6. Verify a PDF (the built-in forged-QR PDF) works - confirms PDF rendering runs
   in the container.
7. Wake the instance a few minutes before any live demo (free tier sleeps when
   idle, ~30-50 s cold start).

## Notes

- The prototype uses a JSON file store; a free instance's disk is ephemeral, so
  re-seed after a restart. For persistence, mount a disk or move to the
  PostgreSQL path in the README's *Path to production*.
- Because the demo trust directory is generated locally, the standalone verifier
  (`npm run verify:record`) must run against the directory from the SAME instance
  that produced the proof bundle. Set `PRAMAAN_DEMO_SEED` (above) so restarts do
  not change the keys, or run the verifier from the same checkout. Judges verify
  live during the demo, where the directory and bundle already match.
- Detection metrics compute on first request to `/api/detection/metrics`
  (deterministic, forensic-only) and are cached.
- The Telegram bot activates only if `TELEGRAM_BOT_TOKEN` is set.
