# Changelog

All notable changes are documented here. The project follows Semantic Versioning after the initial pre-1.0 stabilization period.

## Unreleased

- Move HTTP(S) interception to the browser context so the first request from a popup cannot bypass destination validation.
- Block browser WebSocket connections and disable service workers to keep every supported outbound path inside the render policy.
- Add real Chromium regressions that verify popup, WebSocket, and service-worker attempts cannot reach a private probe server.

## 0.1.0 - 2026-08-02

- Initial open-source engine release.
- Playwright Chromium rendering with status preservation.
- Fail-closed token and exact-domain configuration.
- Public-network destination and redirect validation.
- Bounded in-memory cache, render concurrency, output size, and timeouts.
- Duplicate render coalescing, protected metrics, Docker Compose, and security guidance.
- Exact-allowlist redirect enforcement, bounded DNS resolution, and a terminating per-render request budget.
- Deterministic Chromium release fixtures for rendering, abuse boundaries, malformed responses, and shutdown.
