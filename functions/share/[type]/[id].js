// functions/share/[type]/[id].js — Cloudflare Pages Function
// Routes: /share/movie/12345  and  /share/tv/12345
// Bots/scrapers get HTML with per-title OG tags; humans are redirected to the
// main site with the modal pre-opened. type + id come from the dynamic route.

const TMDB_BASE = 'https://api.themoviedb.org/3';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(s, n) {
  s = s || '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function fetchTitle(type, id, key) {
  if (!key) return null;
  try {
    const res = await fetch(`${TMDB_BASE}/${type}/${id}?api_key=${key}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

function isBot(ua = '') {
  return /(facebookexternalhit|twitterbot|linkedinbot|discordbot|telegrambot|whatsapp|slackbot|redditbot|skypeuripreview|googlebot|bingbot|pinterestbot|embedly|outbrain|nuzzel|vkshare|w3c_validator|qwantify|applebot)/i.test(ua.toLowerCase());
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const type = params.type;
  const id = params.id;

  // Only movie/tv with a numeric id are valid
  if ((type !== 'movie' && type !== 'tv') || !/^\d+$/.test(String(id))) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const detail = await fetchTitle(type, id, env.TMDB_KEY);

  const title = detail ? (detail.title || detail.name || 'EPHIX PULSE') : 'EPHIX PULSE';
  const year = detail ? (detail.release_date || detail.first_air_date || '').slice(0, 4) : '';
  const overview = detail ? truncate(detail.overview || '', 200) : '';

  const ogTitle = `${title}${year ? ` (${year})` : ''} — Trending on EPHIX PULSE`;
  const ogDesc = overview || `${title} is currently trending on EPHIX PULSE — see what the world is watching right now.`;
  const ogImage = `https://www.ephix.net/api/og?type=${type}&id=${id}`;
  const shareUrl = `https://www.ephix.net/share/${type}/${id}`;
  const siteUrl = `https://www.ephix.net/?t=${type}-${id}`;

  const ua = request.headers.get('user-agent') || '';

  // Real users: redirect straight to the site
  if (!isBot(ua)) {
    return new Response('', {
      status: 302,
      headers: { Location: siteUrl },
    });
  }

  // Bots: serve HTML with full OG tags
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${esc(ogTitle)}</title>
<meta name="description" content="${esc(ogDesc)}">

<meta property="og:type" content="video.${type === 'movie' ? 'movie' : 'tv_show'}">
<meta property="og:site_name" content="EPHIX PULSE">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(ogDesc)}">
<meta property="og:url" content="${shareUrl}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle)}">
<meta name="twitter:description" content="${esc(ogDesc)}">
<meta name="twitter:image" content="${ogImage}">

<link rel="canonical" href="${siteUrl}">
<meta http-equiv="refresh" content="0; url=${siteUrl}">
</head>
<body>
<p>Redirecting to <a href="${siteUrl}">${esc(title)} on EPHIX PULSE</a>…</p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
