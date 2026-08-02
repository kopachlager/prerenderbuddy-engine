# Security and abuse-boundary review

Review date: 2026-08-02

Candidate: `0.1.2` distribution pre-release

## Decision

The candidate is suitable for an alpha release when deployed as an authenticated internal service behind TLS, rate limiting, and outbound network controls. It is not designed to be an unauthenticated public proxy or a hostile multi-tenant browser service.

## Threat model

The engine assumes that requested pages and every resource they reference are untrusted. Primary threats are SSRF into private infrastructure, DNS rebinding, redirect escapes, browser exploitation, denial of service through expensive pages, token exposure, cache/resource exhaustion, and accidental inclusion of managed-service or customer data.

The operator, reverse proxy, host network, container runtime, DNS resolver, and Chromium supply chain remain trusted. A compromised host or operator token is outside the engine's protection boundary.

## Manual request-path review

The production runtime has no analytics or outbound telemetry. Its outbound pathways are:

1. `page.goto()` for the requested public HTTP(S) document.
2. Browser HTTP(S) subresources required by that document, including requests initiated by popup pages.
3. DNS lookup for the initial document and each intercepted HTTP(S) request.

Before the initial browser navigation, the API validates protocol, credentials, exact configured hostname, hostname resolution, and every returned IP address. Browser-context routing is installed before the first page is created and repeats public-destination validation for HTTP(S) requests from every page. Every top-level navigation hostname must also be explicitly allowlisted and remain on the original site, redirect hops for the primary page are bounded, and the final page URL is checked again. Service workers are disabled because Playwright routing cannot intercept their network requests. WebSocket connections are closed by a context-level route without connecting upstream. Non-network browser URLs such as `data:` and `blob:` may run inside the isolated browser context but do not bypass an HTTP(S) fetch through the route guard.

Subresources may use a different public hostname because modern sites depend on CDNs, fonts, APIs, and image hosts. They may not resolve to blocked address ranges. Operators requiring a narrower egress policy must enforce it at the container or network layer.

## Implemented controls

| Risk | Control | Evidence |
| --- | --- | --- |
| Unauthenticated use | Minimum 32-character token; timing-safe comparison | `test/auth.test.js`, `test/app.test.js` |
| Unsafe default deployment | Startup fails without token and explicit domain policy | `test/config.test.js`, container smoke test |
| SSRF and alternate IP notation | Protocol/credential checks, exact hostname policy, complete DNS-answer validation, special-range IP parser | `test/urlPolicy.test.js` |
| DNS stalls | Independent 100 ms–10 s lookup timeout | `test/urlPolicy.test.js` |
| Redirect escape | Main-navigation host lock, bounded navigation requests, final-URL validation | Chromium integration matrix |
| Hostile subresources | Per-request destination validation; blocked private/disallowed fixture | Chromium integration matrix |
| Alternate browser egress | Context-level HTTP routing, disabled service workers, and non-connecting WebSocket routes | Chromium integration matrix |
| Browser request storms | 10–2,000 request budget that terminates the render when exhausted | Chromium integration matrix |
| Slow or oversized pages | Navigation timeout and rendered HTML byte ceiling | Unit and Chromium integration tests |
| CPU/memory exhaustion | Global render concurrency, bounded cache entries/bytes, isolated browser contexts | Unit tests and self-hosting guide |
| Error poisoning | Only 2xx/3xx and durable 404/410 documents are cached | `test/renderPolicy.test.js` |
| Cross-origin browser callers | CORS disabled by default; exact origins only | `test/app.test.js` |
| Container privilege | Non-root runtime user, read-only filesystem, dropped capabilities, bounded temporary storage, and `no-new-privileges` | Docker inspection and CI smoke test |
| Supply-chain substitution | Digest-pinned base image, commit-pinned Actions, SBOM, checksums, and GitHub provenance | Tagged release workflow |
| Secret/private-code publication | Clean repository history, Gitleaks, package inventory, manual boundary scan | Release gate |

## Residual risks and required operator controls

- DNS validation and Chromium connection establishment are separate operations. DNS rebinding cannot be completely eliminated in application code; block private/internal destinations at the network layer.
- Chromium runs with its sandbox disabled inside the container for broad Docker compatibility. The process is non-root, but the container must still be treated as a security boundary: keep the runtime patched, restrict capabilities/network access, and avoid mounting sensitive host paths.
- Public third-party subresources are allowed. A rendered page can contact public trackers or attacker-controlled public services; apply an outbound hostname proxy when this is unacceptable.
- Rendering is resource intensive. The in-process limits reduce abuse but do not replace reverse-proxy rate limiting, container CPU/memory limits, or per-tenant isolation.
- The cache is process-local and contains rendered HTML in memory. Do not render authenticated pages or URLs whose HTML contains secrets.
- A browser or dependency vulnerability can compromise the process. Keep Playwright and the matching container image updated together and rebuild promptly after security releases.

## Release verification

Run from a clean checkout:

```bash
npm ci
npm test
npm audit --audit-level=low
docker build --target test -t prerenderbuddy/engine:test .
docker run --rm --shm-size=1g prerenderbuddy/engine:test
docker build --target runtime -t prerenderbuddy/engine:local .
gitleaks detect --source . --no-git
npm pack --dry-run
```

The Chromium matrix covers static HTML, server-rendered metadata/content, hydrated app shells, same-site redirects, cross-site and excessive redirect blocks, 404/503 status preservation, blocked subresources, popup/WebSocket/service-worker egress attempts, request storms, timeouts, oversized output, malformed responses, and SIGTERM shutdown.
