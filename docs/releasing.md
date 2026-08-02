# Releasing

Prerender Buddy Engine uses Semantic Versioning. Before 1.0, minor versions may introduce breaking changes when the changelog and release notes call them out; patch versions remain backward-compatible fixes. A release marked as a GitHub prerelease is an early build intended for evaluation before a stable support promise exists.

## Release gate

Release only from a clean, protected `main` branch after:

1. The Node 20, 22, and 24 jobs and the container job pass on `main`.
2. `package.json` and `CHANGELOG.md` contain the intended version and date.
3. Security, self-hosting, upgrade, troubleshooting, and known-limit documentation is current.
4. Dependency, secret, license, static-analysis, container-vulnerability, package-content, and clean-artifact checks have been reviewed.
5. A rollback owner and the previously known-good tag or commit are recorded.

## Create a release

Create one annotated tag from the exact `main` commit that passed the gate:

```bash
git switch main
git pull --ff-only
git status --short
git tag -a v0.1.2 -m "Prerender Buddy Engine 0.1.2 alpha"
git push origin v0.1.2
```

Pushing a `v*` tag starts the tagged-artifact workflow. The workflow reconstructs the repository with `git archive`, performs a fresh install, runs unit and real-Chromium integration tests, audits dependencies, builds and smoke-tests the runtime image, publishes a public immutable multi-architecture GHCR image with provenance and an SBOM, verifies both supported platforms without registry authentication, generates a dependency SBOM and checksums for the downloadable assets, creates GitHub build-provenance attestations, then publishes the prerelease.

Do not create the GitHub Release manually while that workflow is running. If the workflow fails, leave the tag without a release, diagnose the failure, and never move or overwrite the published tag. Fix the issue on `main` and issue the next semantic version.

## Verify the published artifact

Download the release archive and checksum into an empty temporary directory:

```bash
gh release download v0.1.2 \
  --repo kopachlager/prerenderbuddy-engine \
  --pattern 'prerenderbuddy-engine-0.1.2.tar.gz' \
  --pattern 'prerenderbuddy-engine-0.1.2.spdx.json' \
  --pattern 'docker-compose.yml' \
  --pattern 'prerenderbuddy.env.example' \
  --pattern 'SHA256SUMS'
sha256sum --check SHA256SUMS
gh attestation verify prerenderbuddy-engine-0.1.2.tar.gz --repo kopachlager/prerenderbuddy-engine
gh attestation verify prerenderbuddy-engine-0.1.2.spdx.json --repo kopachlager/prerenderbuddy-engine
cp prerenderbuddy.env.example .env
```

Set a new 32-character-or-longer `PRERENDER_TOKEN` and exact `ALLOWED_DOMAINS`, then verify one-command startup:

```bash
docker compose pull
docker compose up -d
docker compose ps
curl --fail http://127.0.0.1:3000/ready
```

Render one allowed representative page from a trusted server-side client, inspect its status and `X-Prerender-*` headers, and stop the rehearsal with `docker compose down`.

## Rollback

The engine stores cache data only in memory, so rollback does not require a schema migration. Stop the new container, redeploy the previously recorded tag or commit with the prior environment configuration, verify `/health` and `/ready`, and test a representative render before restoring crawler traffic. Preserve failed-container logs and the release workflow URL for the incident record.

For `0.1.1`, the rollback target is `v0.1.0` only if its browser-egress limitation is acceptable behind the operator's network controls; otherwise stop rendering while correcting the deployment. For later releases, always record a previously verified tag before deployment.
