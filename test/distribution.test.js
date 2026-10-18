import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('the pinned browser image matches the installed Playwright package', () => {
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const dockerfile = fs.readFileSync(new URL('../Dockerfile', import.meta.url), 'utf8');
  const image = dockerfile.match(/^FROM mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-noble@sha256:([a-f0-9]{64}) AS base$/m);
  assert.ok(image, 'the browser image must be versioned and digest-pinned');
  assert.equal(image[1], pkg.dependencies.playwright, 'package and image need one matching browser version');
});
