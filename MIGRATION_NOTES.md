# CF Pages migration — what I did, what's left hi

Built from the live repo (`github.com/lewifi/what-to-watch`), not the handoff's
referenced `/mnt/user-data/outputs/` copy (which wasn't present this session).

## Findings that differ from the handoff
- **8 functions in the repo, not 7.** The extra is `reddit.js`. Neither
  `index.html` nor `wc2026.html` references it — it's dead code, so it was NOT
  ported. Carry it over only if something off-site uses it.
- **"4 sources" is correct:** TMDB, Trakt, YouTube, Wikipedia. Verified against
  `index.html` (`?path=` query contract preserved in the ports).
- **`scores.mjs` already used the modern `export default async (req)` signature**,
  not `exports.handler`. Ported to `onRequest(context)` + `context.env`.
- **Share lives at `/share/{type}/{id}`** (no `/api` prefix), so the dynamic route
  is `functions/share/[type]/[id].js` — matches what `index.html` links to.

## Decisions
- **`og.js`: kept the React-element layout verbatim**, swapped `@vercel/og` →
  `workers-og`, kept `react` in deps. `workers-og`'s `ImageResponse` passes
  non-string input straight to Satori (confirmed in its source), so React
  elements work as-is. This avoids re-authoring the card as an HTML string and
  the visual-regression risk that carries right before kickoff.
- **Added `s-maxage` to every function's `Cache-Control`.** The Netlify versions
  only set `max-age`, which the CF edge ignores. Since the goal is dodging
  scaling costs, the edge cache needs `s-maxage` to actually engage. In-memory
  warm-isolate caches kept as best-effort (harmless; lower hit rate than Netlify).
- **No `_redirects` file.** Option A dynamic routing + file-path `/api/*` removes
  the need. Add one only for legacy URL redirects.

## Verified
- All 7 functions pass `node --check`.
- Client query contracts (`?path=...`, `?article=&range=`, `?type=&id=`) preserved.

## What I can't do from here (dashboard / DNS actions)
1. Create the CF Pages project, point at repo, branch `cf-migration`, disable
   auto-deploy until tested.
2. Set env vars in CF dashboard: `TMDB_KEY`, `TRAKT_KEY`, `YOUTUBE_KEY`,
   `FOOTBALL_DATA_TOKEN`.
3. Push these files to the `cf-migration` branch; let CF build a preview.
4. Test on `*.pages.dev` (checklist below).
5. DNS cutover at Cloudflare once verified; then pause/delete Netlify.

## Preview test checklist
- [ ] `/api/tmdb?path=trending/all/day` → valid JSON
- [ ] `/api/trakt?path=movies/trending&limit=100` → JSON (confirm UA still passes)
- [ ] `/api/youtube?path=search&q=test` → JSON
- [ ] `/api/wikipedia?article=Inception&range=20260101/20260131` → JSON
- [ ] `/api/scores` → WC data with token set
- [ ] `/api/og` and `/api/og?type=movie&id=27205` → PNG with correct fonts
- [ ] `/share/movie/27205` → OG HTML to a bot UA, 302 to site for a normal UA
- [ ] Full site: all 4 sources score, theme toggle, watchlist, modals, share
- [ ] WC page + standings render
