// functions/api/trakt.js — Cloudflare Pages Function (route: /api/trakt)
// Proxies Trakt. Trakt's CDN blocks default User-Agents, so a custom UA is set
// (same fix as the Netlify version). Verify this still passes through CF's fetch.

import { logRateLimit, rateLimitHeaders } from './_ratelimit.js';

const cache = new Map();
const TTL = 30 * 60 * 1000;

const BASE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export async function onRequest(context) {
  const { request, env } = context;

  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const path = params.path || '';
  delete params.path;

  const qs = new URLSearchParams(params).toString();
  const cacheKey = `${path}?${qs}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < TTL) {
    return new Response(hit.body, {
      status: 200,
      headers: { ...BASE_HEADERS, 'X-Cache': 'HIT' },
    });
  }

  try {
    const res = await fetch(`https://api.trakt.tv/${path}${qs ? '?' + qs : ''}`, {
      headers: {
        'Content-Type': 'application/json',
        'trakt-api-version': '2',
        'trakt-api-key': env.TRAKT_KEY,
        'User-Agent': 'Mozilla/5.0 (compatible; EphixPulse/1.0; +https://ephix.net)',
      },
    });
    const data = await res.text();
    if (res.ok) cache.set(cacheKey, { t: Date.now(), body: data });
    await logRateLimit(env, 'trakt', res, context);
    return new Response(data, {
      status: res.status,
      headers: {
        ...BASE_HEADERS,
        ...rateLimitHeaders(res, 'trakt'),
        'Cache-Control': 'public, max-age=1800, s-maxage=1800',
        'X-Cache': 'MISS',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: BASE_HEADERS,
    });
  }
}
