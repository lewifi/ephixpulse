// functions/api/img.js — Cloudflare Pages Function
// Same-origin proxy for TMDB poster images so they can be drawn onto a
// <canvas> and exported (toDataURL/toBlob) without tainting it.
// Usage: /api/img?p=/abc123.jpg   (p = TMDB poster_path)

const POSTER = 'https://image.tmdb.org/t/p/w500';

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const p = url.searchParams.get('p') || '';

  // Only allow TMDB poster-path-shaped values (prevents open-proxy abuse)
  if (!/^\/[A-Za-z0-9._-]+\.(jpg|jpeg|png|webp)$/i.test(p)) {
    return new Response('Bad path', { status: 400 });
  }

  const upstream = await fetch(POSTER + p, {
    cf: { cacheTtl: 86400, cacheEverything: true },
  });
  if (!upstream.ok) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  headers.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800');
  return new Response(upstream.body, { status: 200, headers });
}
