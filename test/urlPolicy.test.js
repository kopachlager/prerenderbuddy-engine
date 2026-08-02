import assert from 'node:assert/strict';
import test from 'node:test';
import { isBlockedIp, validateUrl } from '../src/urlPolicy.js';

test('blocks private and reserved addresses', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '192.168.1.1', '198.18.0.1', '198.51.100.2', '::1', '[::1]', '::ffff:7f00:1', 'fd00::1']) {
    assert.equal(isBlockedIp(address), true, address);
  }
  assert.equal(isBlockedIp('93.184.216.34'), false);
  assert.equal(isBlockedIp('2606:2800:220:1:248:1893:25c8:1946'), false);
});

test('allows an allowlisted public hostname', async () => {
  process.env.ALLOWED_DOMAINS = 'example.com';
  delete process.env.ALLOW_ANY_PUBLIC_DOMAIN;
  const result = await validateUrl('https://example.com/path', {
    lookup: async () => [{ address: '93.184.216.34', family: 4 }],
  });
  assert.equal(result.valid, true);
});

test('rejects unlisted hosts, credentials, private DNS, and cross-site redirects', async () => {
  process.env.ALLOWED_DOMAINS = 'example.com';
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  assert.equal((await validateUrl('https://other.example/', { lookup })).status, 403);
  assert.equal((await validateUrl('https://user:pass@example.com/', { lookup })).status, 400);
  assert.equal((await validateUrl('https://example.com/', {
    lookup: async () => [{ address: '127.0.0.1', family: 4 }],
  })).status, 403);
  assert.equal((await validateUrl('https://other.example/', {
    lookup,
    enforceAllowedDomains: false,
    allowedNavigationHost: 'example.com',
  })).status, 403);
});

test('accepts a public IPv6 literal only with explicit unrestricted mode', async () => {
  process.env.ALLOWED_DOMAINS = '';
  process.env.ALLOW_ANY_PUBLIC_DOMAIN = 'true';
  const result = await validateUrl('https://[2606:2800:220:1:248:1893:25c8:1946]/');
  assert.equal(result.valid, true);
  assert.equal(result.hostname, '2606:2800:220:1:248:1893:25c8:1946');
  delete process.env.ALLOW_ANY_PUBLIC_DOMAIN;
});
