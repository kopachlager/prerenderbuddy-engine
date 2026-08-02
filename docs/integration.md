# Integration patterns

Prerender Buddy Engine is a private origin service, not a public crawler endpoint. Your application or reverse proxy decides when rendered HTML is appropriate, then calls the engine from a trusted network with the token.

## Server-side request flow

1. Receive a request on your public application domain.
2. Decide whether it is an eligible public page and whether your crawler-routing policy applies.
3. Construct the canonical public URL from trusted application configuration, not an arbitrary client-supplied upstream URL.
4. Call `/render` with the engine token from the server side.
5. Preserve the returned status, HTML body, content type, and useful `X-Prerender-*` diagnostics.
6. Fall back to the normal application response when the engine is unavailable; use a short timeout and bounded retry policy.

Do not forward a browser-provided authorization header to the engine, expose the engine token in HTML or JavaScript, or let a public query parameter choose an unrestricted render target.

## Reverse-proxy boundary

Keep the Compose binding on `127.0.0.1`, or place the container on a private network with no public ingress. Terminate TLS and enforce rate limits at your existing proxy. Permit outbound DNS and only the public HTTP/HTTPS destinations the rendered sites need; explicitly deny cloud metadata and private networks.

Crawler user-agent strings are not authentication and can be spoofed. If routing uses a crawler list, treat it only as a rendering hint and retain normal authorization, URL allowlisting, caching, and abuse controls.

## Cache behavior

The cache is local to one process and is cleared on restart. Choose a TTL that matches content freshness, purge individual URLs after material updates, and avoid rendering personalized or authenticated pages. Multiple replicas have independent caches and duplicate-render coordination.

For endpoint details and error handling, see the [API reference](api.md). For deployment controls and upgrades, see [Self-hosting](self-hosting.md).
