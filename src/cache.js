const entries = new Map();
let totalBytes = 0;

const DEFAULT_TTL_SECONDS = 1_800;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

export function normalizeTtlSeconds(value) {
  return boundedInteger(value, DEFAULT_TTL_SECONDS, 1, 604_800);
}

function maxEntries() {
  return boundedInteger(process.env.CACHE_MAX_ENTRIES, 500, 1, 10_000);
}

function maxBytes() {
  return boundedInteger(process.env.CACHE_MAX_BYTES, 100_000_000, 1_000_000, 1_000_000_000);
}

function removeEntry(url) {
  const entry = entries.get(url);
  if (!entry) return false;
  totalBytes = Math.max(0, totalBytes - entry.byteLength);
  return entries.delete(url);
}

export function get(url, ttlSeconds = process.env.CACHE_TTL_SECONDS, options = {}) {
  const entry = entries.get(url);
  if (!entry) return null;
  const expired = Date.now() - entry.createdAt > normalizeTtlSeconds(ttlSeconds) * 1_000;
  if (expired && !options.includeExpired) {
    removeEntry(url);
    return null;
  }
  entries.delete(url);
  entries.set(url, entry);
  return { html: entry.html, statusCode: entry.statusCode, finalUrl: entry.finalUrl, expired };
}

export function set(url, value) {
  const byteLength = Buffer.byteLength(value.html, 'utf8');
  if (byteLength > maxBytes()) return false;
  removeEntry(url);
  while (entries.size >= maxEntries() || totalBytes + byteLength > maxBytes()) {
    removeEntry(entries.keys().next().value);
  }
  entries.set(url, { ...value, byteLength, createdAt: Date.now() });
  totalBytes += byteLength;
  return true;
}

export const remove = removeEntry;

export function clear() {
  entries.clear();
  totalBytes = 0;
}

export function stats() {
  return { entries: entries.size, bytes: totalBytes };
}
