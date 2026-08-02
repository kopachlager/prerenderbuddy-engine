# Self-hosting

## Install

Install an immutable, reviewed release image rather than a moving branch:

```bash
curl --fail --location --output docker-compose.yml \
  https://github.com/kopachlager/prerenderbuddy-engine/releases/download/v0.1.3/docker-compose.yml
curl --fail --location --output .env.example \
  https://github.com/kopachlager/prerenderbuddy-engine/releases/download/v0.1.3/prerenderbuddy.env.example
cp .env.example .env
openssl rand -hex 32
```

Put the generated value in `PRERENDER_TOKEN`, set exact hostnames in `ALLOWED_DOMAINS`, then run `docker compose pull && docker compose up -d`. Confirm both `docker compose ps` and `curl --fail http://127.0.0.1:3000/ready` before sending traffic.

The Compose file defaults to `ghcr.io/kopachlager/prerenderbuddy-engine:v0.1.3`. Set `ENGINE_IMAGE_TAG` only when deliberately testing another published tag. To build locally, clone the matching release tag and run `docker compose -f docker-compose.yml -f docker-compose.build.yml up --build -d`.

## Configuration

The container reads these environment variables:

| Variable | Default | Notes |
| --- | --- | --- |
| `PRERENDER_TOKEN` | none | Required; at least 32 characters |
| `ALLOWED_DOMAINS` | none | Required exact hostnames unless unrestricted mode is explicitly enabled |
| `ALLOW_ANY_PUBLIC_DOMAIN` | `false` | High-risk opt-in for rendering any public hostname |
| `PORT` | `3000` | Container HTTP port |
| `ENGINE_PORT` | `3000` | Host-only Compose port; used by `docker-compose.yml`, not the Node process |
| `HEADLESS` | `true` | Keep enabled in normal operation |
| `RENDER_TIMEOUT_MS` | `20000` | Bounded between 1 and 120 seconds |
| `RENDER_MAX_REDIRECTS` | `10` | Bounded between 0 and 20 hops |
| `RENDER_MAX_REQUESTS` | `250` | Bounded between 10 and 2,000 HTTP(S) requests; exhaustion terminates the render |
| `RENDER_MAX_CONCURRENCY` | `4` | Bounded between 1 and 20 |
| `RENDER_SINGLE_FLIGHT_WAIT_MS` | `30000` | Maximum time a duplicate request waits for the active render; bounded between 1 and 60 seconds |
| `MAX_RENDERED_HTML_BYTES` | `5000000` | Bounded between 100 KB and 20 MB |
| `CACHE_TTL_SECONDS` | `1800` | Bounded between 1 second and 7 days |
| `CACHE_MAX_ENTRIES` | `500` | Bounded between 1 and 10,000 |
| `CACHE_MAX_BYTES` | `100000000` | Bounded between 1 MB and 1 GB |
| `ALLOWED_ORIGINS` | empty | Exact browser origins allowed by CORS |
| `DNS_LOOKUP_TIMEOUT_MS` | `2000` | Bounded between 100 ms and 10 seconds |

An entry in `ALLOWED_DOMAINS` permits only that exact hostname. List both apex and `www` hostnames if both should be rendered.

## Resource baseline

Start a single engine with 2 vCPU, 2 GB RAM, and the configured 1 GB shared-memory allocation. Page complexity matters more than URL count, so treat this as a starting point and measure representative workloads. Version 0.1 requires no Redis or external queue: its cache and duplicate-render coordination are deliberately process-local.

## Reverse proxy

The Compose file binds to `127.0.0.1` by default. Terminate TLS in Caddy, nginx, Traefik, or a private ingress and proxy to `http://127.0.0.1:3000`. Preserve response status codes and the `X-Prerender-*` response headers. Apply a request-rate limit at the proxy.

Never put the render token in client-side JavaScript. Call the engine from your server, edge worker, or trusted crawler-routing layer.

## Capacity

Each render opens an isolated browser context. Start with concurrency `2` to `4`, observe container memory via `/internal/metrics`, and increase only after load testing representative pages. Duplicate simultaneous requests for the same URL share one render within the process.

The cache is process-local and disappears when the container restarts. Run one instance for v0.1 unless you are comfortable accepting independent caches and no cross-instance render coordination.

## Updates

Back up `.env`, record the current tag, and review the target release notes. Upgrade explicitly between immutable tags:

```bash
curl --fail --location --output docker-compose.yml \
  https://github.com/kopachlager/prerenderbuddy-engine/releases/download/v0.1.3/docker-compose.yml
docker compose pull
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:3000/ready
```

Render one representative allowed URL before restoring crawler traffic. To roll back, restore the prior Compose file or set its immutable image tag and repeat the pull and readiness checks. The cache is memory-only, so there is no data migration.

## Troubleshooting

- If `/health` fails, inspect `docker compose logs engine`; the HTTP process did not start.
- If `/ready` returns 503, Chromium is not connected. Confirm the image and Playwright package versions match and that the container has enough memory.
- A 401 response means the token header is absent or incorrect. A 403 normally means the hostname is not listed or resolves to a blocked network.
- A 503 from `/render` means local concurrency is full; retry with backoff or lower upstream request pressure.
- Repeated navigation timeouts usually require fixing the page's long-lived network requests or adjusting `RENDER_TIMEOUT_MS` after measuring the memory impact.

## Network hardening

URL validation reduces SSRF risk but cannot replace network isolation. Put the container on a network that cannot reach cloud metadata services, internal control planes, databases, or private application networks. Permit outbound DNS and public HTTP/HTTPS only where practical.

For stronger tenant isolation, run separate containers and tokens rather than sharing one engine between unrelated users.

The detailed threat model, request-path review, accepted residual risks, and release evidence are maintained in [Security review](security-review.md).
