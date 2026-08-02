# Changelog

All notable changes are documented here. The project follows Semantic Versioning after the initial pre-1.0 stabilization period.

## 0.1.3 - 2026-08-03

- Verify public GHCR access with an anonymous registry token instead of attempting to change user-package visibility with a repository-scoped workflow token.
- Complete the container-backed Compose distribution after the `0.1.2` tag workflow stopped before creating its GitHub release.

## 0.1.2 - 2026-08-03

- Publish immutable `linux/amd64` and `linux/arm64` runtime images to GitHub Container Registry with provenance and an image SBOM.
- Make the versioned registry image the default Docker Compose installation path.
- Attach the Compose and environment-example files directly to each GitHub release.
- Preserve an explicit Compose override for developers who need to build the runtime image locally.
- Mark the Node package as private because npm is not a supported engine distribution path.

The `0.1.2` container image was published, but its tagged workflow stopped during package-visibility verification and did not create a GitHub release. Use `0.1.3` or newer.

## 0.1.1 - 2026-08-02

- Move HTTP(S) interception to the browser context so the first request from a popup cannot bypass destination validation.
- Block browser WebSocket connections and disable service workers to keep every supported outbound path inside the render policy.
- Add real Chromium regressions that verify popup, WebSocket, and service-worker attempts cannot reach a private probe server.
- Pin the Playwright container and GitHub Actions, add static analysis and container scanning, and attest tagged source artifacts.
- Publish an SBOM with tagged releases and expose consistent version metadata through the API and container labels.
- Expand tag-based install, upgrade, API, integration, support, and contribution documentation.

## 0.1.0 - 2026-08-02

- Initial open-source engine release.
- Playwright Chromium rendering with status preservation.
- Fail-closed token and exact-domain configuration.
- Public-network destination and redirect validation.
- Bounded in-memory cache, render concurrency, output size, and timeouts.
- Duplicate render coalescing, protected metrics, Docker Compose, and security guidance.
- Exact-allowlist redirect enforcement, bounded DNS resolution, and a terminating per-render request budget.
- Deterministic Chromium release fixtures for rendering, abuse boundaries, malformed responses, and shutdown.
