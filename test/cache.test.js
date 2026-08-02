import assert from 'node:assert/strict';
import test from 'node:test';
import * as cache from '../src/cache.js';

test.beforeEach(() => cache.clear());

test('stores, reads, and removes rendered documents', () => {
  const value = { html: '<html></html>', statusCode: 200, finalUrl: 'https://example.com/' };
  assert.equal(cache.set(value.finalUrl, value), true);
  assert.deepEqual(cache.get(value.finalUrl, 60), { ...value, expired: false });
  assert.equal(cache.stats().entries, 1);
  assert.equal(cache.remove(value.finalUrl), true);
  assert.equal(cache.get(value.finalUrl, 60), null);
});

test('normalizes cache TTL into safe bounds', () => {
  assert.equal(cache.normalizeTtlSeconds(-1), 1);
  assert.equal(cache.normalizeTtlSeconds('999999999'), 604_800);
  assert.equal(cache.normalizeTtlSeconds('invalid'), 1_800);
});
