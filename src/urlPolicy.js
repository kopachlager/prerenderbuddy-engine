import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { getAllowedDomains, parseBoolean } from './config.js';

const MAX_URL_LENGTH = 4_096;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

export function getDnsLookupTimeoutMs() {
  return boundedInteger(process.env.DNS_LOOKUP_TIMEOUT_MS, 2_000, 100, 10_000);
}

function normalizeHostname(hostname) {
  return String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

function normalizeSiteHostname(hostname) {
  return normalizeHostname(hostname).replace(/^www\./, '');
}

function ipv4ToNumber(address) {
  return address.split('.').reduce((value, part) => ((value << 8) + Number(part)) >>> 0, 0);
}

function inIpv4Range(address, network, prefix) {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(network) & mask);
}

const BLOCKED_IPV4_RANGES = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];

export function isBlockedIp(address) {
  try {
    let parsed = ipaddr.parse(normalizeHostname(address));
    if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) parsed = parsed.toIPv4Address();
    if (parsed.range() !== 'unicast') return true;
    return parsed.kind() === 'ipv4'
      && BLOCKED_IPV4_RANGES.some(([network, prefix]) => inIpv4Range(parsed.toString(), network, prefix));
  } catch {
    return true;
  }
}

function hostnameAllowed(hostname) {
  if (parseBoolean(process.env.ALLOW_ANY_PUBLIC_DOMAIN)) return true;
  return getAllowedDomains().includes(normalizeHostname(hostname));
}

async function resolveAddresses(hostname, lookup = dns.lookup, timeoutMs = getDnsLookupTimeoutMs()) {
  if (ipaddr.isValid(hostname)) return [hostname];
  let timer;
  const records = await Promise.race([
    Promise.resolve().then(() => lookup(hostname, { all: true, verbatim: true })),
    new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('DNS lookup timed out')), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
  return records.map((record) => record.address);
}

export async function validateUrl(urlString, options = {}) {
  if (typeof urlString !== 'string' || urlString.length === 0 || urlString.length > MAX_URL_LENGTH) {
    return { valid: false, status: 400, error: 'Invalid URL format' };
  }

  let url;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, status: 400, error: 'Invalid URL format' };
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return { valid: false, status: 400, error: 'Only http and https URLs are allowed' };
  }
  if (url.username || url.password) {
    return { valid: false, status: 400, error: 'URLs with embedded credentials are not allowed' };
  }

  const hostname = normalizeHostname(url.hostname);
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    return { valid: false, status: 403, error: 'URL not allowed' };
  }
  if (options.enforceAllowedDomains !== false && !hostnameAllowed(hostname)) {
    return { valid: false, status: 403, error: 'URL not allowed' };
  }
  if (options.allowedNavigationHost
    && normalizeSiteHostname(hostname) !== normalizeSiteHostname(options.allowedNavigationHost)) {
    return { valid: false, status: 403, error: 'Redirected to a different hostname' };
  }

  try {
    const addresses = await resolveAddresses(hostname, options.lookup, options.lookupTimeoutMs);
    if (addresses.length === 0 || addresses.some(isBlockedIp)) {
      return { valid: false, status: 403, error: 'URL not allowed' };
    }
  } catch {
    return { valid: false, status: 400, error: 'Unable to resolve URL hostname' };
  }

  return { valid: true, url, hostname };
}
