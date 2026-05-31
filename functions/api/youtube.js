// functions/api/youtube.js — Cloudflare Pages Function (route: /api/youtube)
// Proxies YouTube Data API v3. Long TTL to protect daily quota.

const cache = new Map();
const TTL = 6 * 60 * 60 * 1000; // 6 hours — saves quota heavily

const BASE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export async function onRequest(context) {
  const { request, env } = context;

  if (!env.YOUTUBE_KEY) {
    return new Response(JSON.stringify({ error: 'YOUTUBE_KEY not set' }), {
      status: 500,
      headers: BASE_HEADERS,
    });
  }

  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const path = params.path || 'videos';
  delete params.path;

  const cacheKey = `${path}?${new URLSearchParams(params).toString()}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < TTL) {
    return new Response(hit.body, {
      status: 200,
      headers: { ...BASE_HEADERS, 'X-Cache': 'HIT' },
    });
  }

  const qs = new URLSearchParams({ ...params, key: env.YOUTUBE_KEY }).toString();
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}?${qs}`);
    const data = await res.text();
    if (res.ok) cache.set(cacheKey, { t: Date.now(), body: data });
    return new Response(data, {
      status: res.status,
      headers: {
        ...BASE_HEADERS,
        'Cache-Control': 'public, max-age=21600, s-maxage=21600',
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
