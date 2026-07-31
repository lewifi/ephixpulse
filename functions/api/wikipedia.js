// functions/api/wikipedia.js — Cloudflare Pages Function (route: /api/wikipedia)
// Proxies Wikimedia pageviews. Caches 404s too, so titles with no article
// aren't re-queried. CORS header set explicitly for browser calls.

import { logRateLimit, rateLimitHeaders } from './_ratelimit.js';

const cache = new Map();
const TTL = 12 * 60 * 60 * 1000; // 12 hours

const BASE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const article = url.searchParams.get('article');
  const range = url.searchParams.get('range');

  if (!article || !range) {
    return new Response(JSON.stringify({ error: 'Missing article or range' }), {
      status: 400,
      headers: BASE_HEADERS,
    });
  }

  const cacheKey = `${article}/${range}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < TTL) {
    return new Response(hit.body, {
      status: hit.status,
      headers: { ...BASE_HEADERS, 'X-Cache': 'HIT' },
    });
  }

  const endpoint =
    `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/` +
    `en.wikipedia/all-access/user/${article}/daily/${range}`;
  try {
    const res = await fetch(endpoint, {
      headers: { 'User-Agent': 'EphixPulse/1.0 (https://ephix.net)' },
    });
    const data = await res.text();
    // Cache both hits AND 404s
    cache.set(cacheKey, { t: Date.now(), status: res.status, body: data });
    await logRateLimit(env, 'wikipedia', res, context);
    return new Response(data, {
      status: res.status,
      headers: {
        ...BASE_HEADERS,
        ...rateLimitHeaders(res, 'wikipedia'),
        'Cache-Control': 'public, max-age=43200, s-maxage=43200',
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
