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

### Frontend — clean

```bash
npm --prefix frontend audit
# found 0 vulnerabilities
```

Earlier high-severity advisories (transitive `postcss` / `sharp` / `nanoid`
inside Next.js's build toolchain) were cleared by upgrading **Next.js to 16.3.x**
and running `npm audit fix`. Both trees are now clean; re-run the commands above
to confirm on your machine, since advisory feeds change over time.

### Keeping it clean

New advisories appear as feeds update. Re-run `npm audit` (both `backend/` and
`frontend/`) before submission and apply `npm audit fix` (or a targeted version
bump) for any high-severity findings — most are safe patch/minor upgrades, as the
`pdfjs-dist` and `ip-address` fixes here were.

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
