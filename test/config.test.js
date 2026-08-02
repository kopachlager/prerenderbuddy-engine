import assert from 'node:assert/strict';
import test from 'node:test';
import { validateConfiguration } from '../src/config.js';

test('configuration requires a long token and an explicit domain policy', () => {
  const result = validateConfiguration({});
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 2);
});

test('configuration accepts exact domains', () => {
  const result = validateConfiguration({
    PRERENDER_TOKEN: 'a'.repeat(32),
    ALLOWED_DOMAINS: 'example.com',
  });
  assert.deepEqual(result, { valid: true, errors: [] });
});

test('configuration requires an explicit unrestricted opt-in', () => {
  const result = validateConfiguration({
    PRERENDER_TOKEN: 'a'.repeat(32),
    ALLOW_ANY_PUBLIC_DOMAIN: 'true',
  });
  assert.equal(result.valid, true);
});

test('configuration rejects wildcard and URL-shaped domain entries', () => {
  for (const domain of ['*.example.com', 'https://example.com', 'example.com/path']) {
    const result = validateConfiguration({ PRERENDER_TOKEN: 'a'.repeat(32), ALLOWED_DOMAINS: domain });
    assert.equal(result.valid, false, domain);
  }
});
