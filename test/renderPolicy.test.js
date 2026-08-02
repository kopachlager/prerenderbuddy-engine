import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMaxRedirects,
  isCacheableDocumentStatus,
  resetRenderSlotsForTests,
  tryAcquireRenderSlot,
} from '../src/renderPolicy.js';

test.afterEach(() => {
  delete process.env.RENDER_MAX_CONCURRENCY;
  delete process.env.RENDER_MAX_REDIRECTS;
  resetRenderSlotsForTests();
});

test('bounds redirect limits', () => {
  process.env.RENDER_MAX_REDIRECTS = '999';
  assert.equal(getMaxRedirects(), 20);
  process.env.RENDER_MAX_REDIRECTS = '-1';
  assert.equal(getMaxRedirects(), 0);
});

test('bounds concurrent renders', () => {
  process.env.RENDER_MAX_CONCURRENCY = '1';
  const release = tryAcquireRenderSlot();
  assert.equal(typeof release, 'function');
  assert.equal(tryAcquireRenderSlot(), null);
  release();
  assert.equal(typeof tryAcquireRenderSlot(), 'function');
});

test('caches successful, redirected, and durable not-found responses', () => {
  for (const status of [200, 301, 304, 404, 410]) assert.equal(isCacheableDocumentStatus(status), true);
  for (const status of [400, 403, 429, 500, 503]) assert.equal(isCacheableDocumentStatus(status), false);
});
