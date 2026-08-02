import express from 'express';
import { getAllowedOrigins } from './config.js';
import { createRoutes } from './routes.js';

export function createApp(options = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb', strict: true }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    const origin = req.get('Origin');
    const allowedOrigins = getAllowedOrigins();
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Prerender-Token, X-Prerender-Cache-Ttl-Seconds');
      res.setHeader('Access-Control-Expose-Headers', 'X-Prerender-Cache, X-Prerender-Cache-Ttl, X-Prerender-Time, X-Prerender-Final-Url, X-Prerender-Coordination');
    }
    if (req.method === 'OPTIONS') {
      return origin && allowedOrigins.includes(origin) ? res.sendStatus(204) : res.sendStatus(403);
    }
    return next();
  });
  app.use(createRoutes(options));
  app.use((req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON body' });
    console.error('Unhandled request error:', error?.message || 'unknown');
    return res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
