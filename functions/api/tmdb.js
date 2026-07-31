// functions/api/tmdb.js — Cloudflare Pages Function (route: /api/tmdb)
// Proxies TMDB v3. Path comes via ?path=trending/all/day; remaining params forwarded.
// Best-effort warm-isolate cache + edge cache via s-maxage.

import { logRateLimit, rateLimitHeaders } from './_ratelimit.js';

const cache = new Map();
const TTL = 30 * 60 * 1000; // 30 min — trending barely changes

const BASE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (!env.TMDB_KEY) {
    return new Response(JSON.stringify({ error: 'TMDB_KEY not set' }), {
      status: 500,
      headers: BASE_HEADERS,
    });
  }

  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const path = params.path || '';
  delete params.path;

  const cacheKey = `${path}?${new URLSearchParams(params).toString()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < TTL) {
    return new Response(hit.body, {
      status: 200,
      headers: { ...BASE_HEADERS, 'X-Cache': 'HIT' },
    });
  }

  const qs = new URLSearchParams({ ...params, api_key: env.TMDB_KEY }).toString();
  try {
    const res = await fetch(`https://api.themoviedb.org/3/${path}?${qs}`);
    const data = await res.text();
    if (res.ok) cache.set(cacheKey, { t: Date.now(), body: data });
    await logRateLimit(env, 'tmdb', res, context);
    return new Response(data, {
      status: res.status,
      headers: {
        ...BASE_HEADERS,
        ...rateLimitHeaders(res, 'tmdb'),
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
