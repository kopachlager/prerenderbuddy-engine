# Prerender Buddy Engine

[![CI](https://github.com/kopachlager/prerenderbuddy-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/kopachlager/prerenderbuddy-engine/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

A secure, self-hosted rendering engine that turns JavaScript applications into crawler-readable HTML. It uses Playwright Chromium, keeps a bounded in-memory cache, coalesces duplicate requests, and preserves the rendered document's HTTP status.

This repository is the standalone engine. The managed [Prerender Buddy](https://prerenderbuddy.com) service adds hosted routing, scheduling, monitoring, team workflows, billing, automatic scaling, and operational support.

## Quick start

Requirements: Docker Engine with Docker Compose.

```bash
git clone https://github.com/kopachlager/prerenderbuddy-engine.git
cd prerenderbuddy-engine
cp .env.example .env
openssl rand -hex 32
```

Put the generated token in `.env`, replace `ALLOWED_DOMAINS` with exact hostnames you control, then start the engine:

```bash
docker compose up --build -d
docker compose ps
curl http://127.0.0.1:3000/health
```

Render an allowed page:

```bash
set -a
. ./.env
set +a
curl --fail-with-body \
  -H "Authorization: Bearer $PRERENDER_TOKEN" \
  "http://127.0.0.1:3000/render?url=https%3A%2F%2Fexample.com%2F"
```

The API also accepts `POST /render` with JSON:

```json
{"url":"https://example.com/","ttlSeconds":1800}
```

See [Self-hosting](docs/self-hosting.md) for configuration, reverse-proxy examples, updates, and operational guidance.

## API

| Endpoint | Authentication | Purpose |
| --- | --- | --- |
| `GET /health` | None | Container liveness |
| `GET /render?url=…` | Token | Render or read a cached document |
| `POST /render` | Token | Render from a JSON request |
| `GET /cache/read?url=…` | Token | Read a cached document without rendering |
| `POST /cache/clear` | Token | Remove one cached URL |
| `GET /internal/metrics` | Token | Process, cache, and capacity snapshot |

Authenticate with `Authorization: Bearer <token>` or `X-Prerender-Token: <token>`.

Useful response headers include `X-Prerender-Cache`, `X-Prerender-Time`, `X-Prerender-Final-Url`, and `X-Prerender-Coordination`.

## Security model

The engine fails closed:

- A token of at least 32 characters is required.
- `ALLOWED_DOMAINS` is required unless `ALLOW_ANY_PUBLIC_DOMAIN=true` is explicitly set.
- Localhost, private, link-local, reserved, multicast, and non-HTTP destinations are rejected.
- Redirected top-level navigation cannot switch to another site.
- Render concurrency, time, HTML size, cache entries, and cache bytes are bounded.
- Browser CORS access is disabled unless exact origins are listed.

Do not expose this container directly to the public internet. Put it behind a TLS reverse proxy or private network, keep the token server-side, and apply outbound firewall rules. Browser rendering untrusted pages is inherently risky; read [Security](SECURITY.md) before production use.

## Scope of the open engine

Version 0.1 is deliberately small: one process, one Chromium instance, in-memory caching, local request coalescing, and no external telemetry. It does not include the managed service's multi-tenant scheduler, distributed queue topology, automatic scaling, dashboard, billing, quotas, or service-level guarantees.

Those boundaries keep the self-hosted core understandable and auditable. Community proposals for general-purpose engine capabilities are welcome through issues and pull requests.

## Local development

Node.js 20+ is required.

```bash
npm ci
npm run install:browsers
cp .env.example .env
npm test
npm start
```

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
