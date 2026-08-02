import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as cache from '../src/cache.js';
import { resetRenderFlightsForTests } from '../src/renderFlight.js';
import { resetRenderSlotsForTests } from '../src/renderPolicy.js';

const token = 'test-token-that-is-longer-than-32-characters';
const validation = { valid: true, url: new URL('https://example.com/'), hostname: 'example.com' };

function app(renderer = async () => ({
  entry: { html: '<html><title>Rendered</title></html>', statusCode: 200, finalUrl: 'https://example.com/' },
  durationMs: 12,
})) {
  return createApp({ renderer, validateUrl: async () => validation });
}

test.beforeEach(() => {
  process.env.PRERENDER_TOKEN = token;
  delete process.env.ALLOWED_ORIGINS;
  cache.clear();
  resetRenderFlightsForTests();
  resetRenderSlotsForTests();
});

test('health is public while render and metrics require authentication', async () => {
  await request(app()).get('/health').expect(200, { ok: true, service: '@prerenderbuddy/engine' });
  await request(app()).get('/render?url=https://example.com/').expect(401);
  await request(app()).get('/internal/metrics').expect(401);
});

test('GET and POST render preserve status and cache output', async () => {
  let renderCount = 0;
  const renderer = async () => {
    renderCount += 1;
    return {
      entry: { html: '<html>Missing</html>', statusCode: 404, finalUrl: 'https://example.com/' },
      durationMs: 8,
    };
  };
  const instance = app(renderer);
  const first = await request(instance)
    .post('/render')
    .set('Authorization', `Bearer ${token}`)
    .send({ url: 'https://example.com/' })
    .expect(404);
  assert.equal(first.headers['x-prerender-cache'], 'MISS');

  const second = await request(instance)
    .get('/render?url=https://example.com/')
    .set('X-Prerender-Token', token)
    .expect(404);
  assert.equal(second.headers['x-prerender-cache'], 'HIT');
  assert.equal(renderCount, 1);
});

test('CORS is disabled by default and exact when configured', async () => {
  const denied = await request(app()).options('/render').set('Origin', 'https://ui.example.com').expect(403);
  assert.equal(denied.headers['access-control-allow-origin'], undefined);
  process.env.ALLOWED_ORIGINS = 'https://ui.example.com';
  const allowed = await request(app()).options('/render').set('Origin', 'https://ui.example.com').expect(204);
  assert.equal(allowed.headers['access-control-allow-origin'], 'https://ui.example.com');
});

test('simultaneous requests for one URL share a single render', async () => {
  let renderCount = 0;
  const instance = app(async () => {
    renderCount += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return {
      entry: { html: '<html>Shared</html>', statusCode: 200, finalUrl: 'https://example.com/' },
      durationMs: 20,
    };
  });
  const renderRequest = () => request(instance)
    .get('/render?url=https://example.com/')
    .set('Authorization', `Bearer ${token}`);
  const responses = await Promise.all([renderRequest(), renderRequest()]);
  assert.equal(renderCount, 1);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.equal(responses.some((response) => response.headers['x-prerender-coordination'] === 'COALESCED'), true);
});

test('cache read and clear endpoints do not trigger rendering', async () => {
  const instance = app();
  cache.set('https://example.com/', {
    html: '<html>Cached</html>', statusCode: 200, finalUrl: 'https://example.com/',
  });
  await request(instance)
    .get('/cache/read?url=https://example.com/')
    .set('Authorization', `Bearer ${token}`)
    .expect(200, '<html>Cached</html>');
  await request(instance)
    .post('/cache/clear')
    .set('Authorization', `Bearer ${token}`)
    .send({ url: 'https://example.com/' })
    .expect(200, { ok: true, url: 'https://example.com/', removed: true });
  await request(instance)
    .get('/cache/read?url=https://example.com/')
    .set('Authorization', `Bearer ${token}`)
    .expect(404);
});
