# API reference

The engine exposes an HTTP API on port `3000` by default. Except for liveness and readiness, every endpoint requires either `Authorization: Bearer <token>` or `X-Prerender-Token: <token>`. Keep the token server-side.

## Health and readiness

`GET /health` returns process liveness and build identity:

```json
{"ok":true,"service":"@prerenderbuddy/engine","version":"0.1.2"}
```

`GET /ready` returns `200 {"ready":true}` when Chromium is connected, or `503 {"ready":false}`. These endpoints intentionally require no token so container orchestrators can call them.

## Render

Use either `GET /render?url=<encoded-url>` or:

```http
POST /render
Authorization: Bearer <token>
Content-Type: application/json

{"url":"https://example.com/path","ttlSeconds":1800}
```

`ttlSeconds` may instead be sent as the `X-Prerender-Cache-Ttl-Seconds` header or GET query parameter. A successful response body is the rendered HTML and its status is the rendered document status. The engine also preserves durable `404` and `410` responses.

Response headers:

| Header | Meaning |
| --- | --- |
| `X-Prerender-Cache` | `MISS` for a fresh render or `HIT` for cached/coalesced output |
| `X-Prerender-Cache-Ttl` | Effective TTL in seconds |
| `X-Prerender-Time` | Fresh render duration in milliseconds |
| `X-Prerender-Final-Url` | Final validated document URL |
| `X-Prerender-Coordination` | `COALESCED` when the response joined an active render |

## Cache and metrics

- `GET /cache/read?url=<encoded-url>` reads a cached document without rendering. Add `includeExpired=true` only for an intentional stale-read workflow.
- `POST /cache/clear` with `{"url":"https://example.com/"}` removes one cache entry.
- `GET /internal/metrics` returns uptime, active render capacity, active coalesced flights, cache usage, and process RSS memory. Treat this as an internal endpoint even though it is token-protected.

## Errors

JSON errors use `{"error":"message"}`. Stable statuses are:

| Status | Meaning |
| --- | --- |
| `400` | Missing/invalid URL or invalid JSON |
| `401` | Missing or incorrect token |
| `403` | Destination, redirect, CORS preflight, or navigation rejected by policy |
| `404` | Unknown endpoint or cache miss; a render may also preserve an origin `404` as HTML |
| `413` | Rendered HTML exceeds the configured limit |
| `422` | Per-render browser request budget exhausted |
| `500` | Browser or unexpected render failure |
| `503` | Chromium not ready, render capacity reached, or coalescing wait exceeded |
| `504` | Render timed out |

Capacity responses may include `Retry-After`. Clients should retry `503` and `504` only with bounded exponential backoff and jitter. Do not retry policy `403`, size `413`, or request-budget `422` responses without changing the request or configuration.
