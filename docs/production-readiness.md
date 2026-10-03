# Production readiness checklist

Use before first production deploy. Do not claim a row is done unless verified in the target environment.

Full HostFly VPS runbook: [deployment-hostfly.md](./deployment-hostfly.md).

## Secrets & config

- [ ] Unique `SESSION_HMAC_SECRET` (≥32 chars, not a template placeholder)
- [ ] Unique `ORDER_RECOVERY_ENCRYPTION_KEY` (base64 32 bytes); backed up offline for recovery window
- [ ] `ORDER_RECOVERY_TTL_HOURS` chosen (default 48 is fine)
- [ ] `REVALIDATE_SECRET` (≥16) in `/etc/shopbuket1/production.env` if on-demand revalidation is wanted (Compose defaults `REVALIDATE_URL` to `http://web:3000/api/revalidate` on api)
- [ ] `DATABASE_URL` points at production Postgres; backups configured
- [ ] `CORS_ORIGINS` exact storefront origin(s); no `*`
- [ ] `TRUST_PROXY=true` only behind a trusted reverse proxy
- [ ] `SWAGGER_ENABLED` unset or false
- [ ] `ALLOW_DEV_CATALOG_SEED` never set
- [ ] `ALLOW_INDEXING` intentional for the environment
- [ ] `NEXT_PUBLIC_SITE_URL` / public URLs are HTTPS in production
- [ ] Media: `MEDIA_STORAGE=s3` (or documented `ALLOW_PRODUCTION_LOCAL_MEDIA` emergency override)
- [ ] Media: Admin → Медиа / Site Health → Проверить хранилище succeeds
- [ ] Media: `pnpm media:check` has no missing masters / multi-primary
- [ ] Media: Postgres backup + object-storage durability both documented

## Bootstrap

- [ ] Migrations applied (`prisma migrate deploy`)
- [ ] SUPER_ADMIN created via interactive `pnpm admin:create` (prefer prompt over `--password`)
- [ ] Admin login works; logout works

## Runtime hardening

- [ ] HTTPS termination + HSTS at the edge (`render_nginx_https` emits `Strict-Transport-Security: max-age=31536000` on :443 only; re-run `sudo ./provision-nginx.sh` after pull)
- [ ] Secure cookies for admin session (SameSite=Lax/Strict as configured)
- [ ] Log redaction verified (no passwords, phones, tracking tokens, recovery keys)
- [ ] Tracking pages return noindex / no-store
- [ ] Health endpoint cheap and non-revealing

## Commerce

- [ ] Lost-response idempotent replay returns tracking token within TTL
- [ ] Outbox rows created with orders; run worker when ERP delivery mode is SIMULATOR/ERP (monitor backlog either way)
- [ ] Rate limits acceptable behind NAT (login / orders / track)

## Monitoring (minimal)

- [ ] API/web process supervision
- [ ] Postgres disk / connection alerts
- [ ] Error rate + 5xx alerts with request IDs (no PII in tickets)

## Explicitly not in v1

- ERP consumer, payments, CAPTCHA, full Site Health UI, Redis

## HostFly / VPS packaging

- [ ] `sudo ./install.sh` completed on Ubuntu 24.04
- [ ] `/etc/shopbuket1/production.env` filled (S3 + real domain + `CERTBOT_EMAIL`); never committed; no `YOUR_DOMAIN`
- [ ] `sudo ./provision-nginx.sh` (correct `server_name`, `listen 443`, HTTP→HTTPS)
- [ ] `./deploy.sh` healthy (Compose project `shopbuket1`)
- [ ] `./admin-create.sh` SUPER_ADMIN created
- [ ] Confirmed scripts never prune `erpbuket1*` / foreign Docker volumes
