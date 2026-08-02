import { getBrowser } from './browser.js';
import {
  getMaxBrowserRequests,
  getMaxRedirects,
  getMaxRenderedHtmlBytes,
  getRenderTimeoutMs,
  normalizeDocumentStatus,
} from './renderPolicy.js';
import { validateUrl } from './urlPolicy.js';

async function installRequestGuard(context, initialHostname, urlValidator) {
  let requestCount = 0;
  let navigationRequestCount = 0;
  let policyError = null;
  let mainPage = null;

  await context.route('**/*', async (route) => {
    const request = route.request();
    const requestUrl = request.url();
    if (!/^https?:/i.test(requestUrl)) return route.continue();
    const isDocumentNavigation = request.isNavigationRequest() || request.resourceType() === 'document';
    const isMainPageNavigation = isDocumentNavigation && belongsToPage(request, mainPage);
    requestCount += 1;
    if (requestCount > getMaxBrowserRequests()) {
      policyError = createRequestLimitError();
      await route.abort('blockedbyclient').catch(() => {});
      await context.close().catch(() => {});
      return undefined;
    }
    if (isMainPageNavigation && countRedirects(request) > getMaxRedirects()) {
      policyError = createNavigationBlockedError();
      return route.abort('blockedbyclient');
    }
    const validation = await urlValidator(requestUrl, {
      enforceAllowedDomains: isDocumentNavigation,
      allowedNavigationHost: isDocumentNavigation ? initialHostname : null,
    });
    if (validation.valid) return route.continue();
    if (isMainPageNavigation) policyError = createNavigationBlockedError();
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*', (webSocketRoute) => (
    webSocketRoute.close({ code: 1008, reason: 'Blocked by render policy' })
  ));
  return {
    getPolicyError: () => policyError,
    setMainPage(page) {
      mainPage = page;
      page.on('request', (request) => {
        const isDocumentNavigation = request.isNavigationRequest() || request.resourceType() === 'document';
        if (!isDocumentNavigation) return;
        navigationRequestCount += 1;
        if (navigationRequestCount <= getMaxRedirects() + 1) return;
        policyError = createNavigationBlockedError();
        void page.close().catch(() => {});
      });
    },
  };
}

function belongsToPage(request, page) {
  if (!page) return false;
  try {
    return request.frame().page() === page;
  } catch {
    return false;
  }
}

function createNavigationBlockedError() {
  const error = new Error('Navigation blocked by render policy');
  error.code = 'RENDER_NAVIGATION_BLOCKED';
  return error;
}

function createRequestLimitError() {
  const error = new Error('Render request limit exceeded');
  error.code = 'RENDER_REQUEST_LIMIT';
  return error;
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

export async function renderDocument(url, validatedHostname, options = {}) {
  const browser = options.browser || await getBrowser();
  const urlValidator = options.validateUrl || validateUrl;
  const context = await browser.newContext({ reducedMotion: 'reduce', serviceWorkers: 'block' });
  try {
    const requestGuard = await installRequestGuard(context, validatedHostname, urlValidator);
    const page = await context.newPage();
    requestGuard.setMainPage(page);
    const startedAt = Date.now();
    let response;
    try {
      response = await page.goto(url, { waitUntil: 'networkidle', timeout: getRenderTimeoutMs() });
    } catch (error) {
      throw requestGuard.getPolicyError() || error;
    }
    if (requestGuard.getPolicyError()) throw requestGuard.getPolicyError();

    const finalValidation = await urlValidator(page.url(), {
      enforceAllowedDomains: true,
      allowedNavigationHost: validatedHostname,
    });
    if (!finalValidation.valid) throw createNavigationBlockedError();

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
