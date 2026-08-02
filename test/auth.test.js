import assert from 'node:assert/strict';
import test from 'node:test';
import { isAuthorized } from '../src/auth.js';

function request(headers) {
  return { get: (name) => headers[name.toLowerCase()] || '' };
}

test('accepts bearer and custom-header tokens', () => {
  const token = 'a'.repeat(32);
  assert.equal(isAuthorized(request({ authorization: `Bearer ${token}` }), token), true);
  assert.equal(isAuthorized(request({ 'x-prerender-token': token }), token), true);
});

test('rejects missing, partial, and incorrect tokens', () => {
  const token = 'a'.repeat(32);
  assert.equal(isAuthorized(request({}), token), false);
  assert.equal(isAuthorized(request({ authorization: 'Bearer a' }), token), false);
  assert.equal(isAuthorized(request({ authorization: `Bearer ${'b'.repeat(32)}` }), token), false);
});
