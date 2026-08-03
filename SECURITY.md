# Security

PramaanSetu is a hackathon prototype (SEBI Securities Market TechSprint 2026). It
is not connected to SEBI's production registry and is not intended for public
deployment as-is. This note records the current dependency-audit status honestly.

## Dependency audit

### Backend — clean

```bash
npm --prefix backend audit --omit=dev
# found 0 vulnerabilities
```

The backend has **zero** production-dependency vulnerabilities. The Telegram
channel talks to the Bot API directly over `fetch` (no heavy client library),
which is what keeps the production tree clean.

### Frontend — a few high advisories, all in dev/build tooling

```bash
npm --prefix frontend audit
# typically 3-4 high severity advisories (exact count moves with the
# Next.js / ESLint dependency tree — run the command for the current number)
```

All four advisories are in packages **bundled transitively inside Next.js's own
build tooling**, not in code we import or ship:

| Advisory | Package | Path |
| --- | --- | --- |
| PostCSS XSS via `</style>` in CSS stringify | `postcss` | `next/node_modules/postcss` |
| PostCSS `sourceMappingURL` path traversal / file disclosure (x2) | `postcss` | `next/node_modules/postcss` |
| sharp → libvips CVEs | `sharp` | `next` image optimiser |
| `brace-expansion` ReDoS | `brace-expansion` | ESLint dev-dependency chain (lint only) |

The `brace-expansion` advisory is pulled in transitively by **ESLint**, a
dev-only tool that never ships in the built frontend or runs at request time.
It affects `npm run lint`, not the deployed app.

Why this is a low real-world risk here:

- **Build-time, not runtime.** PostCSS runs during `next build` to compile our
  own CSS; `sharp` is Next's image optimiser. They do not execute in the served
  application, which is static, pre-rendered HTML/CSS/JS.
- **No attacker-controlled input reaches them.** The PostCSS advisories require
  processing attacker-controlled CSS or source maps. We compile only our own
  `globals.css`; the app never runs PostCSS on user input.
- **The only offered "fix" is a breaking downgrade.** `npm audit fix --force`
  installs `next@9.3.3` (from Next 16), which is a hard breaking change. These
  will clear with a future Next.js release rather than a local change.

We chose not to downgrade Next.js. For a production deployment the fix is simply
to track the Next.js release that bumps the bundled `postcss`/`sharp`, then
re-audit.

## Trust and key handling (prototype vs production)

The prototype deliberately keeps setup simple; the production hardening is
well-understood and listed in the README's *Path to production* table. In short:

- **Keys:** issuer private keys and the evidence-signing key live in the local
  JSON store for the demo. Production moves them to an HSM/KMS; the app stores
  only key ids, public keys, and status.
- **Identity:** demo issuers are pre-approved records. Production validates
  issuer identity against SEBI / exchange registries.
- **Transparency log:** an internal hash chain today; production publishes log
  roots as a Merkle tree for independent verification.
- **Storage:** a JSON file store today; production uses PostgreSQL with
  transaction-safe writes and object storage for media.

## Guards already in place

- Issuer-bound signing keys via the `x-issuer-key` header; admin-gated issuer
  creation; production-gated seeding (`DEMO_MODE` off in production).
- Ed25519 signatures on provenance manifests and evidence exports.
- Helmet headers, CORS controls, and per-IP rate limiting.
- MIME validation from file magic bytes.
- Transparency log checked against both its hash chain and the asset registry;
  `/api/health` reports `degraded`/`critical` when a capability or the log is
  compromised.
- No Gemini key material in the public health response.

## Reporting

This is a competition prototype. For issues, open a GitHub issue on the
repository.
