# Site Health (future)

Admin will include a **Site Health** section that runs extensible checks and shows actionable results.

## Design

Each check implements a small interface:

```ts
type HealthCheckSeverity = 'info' | 'warn' | 'error';

type HealthCheckResult = {
  id: string;
  title: string;
  status: 'pass' | 'fail' | 'skip';
  severity: HealthCheckSeverity;
  message: string;
  details?: Record<string, unknown>;
};

type HealthCheck = {
  id: string;
  title: string;
  run(): Promise<HealthCheckResult>;
};
```

A registry aggregates checks. The admin UI renders results; the API exposes `GET /api/v1/admin/site-health` (auth required later).

## Planned check groups

### Infrastructure

- API process health
- Database connectivity / migration drift
- Object storage reachability
- ERP integration heartbeat
- Outbox lag / failed deliveries

### SEO / discovery

- `robots.txt` reachable and policy matches environment
- `sitemap.xml` reachable and non-empty in production
- Canonical base URL configured
- Structured data present on key templates

### Content quality

- Missing SEO title/description on published entities
- Missing image alt text
- Products missing primary image
- Products not assigned to any collection
- Draft referenced by published parent
- Broken variant/price configuration

## Execution rules

- Checks are read-only
- Expensive checks are async/queued later if needed — start synchronous and cheap
- Failures must cite a deep link into admin to fix the issue
- Site Health is **not** a substitute for uptime monitoring (use `/api/v1/health` + external monitors)
