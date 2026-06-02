// GET /api/movers            -> upward movers (climbers) for the strip
// GET /api/movers?window=7d  -> 7-day window instead of 24h
// GET /api/movers?id=movie_550 -> signed delta for one title (modal movement)
//
// Reads pulse_snapshots (captured_at, tmdb_id, media_type, title, rank, pulse_score).
// Compares the latest snapshot in the DB to one ~window ago. No new fetches, no scoring
// here: it diffs the already-scored pool, so it is the single source of truth for both
// the Movers strip and the per-title up/down badge on the modal.

const WINDOWS = {
  '24h': { back: 24, pad: 2 },   // look 22-26h back
  '7d':  { back: 168, pad: 6 },  // look ~7d back, +/- 6h
};

function json(body, maxAge) {
  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json',
      // edge-cache: snapshots are hourly, so 15 min is plenty
      'Cache-Control': `public, s-maxage=${maxAge}, max-age=60`,
    },
  });
}

export async function onRequestGet({ request, env }) {
  const SUPABASE_URL = env.SUPABASE_URL;
  const SUPABASE_KEY = env.SUPABASE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json({ error: 'SUPABASE_URL / SUPABASE_KEY not configured' }, 30);
  }
  const REST = `${SUPABASE_URL}/rest/v1/pulse_snapshots`;
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const supa = (qs) => fetch(`${REST}?${qs}`, { headers }).then((r) => (r.ok ? r.json() : null));

  const url = new URL(request.url);
  const win = WINDOWS[url.searchParams.get('window')] || WINDOWS['24h'];
  const wantId = url.searchParams.get('id');           // e.g. "movie_550"
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '12', 10), 50);

  // 1. latest snapshot timestamp in the DB
  const latestRow = await supa('select=captured_at&order=captured_at.desc&limit=1');
  if (!latestRow || latestRow.length === 0) {
    return json({ window: url.searchParams.get('window') || '24h', movers: [], reason: 'no_snapshots' }, 300);
  }
  const latestTs = latestRow[0].captured_at;

  // 2. current = all rows at the latest timestamp
  const current = await supa(
    `captured_at=eq.${encodeURIComponent(latestTs)}&select=tmdb_id,media_type,title,rank,pulse_score&limit=300`
  );
  if (!current) return json({ movers: [], reason: 'read_failed' }, 30);

  // 3. old = earliest capture group inside the window
  const start = new Date(Date.now() - (win.back + win.pad) * 3600e3).toISOString();
  const end = new Date(Date.now() - (win.back - win.pad) * 3600e3).toISOString();
  const oldRows = await supa(
    `captured_at=gte.${encodeURIComponent(start)}&captured_at=lt.${encodeURIComponent(end)}` +
      `&order=captured_at.asc&select=tmdb_id,media_type,rank,pulse_score,captured_at&limit=400`
  );
  if (!oldRows || oldRows.length === 0) {
    return json({ window: url.searchParams.get('window') || '24h', movers: [], reason: 'insufficient_history' }, 300);
  }
  const earliestTs = oldRows[0].captured_at; // already asc-sorted
  const old = {};
  for (const r of oldRows) {
    if (r.captured_at !== earliestTs) continue;
    old[`${r.media_type}_${r.tmdb_id}`] = { rank: r.rank, score: r.pulse_score };
  }

  // --- single-title mode (modal movement): signed delta, up or down ---
  if (wantId) {
    const cur = current.find((r) => `${r.media_type}_${r.tmdb_id}` === wantId);
    const prev = old[wantId];
    if (!cur || !prev) return json({ id: wantId, movement: null }, 300);
    return json(
      {
        id: wantId,
        rank: cur.rank,
        prev_rank: prev.rank,
        rank_delta: prev.rank - cur.rank,             // + = climbed
        score_delta: Math.round((cur.pulse_score - prev.score) * 10) / 10,
      },
      300
    );
  }

  // --- strip mode: climbers only, ranked by score gain, labelled with rank jump ---
  const movers = current
    .map((r) => {
      const prev = old[`${r.media_type}_${r.tmdb_id}`];
      if (!prev) return null; // not in prior snapshot => NEW, excluded (Discover owns "fresh")
      const scoreDelta = r.pulse_score - prev.score;
      return {
        tmdb_id: r.tmdb_id,
        media_type: r.media_type,
        title: r.title,
        rank: r.rank,
        prev_rank: prev.rank,
        rank_delta: prev.rank - r.rank,               // + = climbed
        pulse_score: r.pulse_score,
        score_delta: Math.round(scoreDelta * 10) / 10,
      };
    })
    .filter((m) => m && m.score_delta > 0)            // upward only
    .sort((a, b) => b.score_delta - a.score_delta)    // rank by smooth score gain
    .slice(0, limit);

  return json(
    { window: url.searchParams.get('window') || '24h', current_at: latestTs, baseline_at: earliestTs, movers },
    900
  );
}
