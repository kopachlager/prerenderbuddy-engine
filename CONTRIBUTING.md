# Contributing

Thank you for helping improve the self-hosted engine.

1. Open an issue before large or security-sensitive changes.
2. Fork the repository and create a focused branch.
3. Run `npm ci`, `npm test`, the Docker-based Chromium fixture matrix, and the runtime build.
4. Add or update tests for behavior changes.
5. Open a pull request describing the problem, design, risks, and verification.

Contributions must stay within the standalone engine boundary. Managed-service routing, billing, private operational configuration, customer data, and credentials do not belong in this repository.

By submitting a contribution, you agree that it is licensed under Apache-2.0 as described in section 5 of the license.

Maintainer release steps and rollback requirements are documented in [Releasing](docs/releasing.md). Do not move or overwrite a published release tag.

```bash
docker build --target test -t prerenderbuddy/engine:test .
docker run --rm --shm-size=1g prerenderbuddy/engine:test
docker build --target runtime -t prerenderbuddy/engine:local .
```
