# P18 — Production image, Dokploy, R2, backups

- **Model:** GPT-6.2 Sol (`gpt-6.2-sol`)
- **Reasoning:** Medium
- **Branch:** `p18-deploy`
- **Depends on:** P17, and your decision on O-1 (R2 public or private)

Paste everything below the line into a new Codex thread. Before pasting, replace `<PUBLIC or PRIVATE>` with your R2 decision.

---

Phase P18 of Purchasing+: make the app deployable on a Hostinger VPS running Dokploy, with images on Cloudflare R2 (`<PUBLIC or PRIVATE>` bucket) and PostgreSQL backups. `AGENTS.md` applies.

## Read first
- `docs/PROGRESS.md`
- `docs/spec/08-architecture.md` — "Deployment", "Environment variables", "Security checklist"
- `docs/spec/04-catalog.md` — "Images" (driver behaviour)
- `docs/spec/09-assumptions.md` — O-1, A-15

## Build
1. **Dockerfile** (multi-stage, Node 24 slim, pnpm with `--frozen-lockfile`, prune dev dependencies, non-root user, `sharp` working in the runtime image). `.dockerignore`.
2. **Start script:** `prisma migrate deploy` → superadmin bootstrap and first-boot seed (idempotent) → server.
3. **Serving:** the API serves the built SPA with history fallback; hashed assets `Cache-Control: public, max-age=31536000, immutable`; `index.html` and the manifest `no-cache`. Gzip/brotli via middleware if Traefik isn't set to compress.
4. **Hardening:** `helmet` with a CSP allowing self plus the storage origin for images; trust the proxy (Traefik) for client IPs; secure cookies on; Origin check uses `PUBLIC_ORIGIN`; SSE headers and heartbeat confirmed behind a proxy.
5. **Health:** `GET /api/health` checks the DB and storage driver configuration; Docker `HEALTHCHECK`.
6. **R2:** confirm the r2 driver against the chosen mode (public base URL vs presigned). A `pnpm --filter api storage:check` script that uploads, reads and deletes a test object.
7. **`docs/DEPLOY.md`**, step by step for someone new to Dokploy: create the project; add the PostgreSQL service; add the Application from the GitHub repo using the Dockerfile; set every env variable (table with descriptions and examples); attach the domain with HTTPS; set the health check; create the R2 bucket and an API token with object read/write on that bucket only (and the custom domain if public); configure Dokploy scheduled Postgres backups to an S3-compatible destination (daily, keep 14); how to restore a backup into a fresh database and verify it; how to roll back to the previous deployment.
8. **CI:** add a job that builds the Docker image (no push) so a broken Dockerfile fails the PR.

## Tests
- Env validation for production (missing R2 vars when `STORAGE_DRIVER=r2` fails fast with a clear message).
- Static serving: deep link returns `index.html`; hashed asset headers.
- CSP header includes the storage origin.

## Done when
- [ ] Green lint, typecheck, tests; Docker image builds and starts locally against a Postgres container
- [ ] `docs/DEPLOY.md` complete
- [ ] `docs/PROGRESS.md` P18 section
- [ ] Commit `P18: deploy`
