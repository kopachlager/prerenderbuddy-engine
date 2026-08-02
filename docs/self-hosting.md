# Self-hosting

## Configuration

The container reads these environment variables:

| Variable | Default | Notes |
| --- | --- | --- |
| `PRERENDER_TOKEN` | none | Required; at least 32 characters |
| `ALLOWED_DOMAINS` | none | Required exact hostnames unless unrestricted mode is explicitly enabled |
| `ALLOW_ANY_PUBLIC_DOMAIN` | `false` | High-risk opt-in for rendering any public hostname |
| `PORT` | `3000` | Container HTTP port |
| `HEADLESS` | `true` | Keep enabled in normal operation |
| `RENDER_TIMEOUT_MS` | `20000` | Bounded between 1 and 120 seconds |
| `RENDER_MAX_CONCURRENCY` | `4` | Bounded between 1 and 20 |
| `MAX_RENDERED_HTML_BYTES` | `5000000` | Bounded between 100 KB and 20 MB |
| `CACHE_TTL_SECONDS` | `1800` | Bounded between 1 second and 7 days |
| `CACHE_MAX_ENTRIES` | `500` | Bounded between 1 and 10,000 |
| `CACHE_MAX_BYTES` | `100000000` | Bounded between 1 MB and 1 GB |
| `ALLOWED_ORIGINS` | empty | Exact browser origins allowed by CORS |

An entry in `ALLOWED_DOMAINS` permits only that exact hostname. List both apex and `www` hostnames if both should be rendered.

## Reverse proxy

The Compose file binds to `127.0.0.1` by default. Terminate TLS in Caddy, nginx, Traefik, or a private ingress and proxy to `http://127.0.0.1:3000`. Preserve response status codes and the `X-Prerender-*` response headers. Apply a request-rate limit at the proxy.

Never put the render token in client-side JavaScript. Call the engine from your server, edge worker, or trusted crawler-routing layer.

## Capacity

Each render opens an isolated browser context. Start with concurrency `2` to `4`, observe container memory via `/internal/metrics`, and increase only after load testing representative pages. Duplicate simultaneous requests for the same URL share one render within the process.

The cache is process-local and disappears when the container restarts. Run one instance for v0.1 unless you are comfortable accepting independent caches and no cross-instance render coordination.

## Updates

Back up `.env`, review release notes, then rebuild:

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d
docker compose ps
```

Pin a release tag rather than `main` in production.

## Network hardening

URL validation reduces SSRF risk but cannot replace network isolation. Put the container on a network that cannot reach cloud metadata services, internal control planes, databases, or private application networks. Permit outbound DNS and public HTTP/HTTPS only where practical.

For stronger tenant isolation, run separate containers and tokens rather than sharing one engine between unrelated users.
