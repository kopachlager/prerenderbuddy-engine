import assert from 'node:assert/strict';
import test from 'node:test';
import { countRedirects } from '../src/renderer.js';

function request(previous = null) {
  return { redirectedFrom: () => previous };
}

test('counts the complete navigation redirect chain', () => {
  assert.equal(countRedirects(request()), 0);
  assert.equal(countRedirects(request(request())), 1);
  assert.equal(countRedirects(request(request(request()))), 2);
});
