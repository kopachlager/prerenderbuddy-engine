import assert from 'node:assert/strict';
import test from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';

const token = 'test-token-that-is-longer-than-32-characters';

function limitedApp(limit, options = {}) {
  const previous = process.env.REQUESTS_PER_MINUTE;
  process.env.REQUESTS_PER_MINUTE = String(limit);
  try {
    return createApp({ isReady: () => true, ...options });
  } finally {
    if (previous === undefined) delete process.env.REQUESTS_PER_MINUTE;
    else process.env.REQUESTS_PER_MINUTE = previous;
  }
}

test('all five protected routes limit repeated unauthenticated requests', async () => {
  for (const [method, path] of [
    ['get', '/render'], ['post', '/render'], ['get', '/cache/read'],
    ['post', '/cache/clear'], ['get', '/internal/metrics'],
  ]) {
    const app = limitedApp(1);
    await request(app)[method](path).expect(401);
    const response = await request(app)[method](path).expect(429, { error: 'Request rate limit exceeded' });
    assert.ok(Number(response.headers['retry-after']) > 0);
    assert.match(response.headers['ratelimit-policy'], /engine-requests/);
  }
});

test('authorized and unauthorized requests share a budget across protected routes', async (t) => {
  const previous = process.env.PRERENDER_TOKEN;
  process.env.PRERENDER_TOKEN = token;
  t.after(() => {
    if (previous === undefined) delete process.env.PRERENDER_TOKEN;
    else process.env.PRERENDER_TOKEN = previous;
  });
  let validations = 0;
  let renders = 0;
  const app = limitedApp(2, {
    validateUrl: async () => { validations += 1; return { valid: true }; },
    renderer: async () => { renders += 1; },
  });
  await request(app).get('/internal/metrics').set('Authorization', `Bearer ${token}`).expect(200);
  await request(app).get('/render?url=https://example.com/').expect(401);
  await request(app).get('/cache/read?url=https://example.com/').set('X-Prerender-Token', token).expect(429);
  assert.equal(validations, 0, 'rate-limited requests cannot reach URL validation');
  assert.equal(renders, 0, 'rate-limited requests cannot allocate a browser render');
});

test('liveness and readiness neither consume nor depend on the protected budget', async () => {
  const app = limitedApp(1);
  await request(app).get('/health').expect(200);
  await request(app).get('/ready').expect(200);
  await request(app).get('/render').expect(401);
  await request(app).get('/render').expect(429);
  await request(app).get('/health').expect(200);
  await request(app).get('/ready').expect(200);
  await request(limitedApp(1, { isReady: () => false })).get('/ready').expect(503);
});

test('changing forwarded client addresses cannot bypass the engine-wide budget', async () => {
  const app = limitedApp(1);
  await request(app).get('/render').set('X-Forwarded-For', '198.51.100.1').expect(401);
  await request(app).get('/render').set('X-Forwarded-For', '203.0.113.2').expect(429);
  assert.equal(app.get('trust proxy'), false);
});

test('separate engine instances do not share their in-memory request budgets', async () => {
  const first = limitedApp(1);
  const second = limitedApp(1);
  await request(first).get('/render').expect(401);
  await request(first).get('/render').expect(429);
  await request(second).get('/render').expect(401);
});

test('malformed JSON consumes the budget before body parsing can reject it', async () => {
  const app = limitedApp(1);
  await request(app).post('/render').set('Content-Type', 'application/json').send('{').expect(400);
  await request(app).post('/render').set('Content-Type', 'application/json').send('{').expect(429);
});

test('oversized bodies consume the budget and return a stable client error', async () => {
  const app = limitedApp(1);
  await request(app).post('/render').send({ url: 'x'.repeat(20_000) }).expect(413, { error: 'Request body exceeds the 16 KB limit' });
  await request(app).post('/render').send({ url: 'x'.repeat(20_000) }).expect(429);
});

test('allowed browser origins can read rate-limit and retry headers on 429', async (t) => {
  const previous = process.env.ALLOWED_ORIGINS;
  process.env.ALLOWED_ORIGINS = 'https://ui.example.com';
  t.after(() => {
    if (previous === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = previous;
  });
  const app = limitedApp(1);
  await request(app).get('/render').set('Origin', 'https://ui.example.com').expect(401);
  const response = await request(app).get('/render').set('Origin', 'https://ui.example.com').expect(429);
  assert.equal(response.headers['access-control-allow-origin'], 'https://ui.example.com');
  const exposed = response.headers['access-control-expose-headers'].split(',').map((name) => name.trim());
  for (const name of ['Retry-After', 'RateLimit', 'RateLimit-Policy']) assert.ok(exposed.includes(name));
  assert.ok(Number(response.headers['retry-after']) > 0);
});
