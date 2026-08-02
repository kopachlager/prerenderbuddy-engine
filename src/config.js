const MIN_TOKEN_LENGTH = 32;

export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

export function parseCsv(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getAllowedDomains() {
  return parseCsv(process.env.ALLOWED_DOMAINS)
    .map((domain) => domain.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, ''));
}

export function getAllowedOrigins() {
  return parseCsv(process.env.ALLOWED_ORIGINS);
}

export function validateConfiguration(env = process.env) {
  const errors = [];
  const token = String(env.PRERENDER_TOKEN || '');
  const domains = parseCsv(env.ALLOWED_DOMAINS);

  if (token.length < MIN_TOKEN_LENGTH) {
    errors.push(`PRERENDER_TOKEN must contain at least ${MIN_TOKEN_LENGTH} characters`);
  }
  if (domains.length === 0 && !parseBoolean(env.ALLOW_ANY_PUBLIC_DOMAIN)) {
    errors.push('Set ALLOWED_DOMAINS or explicitly set ALLOW_ANY_PUBLIC_DOMAIN=true');
  }
  if (domains.some((domain) => /[*/\s]/.test(domain) || domain.includes('://'))) {
    errors.push('ALLOWED_DOMAINS must contain exact hostnames without wildcards, protocols, paths, or spaces');
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidConfiguration(env = process.env) {
  const result = validateConfiguration(env);
  if (!result.valid) {
    throw new Error(`Invalid configuration:\n- ${result.errors.join('\n- ')}`);
  }
}
