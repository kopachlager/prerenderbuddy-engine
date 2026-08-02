# Contributing

Thank you for helping improve the self-hosted engine.

1. Open an issue before large or security-sensitive changes.
2. Fork the repository and create a focused branch.
3. Run `npm ci`, `npm test`, and `docker build .`.
4. Add or update tests for behavior changes.
5. Open a pull request describing the problem, design, risks, and verification.

Contributions must stay within the standalone engine boundary. Managed-service routing, billing, private operational configuration, customer data, and credentials do not belong in this repository.

By submitting a contribution, you agree that it is licensed under Apache-2.0 as described in section 5 of the license.
