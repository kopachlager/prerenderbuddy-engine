# Releasing

Prerender Buddy Engine uses Semantic Versioning. Before 1.0, minor versions may introduce breaking changes when the changelog and release notes call them out; patch versions remain backward-compatible fixes. A release marked as a GitHub prerelease is an early build intended for evaluation before a stable support promise exists.

## Release gate

Release only from a clean, protected `main` branch after:

1. The Node 20, 22, and 24 jobs and the container job pass on `main`.
2. `package.json` and `CHANGELOG.md` contain the intended version and date.
3. Security, self-hosting, upgrade, troubleshooting, and known-limit documentation is current.
4. Dependency, secret, license, package-content, and clean-artifact checks have been reviewed.
5. A rollback owner and the previously known-good tag or commit are recorded.

## Create a release

Create one annotated tag from the exact `main` commit that passed the gate:

```bash
git switch main
git pull --ff-only
git status --short
git tag -a v0.1.0 -m "Prerender Buddy Engine 0.1.0 alpha"
git push origin v0.1.0
```

Pushing a `v*` tag starts the tagged-artifact workflow. The workflow reconstructs the repository with `git archive`, performs a fresh install, runs unit and real-Chromium integration tests, audits dependencies, builds and smoke-tests the runtime image, then publishes a GitHub prerelease with the tested source archive and SHA-256 checksum.

Do not create the GitHub Release manually while that workflow is running. If the workflow fails, leave the tag without a release, diagnose the failure, and never move or overwrite the published tag. Fix the issue on `main` and issue the next semantic version.

## Verify the published artifact

Download the release archive and checksum into an empty temporary directory:

```bash
gh release download v0.1.0 \
  --repo kopachlager/prerenderbuddy-engine \
  --pattern 'prerenderbuddy-engine-0.1.0.tar.gz' \
  --pattern 'SHA256SUMS'
sha256sum --check SHA256SUMS
tar -xzf prerenderbuddy-engine-0.1.0.tar.gz
cd prerenderbuddy-engine-0.1.0
cp .env.example .env
```

Set a new 32-character-or-longer `PRERENDER_TOKEN` and exact `ALLOWED_DOMAINS`, then verify one-command startup:

```bash
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:3000/ready
```

Render one allowed representative page from a trusted server-side client, inspect its status and `X-Prerender-*` headers, and stop the rehearsal with `docker compose down`.

## Rollback

The engine stores cache data only in memory, so rollback does not require a schema migration. Stop the new container, redeploy the previously recorded tag or commit with the prior environment configuration, verify `/health` and `/ready`, and test a representative render before restoring crawler traffic. Preserve failed-container logs and the release workflow URL for the incident record.

For the first alpha, the rollback target is the last reviewed pre-tag `main` commit. After the first release, always record a previously verified tag before deployment.
