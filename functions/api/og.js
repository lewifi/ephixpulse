// functions/api/og.js — Cloudflare PAGES FUNCTION  (route: /api/og)
//
// IMPORTANT: this is a Pages Function. Its entry point is `onRequest`, NOT a
// Worker-style `export default { fetch }`. Do not convert it to a Worker handler
// and do not append code below — keep this as one clean file (appending caused
// the "duplicate symbol / React already declared" errors in the Worker attempt).
//
// Lean by design, to stay under Cloudflare's per-request resource limit (the
// 1102 error). The rules that keep it under the ceiling:
//   • ONE poster image fetched per request, inlined as a data URI (so the
//     renderer never makes its own remote image fetches — a known 1102 cause).
//   • Homepage card reuses that single poster three times. No multi-poster fetch.
//   • Two small fonts only (Bebas Neue for display, DM Sans for body).
//   • No in-memory PNG cache. Caching is done at the edge via Cache-Control.
//
// Modes:
//   /api/og                      → homepage card (today's #1)
//   /api/og?type=movie&id=12345  → movie card
//   /api/og?type=tv&id=12345     → TV card

import React from 'react';
import { ImageResponse } from 'workers-og';

const TMDB = 'https://api.themoviedb.org/3';
const POSTER = 'https://image.tmdb.org/t/p/w342'; // smaller size = lighter render

const BEBAS_URL  = 'https://cdn.jsdelivr.net/fontsource/fonts/bebas-neue@latest/latin-400-normal.ttf';
const DMSANS_URL = 'https://cdn.jsdelivr.net/fontsource/fonts/dm-sans@latest/latin-400-normal.ttf';

// Font bytes are small and constant; cache them across warm invocations.
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

// Fetch a single poster and inline it. Returns null if unavailable.
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
  backgroundColor: '#080a0f',
  backgroundImage: 'linear-gradient(135deg, #080a0f 0%, #0a1424 100%)',
  fontFamily: 'DM Sans',
};

function posterBox(h, uri, w, ht, key) {
  return h('div', {
    key,
    style: {
      width: `${w}px`, height: `${ht}px`, borderRadius: '10px', overflow: 'hidden',
      backgroundColor: '#13182a', display: 'flex',
      border: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
    },
  }, uri ? [h('img', { key: 'i', src: uri, width: w, height: ht, style: { objectFit: 'cover' } })] : []);
}

// ─── HOMEPAGE CARD: one poster, shown three times ────────────────
function renderHomeCard(h, top, uri) {
  const title = truncate(top.title || top.name || 'EPHIX PULSE', 26);
  const year = (top.release_date || top.first_air_date || '').slice(0, 4);

  return h('div', { style: { ...BG, padding: '60px' } }, [
    h('div', {
      key: 'left',
      style: { display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: 'center' },
    }, [
      posterBox(h, uri, 150, 225, 'p1'),
      posterBox(h, uri, 150, 225, 'p2'),
      posterBox(h, uri, 150, 225, 'p3'),
    ]),

    h('div', {
      key: 'div',
      style: { display: 'flex', width: '1px', backgroundColor: 'rgba(33,150,243,0.2)', margin: '40px 50px' },
    }),

    h('div', {
      key: 'right',
      style: {
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        flex: 1, paddingTop: '20px', paddingBottom: '20px',
      },
    }, [
      h('div', { key: 'top', style: { display: 'flex', flexDirection: 'column' } }, [
        h('div', { key: 'l', style: { fontSize: '20px', color: '#2196F3', letterSpacing: '6px', marginBottom: '24px' } }, 'LIVE TOP 100 · WORLDWIDE'),
        h('div', { key: 'h', style: { fontSize: '62px', fontWeight: 700, lineHeight: 1.05, letterSpacing: '-1px', display: 'flex', flexDirection: 'column' } }, [
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

// ─── PER-TITLE CARD: one poster ──────────────────────────────────
function renderTitleCard(h, detail, type, uri) {
  const title = truncate(detail.title || detail.name || 'Untitled', 38);
  const year = (detail.release_date || detail.first_air_date || '').slice(0, 4);
  const rating = detail.vote_average ? detail.vote_average.toFixed(1) : null;
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
          rating ? h('span', { key: 'r', style: { color: '#c9a548' } }, `★ ${rating}`) : null,
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

export async function onRequest(context) {
  const { request, env } = context;
  try {
    const url = new URL(request.url);
    const rawType = url.searchParams.get('type');
    const rawId = url.searchParams.get('id');
    const type = rawType === 'movie' || rawType === 'tv' ? rawType : null;
    const id = rawId && /^\d+$/.test(rawId) ? rawId : null;

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
        const data = await fetch(`${TMDB}/trending/all/day?api_key=${key}`).then(r => r.json());
        const top = (data.results || [])[0] || {};
        const uri = await posterDataUri(top.poster_path);
        root = renderHomeCard(h, top, uri);
      }
    } else {
      const data = await fetch(`${TMDB}/trending/all/day?api_key=${key}`).then(r => r.json());
      const top = (data.results || [])[0] || {};
      const uri = await posterDataUri(top.poster_path);
      root = renderHomeCard(h, top, uri);
    }

    const image = new ImageResponse(root, { width: 1200, height: 630, fonts });

    // Re-stream with cache headers so the edge caches it (the real caching layer).
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
