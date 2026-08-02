# Security policy

## Supported versions

Security fixes are provided for the latest released minor version. Pre-1.0 releases may include breaking hardening changes.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's **Report a vulnerability** flow in the repository Security tab. Include affected versions, reproduction steps, impact, and any suggested mitigation.

We aim to acknowledge complete reports within five business days. Please allow time for validation and a coordinated release before public disclosure.

## Deployment responsibility

This software launches a browser against remote content. Domain allowlisting and destination validation reduce risk, but operators must also use authentication, TLS, rate limiting, least-privilege containers, and outbound network controls. Never deploy it as an unauthenticated public rendering proxy.

See [Security and abuse-boundary review](docs/security-review.md) for the threat model, manual request-path review, implemented controls, residual risks, and verification procedure.
