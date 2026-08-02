# Prerender Buddy Engine

[![CI](https://github.com/kopachlager/prerenderbuddy-engine/actions/workflows/ci.yml/badge.svg)](https://github.com/kopachlager/prerenderbuddy-engine/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

A secure, self-hosted rendering engine that turns JavaScript applications into crawler-readable HTML. It uses Playwright Chromium, keeps a bounded in-memory cache, coalesces duplicate requests, and preserves the rendered document's HTTP status.

The supported distribution is the versioned Docker image published on GitHub Container Registry. The Node package metadata is private and is not an npm installation interface.

This repository is the standalone engine. The managed [Prerender Buddy](https://prerenderbuddy.com) service adds hosted routing, scheduling, monitoring, team workflows, billing, automatic scaling, and operational support.

## Quick start

Requirements: Docker Engine with Docker Compose.

```bash
curl --fail --location --output docker-compose.yml \
  https://github.com/kopachlager/prerenderbuddy-engine/releases/download/v0.1.2/docker-compose.yml
curl --fail --location --output .env.example \
  https://github.com/kopachlager/prerenderbuddy-engine/releases/download/v0.1.2/prerenderbuddy.env.example
cp .env.example .env
openssl rand -hex 32
```

Put the generated token in `.env`, replace `ALLOWED_DOMAINS` with exact hostnames you control, then start the engine:

```bash
docker compose pull
docker compose up -d
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

See [Self-hosting](docs/self-hosting.md) for configuration, reverse-proxy examples, updates, and operational guidance. The complete request, response, header, and error contract is in the [API reference](docs/api.md); common crawler-routing patterns are in [Integration](docs/integration.md).

Release tags, clean-artifact verification, and rollback steps are documented in [Releasing](docs/releasing.md).

To build the image from source instead, clone the matching release tag and run:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build -d
```

## API

| Endpoint | Authentication | Purpose |
| --- | --- | --- |
| `GET /health` | None | Container liveness |
| `GET /ready` | None | Browser readiness |
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
- Redirected top-level navigation cannot switch to another site and is limited to 10 hops by default.
- DNS resolution has its own timeout and every render has a bounded HTTP(S) request budget.
- Render concurrency, time, HTML size, cache entries, and cache bytes are bounded.
- Browser CORS access is disabled unless exact origins are listed.
- Service workers are disabled and WebSocket connections are not permitted during rendering.

Do not expose this container directly to the public internet. Put it behind a TLS reverse proxy or private network, keep the token server-side, and apply outbound firewall rules. Browser rendering untrusted pages is inherently risky; read [Security](SECURITY.md) before production use.

The release-level threat model and residual-risk decision are documented in [Security review](docs/security-review.md).

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
npm run test:integration
npm start
```

The integration command requires the matching Playwright browser. The reproducible release path uses the Docker `test` target documented in [Contributing](CONTRIBUTING.md).

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
