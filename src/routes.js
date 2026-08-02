import express from 'express';
import { requireAuthorization } from './auth.js';
import { isBrowserReady } from './browser.js';
import * as cache from './cache.js';
import { activeRenderFlights, joinRenderFlight } from './renderFlight.js';
import {
  getActiveRenders,
  getMaxRenderConcurrency,
  isCacheableDocumentStatus,
  tryAcquireRenderSlot,
} from './renderPolicy.js';
import { renderDocument } from './renderer.js';
import { validateUrl } from './urlPolicy.js';
import { ENGINE_VERSION } from './version.js';

function cacheTtl(req) {
  return cache.normalizeTtlSeconds(
    req.get('X-Prerender-Cache-Ttl-Seconds') || req.query.ttlSeconds || req.body?.ttlSeconds,
  );
}

function applyRenderHeaders(res, entry, cacheStatus, ttlSeconds, durationMs) {
  res.setHeader('X-Prerender-Cache', cacheStatus);
  res.setHeader('X-Prerender-Cache-Ttl', String(ttlSeconds));
  res.setHeader('X-Prerender-Final-Url', entry.finalUrl);
  if (durationMs !== undefined) res.setHeader('X-Prerender-Time', String(durationMs));
  res.setHeader('Cache-Control', 'private, max-age=60');
  res.type('html');
}

function sendOutcome(res, outcome, ttlSeconds, coalesced = false) {
  if (coalesced) res.setHeader('X-Prerender-Coordination', 'COALESCED');
  if (outcome.kind === 'error') {
    if (outcome.retryAfter) res.setHeader('Retry-After', String(outcome.retryAfter));
    return res.status(outcome.status).json({ error: outcome.error });
  }
  applyRenderHeaders(res, outcome.entry, coalesced ? 'HIT' : outcome.cacheStatus, ttlSeconds, outcome.durationMs);
  return res.status(outcome.entry.statusCode).send(outcome.entry.html);
}

export function createRoutes(options = {}) {
  const router = express.Router();
  const renderer = options.renderer || renderDocument;
  const urlValidator = options.validateUrl || validateUrl;
  const readiness = options.isReady || isBrowserReady;

  router.get('/health', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, service: '@prerenderbuddy/engine', version: ENGINE_VERSION });
  });

  router.get('/ready', (req, res) => {
    const ready = readiness();
    res.setHeader('Cache-Control', 'no-store');
    res.status(ready ? 200 : 503).json({ ready });
  });

  router.get('/internal/metrics', requireAuthorization, (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({
      observedAt: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      renders: { active: getActiveRenders(), maxConcurrency: getMaxRenderConcurrency() },
      coalescing: { activeFlights: activeRenderFlights() },
      cache: cache.stats(),
      memory: { rssBytes: process.memoryUsage().rss },
    });
  });

  async function handleRender(req, res) {
    const url = req.method === 'POST' ? req.body?.url : req.query.url;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Missing url' });

    const validation = await urlValidator(url);
    if (!validation.valid) return res.status(validation.status).json({ error: validation.error });

    const ttlSeconds = cacheTtl(req);
    const cached = cache.get(url, ttlSeconds);
    if (cached) {
      applyRenderHeaders(res, cached, 'HIT', ttlSeconds);
      return res.status(cached.statusCode).send(cached.html);
    }

    let flight;
    while (true) {
      flight = joinRenderFlight(url);
      if (flight.leader) break;
      const joined = await flight.wait();
      if (!joined.completed) {
        return sendOutcome(res, {
          kind: 'error', status: 503, error: 'Render coalescing wait exceeded', retryAfter: 2,
        }, ttlSeconds);
      }
      if (joined.value) return sendOutcome(res, joined.value, ttlSeconds, true);
    }

    try {
      const releaseSlot = tryAcquireRenderSlot();
      if (!releaseSlot) {
        const outcome = { kind: 'error', status: 503, error: 'Render capacity reached', retryAfter: 5 };
        flight.complete(outcome);
        return sendOutcome(res, outcome, ttlSeconds);
      }

      try {
        const rendered = await renderer(url, validation.hostname || validation.url.hostname);
        if (isCacheableDocumentStatus(rendered.entry.statusCode)) cache.set(url, rendered.entry);
        const outcome = { kind: 'entry', ...rendered, cacheStatus: 'MISS' };
        flight.complete(outcome);
        return sendOutcome(res, outcome, ttlSeconds);
      } catch (error) {
        const tooLarge = error?.code === 'RENDER_TOO_LARGE';
        const navigationBlocked = error?.code === 'RENDER_NAVIGATION_BLOCKED';
        const requestLimit = error?.code === 'RENDER_REQUEST_LIMIT';
        const timedOut = error?.name === 'TimeoutError';
        const outcome = {
          kind: 'error',
          status: tooLarge ? 413 : navigationBlocked ? 403 : requestLimit ? 422 : timedOut ? 504 : 500,
          error: tooLarge
            ? 'Rendered HTML exceeds the configured size limit'
            : navigationBlocked
              ? 'Render navigation blocked'
              : requestLimit
                ? 'Render request limit exceeded'
                : timedOut
                  ? 'Render timed out'
                  : 'Render failed',
        };
        flight.complete(outcome);
        return sendOutcome(res, outcome, ttlSeconds);
      } finally {
        releaseSlot();
      }
    } finally {
      flight.complete();
    }
  }

  router.get('/render', requireAuthorization, handleRender);
  router.post('/render', requireAuthorization, handleRender);

  router.get('/cache/read', requireAuthorization, async (req, res) => {
    const url = req.query.url;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Missing url' });
    const validation = await urlValidator(url);
    if (!validation.valid) return res.status(validation.status).json({ error: validation.error });
    const ttlSeconds = cacheTtl(req);
    const cached = cache.get(url, ttlSeconds, { includeExpired: req.query.includeExpired === 'true' });
    if (!cached) return res.status(404).json({ error: 'Cached render not found' });
    applyRenderHeaders(res, cached, 'HIT', ttlSeconds);
    return res.status(cached.statusCode).send(cached.html);
  });

  router.post('/cache/clear', requireAuthorization, async (req, res) => {
    const url = req.body?.url;
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'Missing url' });
    const validation = await urlValidator(url);
    if (!validation.valid) return res.status(validation.status).json({ error: validation.error });
    return res.json({ ok: true, url, removed: cache.remove(url) });
  });

  return router;
}
