import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import test, { after, before } from 'node:test';
import { closeBrowser } from '../../src/browser.js';
import { renderDocument } from '../../src/renderer.js';

let server;
let port;
let blockedSubresourceHits = 0;
let stormResourceHits = 0;
const pendingResponses = new Set();

function html(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

function fixtureHandler(req, res) {
  const requestUrl = new URL(req.url, 'http://fixture.invalid');
  switch (requestUrl.pathname) {
    case '/static':
      return html(res, 200, '<!doctype html><html><head><title>Static fixture</title></head><body>Static body</body></html>');
    case '/ssr':
      return html(res, 200, '<!doctype html><html><head><title>SSR fixture</title><meta name="description" content="Server-rendered metadata"></head><body><main>Server-rendered content</main></body></html>');
    case '/app-shell':
      return html(res, 200, '<!doctype html><html><head><title>Loading</title></head><body><main id="app"></main><script>document.title="Hydrated fixture";document.querySelector("#app").textContent="Client-rendered content";</script></body></html>');
    case '/redirect':
      res.writeHead(302, { Location: '/final' });
      return res.end();
    case '/cross-site-redirect':
      res.writeHead(302, { Location: `http://localhost:${port}/final` });
      return res.end();
    case '/redirect-chain': {
      const hop = Number(requestUrl.searchParams.get('hop') || 0);
      res.writeHead(302, { Location: `/redirect-chain?hop=${hop + 1}` });
      return res.end();
    }
    case '/final':
      return html(res, 200, '<!doctype html><html><body>Redirect target</body></html>');
    case '/not-found':
      return html(res, 404, '<!doctype html><html><body>Missing fixture</body></html>');
    case '/error':
      return html(res, 503, '<!doctype html><html><body>Unavailable fixture</body></html>');
    case '/too-large':
      return html(res, 200, `<!doctype html><html><body>${'x'.repeat(110_000)}</body></html>`);
    case '/timeout':
      return html(res, 200, '<!doctype html><html><body>Waiting<script>fetch("/never");</script></body></html>');
    case '/never':
      pendingResponses.add(res);
      res.on('close', () => pendingResponses.delete(res));
      return undefined;
    case '/malformed':
      req.socket.destroy();
      return undefined;
    case '/blocked-subresource':
      return html(res, 200, `<!doctype html><html><body id="state">Safe<script src="http://localhost:${port}/private.js"></script></body></html>`);
    case '/private.js':
      blockedSubresourceHits += 1;
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
      return res.end('document.querySelector("#state").textContent="Compromised";');
    case '/request-storm':
      return html(res, 200, `<!doctype html><html><body>${Array.from({ length: 40 }, (_, index) => `<img src="/storm-resource?id=${index}">`).join('')}</body></html>`);
    case '/storm-resource':
      stormResourceHits += 1;
      res.writeHead(204);
      return res.end();
    default:
      return html(res, 404, '<!doctype html><html><body>Unknown fixture</body></html>');
  }
}

function fixtureUrl(pathname) {
  return `http://127.0.0.1:${port}${pathname}`;
}

async function localFixtureValidator(rawUrl, options = {}) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, status: 400, error: 'Invalid URL' };
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (!['http:', 'https:'].includes(parsed.protocol) || hostname !== '127.0.0.1') {
    return { valid: false, status: 403, error: 'Blocked fixture destination' };
  }
  if (options.allowedNavigationHost && hostname !== options.allowedNavigationHost) {
    return { valid: false, status: 403, error: 'Cross-site fixture redirect' };
  }
  return { valid: true, url: parsed, hostname };
}

function render(pathname) {
  return renderDocument(fixtureUrl(pathname), '127.0.0.1', { validateUrl: localFixtureValidator });
}

async function withEnvironment(values, callback) {
  const previous = new Map(Object.keys(values).map((name) => [name, process.env[name]]));
  for (const [name, value] of Object.entries(values)) process.env[name] = value;
  try {
    return await callback();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

async function getAvailablePort() {
  const probe = http.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const availablePort = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return availablePort;
}

before(async () => {
  server = http.createServer(fixtureHandler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});

after(async () => {
  for (const response of pendingResponses) response.destroy();
  await closeBrowser();
  await new Promise((resolve) => server.close(resolve));
});

test('real Chromium release fixture matrix', async (t) => {
  await t.test('renders static and server-rendered documents', async () => {
    const staticResult = await render('/static');
    assert.equal(staticResult.entry.statusCode, 200);
    assert.match(staticResult.entry.html, /Static fixture/);

    const ssrResult = await render('/ssr');
    assert.match(ssrResult.entry.html, /Server-rendered metadata/);
    assert.match(ssrResult.entry.html, /Server-rendered content/);
  });

  await t.test('captures a hydrated application shell', async () => {
    const result = await render('/app-shell');
    assert.match(result.entry.html, /<title>Hydrated fixture<\/title>/);
    assert.match(result.entry.html, /Client-rendered content/);
  });

  await t.test('preserves redirect targets and document errors', async () => {
    const redirected = await render('/redirect');
    assert.equal(redirected.entry.statusCode, 200);
    assert.equal(redirected.entry.finalUrl, fixtureUrl('/final'));

    const missing = await render('/not-found');
    assert.equal(missing.entry.statusCode, 404);
    assert.match(missing.entry.html, /Missing fixture/);

    const unavailable = await render('/error');
    assert.equal(unavailable.entry.statusCode, 503);
    assert.match(unavailable.entry.html, /Unavailable fixture/);
  });

  await t.test('blocks cross-site and excessive redirects', async () => {
    await assert.rejects(render('/cross-site-redirect'), (error) => error.code === 'RENDER_NAVIGATION_BLOCKED');
    await withEnvironment({ RENDER_MAX_REDIRECTS: '3' }, () => (
      assert.rejects(render('/redirect-chain'), (error) => error.code === 'RENDER_NAVIGATION_BLOCKED')
    ));
  });

  await t.test('blocks disallowed subresources', async () => {
    blockedSubresourceHits = 0;
    const result = await render('/blocked-subresource');
    assert.equal(blockedSubresourceHits, 0);
    assert.doesNotMatch(result.entry.html, /Compromised/);
  });

  await t.test('bounds per-render browser requests', async () => {
    stormResourceHits = 0;
    await withEnvironment({ RENDER_MAX_REQUESTS: '10' }, () => (
      assert.rejects(render('/request-storm'), (error) => error.code === 'RENDER_REQUEST_LIMIT')
    ));
    assert.ok(stormResourceHits <= 9, `expected at most 9 subresources, observed ${stormResourceHits}`);
  });

  await t.test('rejects oversized, timed-out, and malformed responses', async () => {
    await withEnvironment({ MAX_RENDERED_HTML_BYTES: '100000' }, () => (
      assert.rejects(render('/too-large'), (error) => error.code === 'RENDER_TOO_LARGE')
    ));

    await withEnvironment({ RENDER_TIMEOUT_MS: '1000' }, () => (
      assert.rejects(render('/timeout'), (error) => error.name === 'TimeoutError')
    ));

    await assert.rejects(render('/malformed'));
  });

  await t.test('shuts down cleanly on SIGTERM', async () => {
    const childPort = await getAvailablePort();
    const child = spawn(process.execPath, ['src/server.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(childPort),
        PRERENDER_TOKEN: 'x'.repeat(32),
        ALLOWED_DOMAINS: 'example.com',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server startup timed out: ${output}`)), 15_000);
      const poll = setInterval(() => {
        if (!output.includes(`listening on port ${childPort}`)) return;
        clearTimeout(timer);
        clearInterval(poll);
        resolve();
      }, 50);
      child.once('exit', (code) => {
        clearTimeout(timer);
        clearInterval(poll);
        reject(new Error(`server exited before readiness (${code}): ${output}`));
      });
    });

    child.kill('SIGTERM');
    const exit = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server shutdown timed out: ${output}`)), 10_000);
      child.once('exit', (code, signal) => {
        clearTimeout(timer);
        resolve({ code, signal });
      });
    });
    assert.deepEqual(exit, { code: 0, signal: null });
    assert.match(output, /Received SIGTERM; shutting down/);
  });
});
