import { timingSafeEqual } from 'node:crypto';

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function getRequestToken(req) {
  const authorization = req.get('Authorization') || '';
  if (/^Bearer /i.test(authorization)) return authorization.slice(7).trim();
  return req.get('X-Prerender-Token') || '';
}

export function isAuthorized(req, expected = process.env.PRERENDER_TOKEN) {
  return Boolean(expected && safeEqual(getRequestToken(req), expected));
}

export function requireAuthorization(req, res, next) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  return next();
}
