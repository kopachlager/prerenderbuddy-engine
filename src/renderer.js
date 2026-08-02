import { getBrowser } from './browser.js';
import {
  getMaxRedirects,
  getMaxRenderedHtmlBytes,
  getRenderTimeoutMs,
  normalizeDocumentStatus,
} from './renderPolicy.js';
import { validateUrl } from './urlPolicy.js';

async function installRequestGuard(context, initialHostname) {
  await context.route('**/*', async (route) => {
    const request = route.request();
    const requestUrl = request.url();
    if (!/^https?:/i.test(requestUrl)) return route.continue();
    if (request.isNavigationRequest() && countRedirects(request) > getMaxRedirects()) {
      return route.abort('blockedbyclient');
    }
    const validation = await validateUrl(requestUrl, {
      enforceAllowedDomains: false,
      allowedNavigationHost: request.isNavigationRequest() ? initialHostname : null,
    });
    return validation.valid ? route.continue() : route.abort('blockedbyclient');
  });
}

export function countRedirects(request) {
  let count = 0;
  let previous = request.redirectedFrom?.();
  while (previous) {
    count += 1;
    previous = previous.redirectedFrom?.();
  }
  return count;
}

export async function renderDocument(url, validatedHostname) {
  const browser = await getBrowser();
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    await installRequestGuard(context, validatedHostname);
    const page = await context.newPage();
    const startedAt = Date.now();
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: getRenderTimeoutMs() });
    const html = await page.content();
    if (Buffer.byteLength(html, 'utf8') > getMaxRenderedHtmlBytes()) {
      const error = new Error('Rendered HTML exceeds the configured size limit');
      error.code = 'RENDER_TOO_LARGE';
      throw error;
    }
    return {
      entry: { html, statusCode: normalizeDocumentStatus(response?.status()), finalUrl: page.url() },
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await context.close().catch(() => {});
  }
}
