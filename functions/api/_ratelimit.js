// functions/api/_ratelimit.js — shared rate-limit logger for API proxy workers.
// Detects 429s from upstream APIs and logs them to KV + console.
// Usage: await logRateLimit(env, 'tmdb', res);

const HOUR_MS = 60 * 60 * 1000;

/**
 * Call after every upstream fetch. If the response is a 429, logs it.
 * @param {object} env - Cloudflare env (needs RATE_KV binding, optional)
 * @param {string} service - e.g. 'tmdb', 'trakt', 'youtube', 'wikipedia'
 * @param {Response} res - the upstream Response object
 * @param {object} [ctx] - the Pages Function context (for waitUntil)
 * @returns {boolean} true if rate-limited
 */
export function isRateLimited(res) {
  return res.status === 429;
}

export async function logRateLimit(env, service, res, ctx) {
  if (res.status !== 429) return false;

  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10); // e.g. 2026-08-01
  const hourKey = now.toISOString().slice(0, 13);  // e.g. 2026-08-01T07

  // Always log to console (visible in CF dashboard > Workers & Pages > Real-time logs)
  const retryAfter = res.headers.get('Retry-After') || 'unknown';
  console.error(`[RATE LIMIT] ${service.toUpperCase()} 429 at ${now.toISOString()} | Retry-After: ${retryAfter}`);

  // Log to KV if bound (non-blocking)
  const kv = env.RATE_KV || env.PUSH_KV;
  if (kv && ctx) {
    const kvKey = `ratelimit:${service}:${dateKey}`;
    ctx.waitUntil((async () => {
      try {
        const raw = await kv.get(kvKey);
        const data = raw ? JSON.parse(raw) : { service, date: dateKey, hits: [], count: 0 };
        data.count++;
        // Keep last 50 timestamps per day (don't bloat KV)
        if (data.hits.length < 50) {
          data.hits.push({ time: now.toISOString(), retryAfter, hour: hourKey });
        }
        // Expire after 30 days
        await kv.put(kvKey, JSON.stringify(data), { expirationTtl: 30 * 24 * 3600 });
      } catch (err) {
        console.error(`[RATE LIMIT] KV write failed for ${service}: ${err.message}`);
      }
    })());
  }

  return true;
}

/**
 * Adds rate-limit info headers to outgoing response.
 */
export function rateLimitHeaders(res, service) {
  const headers = {};
  if (res.status === 429) {
    headers['X-Ratelimited'] = service;
    headers['X-Ratelimited-At'] = new Date().toISOString();
    const retryAfter = res.headers.get('Retry-After');
    if (retryAfter) headers['X-Retry-After'] = retryAfter;
  }
  return headers;
}
