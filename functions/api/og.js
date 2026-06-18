// functions/api/og.js — Cloudflare PAGES FUNCTION
//
// Routes:
//   /api/og                       → homepage card        (this file's onRequest)
//   /api/og/promo                 → top-5 poster strip   (functions/api/og/promo.js)
//   /api/og/movie/12345           → movie card           (functions/api/og/[type]/[id].js
//   /api/og/tv/12345              → TV card                imports renderOG from here)
//   /api/og?type=movie&id=12345   → still works (legacy query form, kept for any
//                                    URLs Facebook/Discord already cached)
//
// Pages Function: entry is `onRequest`, NOT a Worker `export default { fetch }`.
// Keep as one clean file — do not append code below.
//
// Lean by design to stay under Cloudflare's per-request resource limit (1102):
// ONE poster fetched per request and inlined as a data URI (no remote image
// fetches inside the renderer), two small fonts, no in-memory PNG cache (the
// edge caches via Cache-Control).

import React from 'react';
import { ImageResponse } from 'workers-og';

const TMDB = 'https://api.themoviedb.org/3';
const POSTER = 'https://image.tmdb.org/t/p/w342';

const BEBAS_URL  = 'https://cdn.jsdelivr.net/fontsource/fonts/bebas-neue@latest/latin-400-normal.ttf';
const DMSANS_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/dm-sans@latest/latin-400-normal.ttf';

let FONTS = null;
async function loadFonts() {
  if (FONTS) return FONTS;
  const [bebas, dm] = await Promise.all([
    fetch(BEBAS_URL).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null),
    fetch(DMSANS_URL).then(r => (r.ok ? r.arrayBuffer() : null)).catch(() => null),
  ]);
  const fonts = [];
  if (dm)    fonts.push({ name: 'DM Sans',    data: dm,    style: 'normal', weight: 400 });
  if (bebas) fonts.push({ name: 'Bebas Neue', data: bebas, style: 'normal', weight: 400 });
  FONTS = fonts;
  return FONTS;
}

function base64FromBuffer(arrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(arrayBuffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function posterDataUri(posterPath) {
  if (!posterPath) return null;
  try {
    const res = await fetch(`${POSTER}${posterPath}`);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return `data:image/jpeg;base64,${base64FromBuffer(buf)}`;
  } catch {
    return null;
  }
}

function truncate(s, n) {
  s = s || '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

const BG = {
  width: '1200px', height: '630px', display: 'flex', color: '#ffffff',
  overflow: 'hidden',                                   // clips the bleeding posters
  backgroundColor: '#080a0f',
  backgroundImage: 'linear-gradient(135deg, #080a0f 0%, #0a1424 100%)',
  fontFamily: 'DM Sans',
};

function posterBox(h, uri, w, ht, key) {
  return h('div', {
    key,
    style: {
      width: `${w}px`, height: `${ht}px`, borderRadius: '12px', overflow: 'hidden',
      backgroundColor: '#13182a', display: 'flex',
      border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
    },
  }, uri ? [h('img', { key: 'i', src: uri, width: w, height: ht, style: { objectFit: 'cover' } })] : []);
}

// ─── HOMEPAGE CARD ───────────────────────────────────────────────
// Top 3 trending as three different posters. The middle is #1 (the hero),
// enlarged; #2 (top) and #3 (bottom) are smaller and bleed off the card edges
// (the stack is taller than the card and vertically centred, clipped by overflow).
function renderHomeCard(h, items, uris) {
  const top1 = items[0] || {};
  const title = truncate(top1.title || top1.name || 'EPHIX PULSE', 26);
  const year = (top1.release_date || top1.first_air_date || '').slice(0, 4);

  const heroUri = uris[0] || null;             // #1 — hero, centred
  const topUri  = uris[1] || uris[0] || null;  // #2 — top, clipped
  const botUri  = uris[2] || uris[0] || null;  // #3 — bottom, clipped

  return h('div', { style: BG }, [
    h('div', {
      key: 'left',
      style: {
        width: '360px', height: '630px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '16px',
        paddingLeft: '55px', flexShrink: 0,
      },
    }, [
      posterBox(h, topUri, 215, 323, 'p1'),    // #2 — clipped
      posterBox(h, heroUri, 250, 375, 'p2'),   // #1 — hero, full
      posterBox(h, botUri, 215, 323, 'p3'),    // #3 — clipped
    ]),

    h('div', {
      key: 'div',
      style: { display: 'flex', width: '1px', backgroundColor: 'rgba(33,150,243,0.2)', margin: '60px 45px' },
    }),

    h('div', {
      key: 'right',
      style: {
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        flex: 1, padding: '60px 60px 60px 0',
      },
    }, [
      h('div', { key: 'top', style: { display: 'flex', flexDirection: 'column' } }, [
        h('div', { key: 'l', style: { fontSize: '20px', color: '#2196F3', letterSpacing: '6px', marginBottom: '24px' } }, 'LIVE TOP 100 · WORLDWIDE'),
        h('div', { key: 'h', style: { fontSize: '60px', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-1px', display: 'flex', flexDirection: 'column' } }, [
          h('span', { key: 'a' }, 'What the World'),
          h('span', { key: 'b' }, 'is Watching'),
        ]),
      ]),
      h('div', { key: 'mid', style: { display: 'flex', flexDirection: 'column' } }, [
        h('div', { key: 's', style: { fontSize: '18px', color: 'rgba(255,255,255,0.5)', letterSpacing: '4px', marginBottom: '14px' } }, 'TRENDING #1'),
        h('div', { key: 't', style: { fontFamily: 'Bebas Neue', fontSize: '58px', letterSpacing: '2px', lineHeight: 1.05 } }, title),
        year ? h('div', { key: 'y', style: { fontSize: '22px', color: 'rgba(255,255,255,0.45)', marginTop: '8px' } }, year) : null,
      ]),
      h('div', { key: 'bot', style: { display: 'flex', flexDirection: 'column' } }, [
        h('div', { key: 'lg', style: { fontFamily: 'Bebas Neue', fontSize: '52px', color: '#2196F3', letterSpacing: '8px', lineHeight: 1 } }, 'EPHIX PULSE'),
        h('div', { key: 'tg', style: { fontSize: '15px', color: 'rgba(255,255,255,0.4)', letterSpacing: '2px', marginTop: '10px' } }, 'ephix.net · what the world is watching'),
      ]),
    ]),
  ]);
}

// ─── PER-TITLE CARD ──────────────────────────────────────────────
function renderTitleCard(h, detail, type, uri) {
  const title = truncate(detail.title || detail.name || 'Untitled', 38);
  const year = (detail.release_date || detail.first_air_date || '').slice(0, 4);
  const overview = truncate(detail.overview || '', 170);
  const genres = (detail.genres || []).slice(0, 3).map(g => g.name).join(' · ');
  const typeLabel = type === 'movie' ? 'FILM' : 'TV SERIES';

  return h('div', { style: { ...BG, padding: '50px' } }, [
    posterBox(h, uri, 350, 530, 'poster'),
    h('div', { key: 'div', style: { display: 'flex', width: '1px', backgroundColor: 'rgba(33,150,243,0.2)', margin: '20px 40px' } }),
    h('div', {
      key: 'right',
      style: { display: 'flex', flexDirection: 'column', flex: 1, paddingTop: '20px', paddingBottom: '10px', justifyContent: 'space-between' },
    }, [
      h('div', { key: 'top', style: { display: 'flex', flexDirection: 'column' } }, [
        h('div', { key: 'l', style: { fontSize: '16px', color: '#2196F3', letterSpacing: '5px', marginBottom: '16px' } }, `TRENDING · ${typeLabel}`),
        h('div', { key: 't', style: { fontFamily: 'Bebas Neue', fontSize: title.length > 22 ? '64px' : '78px', letterSpacing: '2px', lineHeight: 1, marginBottom: '14px' } }, title),
        h('div', { key: 'm', style: { fontSize: '17px', color: 'rgba(255,255,255,0.55)', display: 'flex', gap: '14px', marginBottom: '18px' } }, [
          year ? h('span', { key: 'y' }, year) : null,
          genres ? h('span', { key: 'g' }, genres) : null,
        ].filter(Boolean)),
        overview ? h('div', { key: 'o', style: { fontSize: '16px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, display: 'flex' } }, overview) : null,
      ]),
      h('div', { key: 'bot', style: { display: 'flex', flexDirection: 'column' } }, [
        h('div', { key: 'lg', style: { fontFamily: 'Bebas Neue', fontSize: '44px', color: '#2196F3', letterSpacing: '7px', lineHeight: 1 } }, 'EPHIX PULSE'),
        h('div', { key: 'tg', style: { fontSize: '13px', color: 'rgba(255,255,255,0.4)', letterSpacing: '2px', marginTop: '8px' } }, 'ephix.net · what the world is watching'),
      ]),
    ]),
  ]);
}

// Shared renderer used by BOTH /api/og and /api/og/<type>/<id>.
export async function renderOG(context, rawType, rawId) {
  const { env } = context;
  try {
    const type = rawType === 'movie' || rawType === 'tv' ? rawType : null;
    const id = rawId && /^\d+$/.test(String(rawId)) ? String(rawId) : null;

    const key = env.TMDB_KEY;
    if (!key) {
      return new Response(JSON.stringify({ error: 'TMDB_KEY not set' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const fonts = await loadFonts();
    const h = React.createElement;
    let root;

    if (type && id) {
      const detail = await fetch(`${TMDB}/${type}/${id}?api_key=${key}`).then(r => (r.ok ? r.json() : null));
      if (detail) {
        const uri = await posterDataUri(detail.poster_path);
        root = renderTitleCard(h, detail, type, uri);
      } else {
        root = await homeRoot(h, key);
      }
    } else {
      root = await homeRoot(h, key);
    }

    const image = new ImageResponse(root, { width: 1200, height: 630, fonts });
    return new Response(image.body, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600, s-maxage=86400',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function homeRoot(h, key) {
  const data = await fetch(`${TMDB}/trending/all/day?api_key=${key}`).then(r => r.json());
  const items = (data.results || []).slice(0, 3);
  const uris = await Promise.all(items.map(it => posterDataUri(it.poster_path)));
  return renderHomeCard(h, items, uris);
}

// ─── PROMO STRIP (wc2026 CTA, etc.) ──────────────────────────────
// Top 5 from latest pulse_snapshots when available; TMDB trending fallback.
async function fetchTopItems(env, limit = 5) {
  const key = env.TMDB_KEY;
  const { SUPABASE_URL, SUPABASE_KEY } = env;

  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const REST = `${SUPABASE_URL}/rest/v1/pulse_snapshots`;
      const hdrs = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
      const latest = await fetch(`${REST}?select=captured_at&order=captured_at.desc&limit=1`, { headers: hdrs })
        .then(r => (r.ok ? r.json() : null));
      if (latest?.[0]?.captured_at) {
        const ts = latest[0].captured_at;
        const rows = await fetch(
          `${REST}?captured_at=eq.${encodeURIComponent(ts)}&select=tmdb_id,media_type,title,rank&order=rank.asc&limit=${limit}`,
          { headers: hdrs },
        ).then(r => (r.ok ? r.json() : null));
        if (rows?.length) {
          const enriched = await Promise.all(rows.map(async (row) => {
            const detail = await fetch(`${TMDB}/${row.media_type}/${row.tmdb_id}?api_key=${key}`)
              .then(r => (r.ok ? r.json() : null));
            return {
              rank: row.rank,
              title: row.title || detail?.title || detail?.name || '',
              media_type: row.media_type,
              id: row.tmdb_id,
              poster_path: detail?.poster_path || null,
            };
          }));
          if (enriched.length) return enriched;
        }
      }
    } catch { /* fall through to TMDB */ }
  }

  const data = await fetch(`${TMDB}/trending/all/day?api_key=${key}`).then(r => r.json());
  return (data.results || [])
    .filter(it => it.media_type === 'movie' || it.media_type === 'tv')
    .slice(0, limit)
    .map((it, i) => ({
      rank: i + 1,
      title: it.title || it.name || '',
      media_type: it.media_type,
      id: it.id,
      poster_path: it.poster_path,
    }));
}

const PROMO_POSTER_W = 52;
const PROMO_POSTER_H = 78;
const PROMO_GAP = 8;
const PROMO_PAD = 6;

function promoStripSize(count) {
  const n = Math.max(1, Math.min(count, 5));
  return {
    width: PROMO_PAD * 2 + n * PROMO_POSTER_W + Math.max(0, n - 1) * PROMO_GAP,
    height: PROMO_PAD * 2 + PROMO_POSTER_H,
  };
}

function renderPromoStrip(h, items, uris) {
  const slice = items.slice(0, 5);
  const { width, height } = promoStripSize(slice.length);

  return h('div', {
    style: {
      width: `${width}px`, height: `${height}px`, display: 'flex', gap: `${PROMO_GAP}px`,
      padding: `${PROMO_PAD}px`, alignItems: 'flex-end',
      backgroundColor: '#0d1520',
    },
  }, slice.map((item, i) => h('div', {
    key: String(item.id || i),
    style: { position: 'relative', display: 'flex', width: `${PROMO_POSTER_W}px`, height: `${PROMO_POSTER_H}px`, flexShrink: 0 },
  }, [
    posterBox(h, uris[i], PROMO_POSTER_W, PROMO_POSTER_H, `p${i}`),
    h('div', {
      key: 'r',
      style: {
        position: 'absolute', top: '3px', left: '3px',
        fontFamily: 'Bebas Neue', fontSize: '14px', color: '#ffffff',
        backgroundColor: 'rgba(8,10,15,0.78)', borderRadius: '3px',
        padding: '1px 5px', lineHeight: 1.2,
      },
    }, String(item.rank || i + 1)),
  ])));
}

export async function renderOGPromo(context) {
  const { env } = context;
  try {
    const key = env.TMDB_KEY;
    if (!key) {
      return new Response(JSON.stringify({ error: 'TMDB_KEY not set' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const items = await fetchTopItems(env, 5);
    if (!items.length) {
      return new Response(JSON.stringify({ error: 'No trending data' }), {
        status: 404, headers: { 'Content-Type': 'application/json' },
      });
    }
    const uris = await Promise.all(items.map(it => posterDataUri(it.poster_path)));
    const fonts = await loadFonts();
    const h = React.createElement;
    const { width, height } = promoStripSize(items.length);

    const image = new ImageResponse(renderPromoStrip(h, items, uris), { width, height, fonts });
    return new Response(image.body, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=900, s-maxage=3600',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
}

// /api/og (homepage) — also honours the legacy ?type=&id= query form.
export async function onRequest(context) {
  const url = new URL(context.request.url);
  return renderOG(context, url.searchParams.get('type'), url.searchParams.get('id'));
}
