let activeRenders = 0;

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.round(parsed), min), max);
}

export function getRenderTimeoutMs() {
  return boundedInteger(process.env.RENDER_TIMEOUT_MS, 20_000, 1_000, 120_000);
}

export function getMaxRedirects() {
  return boundedInteger(process.env.RENDER_MAX_REDIRECTS, 10, 0, 20);
}

export function getMaxBrowserRequests() {
  return boundedInteger(process.env.RENDER_MAX_REQUESTS, 250, 10, 2_000);
}

export function getMaxRenderedHtmlBytes() {
  return boundedInteger(process.env.MAX_RENDERED_HTML_BYTES, 5_000_000, 100_000, 20_000_000);
}

export function getMaxRenderConcurrency() {
  return boundedInteger(process.env.RENDER_MAX_CONCURRENCY, 4, 1, 20);
}

export function normalizeDocumentStatus(value) {
  const status = Number(value);
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : 200;
}

export function isCacheableDocumentStatus(status) {
  return (status >= 200 && status < 400) || status === 404 || status === 410;
}

export function tryAcquireRenderSlot() {
  if (activeRenders >= getMaxRenderConcurrency()) return null;
  activeRenders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeRenders = Math.max(0, activeRenders - 1);
  };
}

export function getActiveRenders() {
  return activeRenders;
}

export function resetRenderSlotsForTests() {
  activeRenders = 0;
}
