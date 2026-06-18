/**
 * Ephix Pulse — push sender (scheduled Cloudflare Worker).
 *
 * Runs on a cron trigger (e.g. hourly). Reads the latest Top-25 from Supabase,
 * diffs it against the previous run's Top-25 (stored in KV), and sends an Expo
 * push for any genuinely new entry. This is the server-side twin of the app's
 * client-side "New in Top 25" badge.
 *
 * THIS IS A SEPARATE WORKER, not a Pages Function (Pages Functions can't run on
 * cron). Deploy with Wrangler.
 *
 * wrangler.toml:
 *   name = "ephix-push"
 *   main = "push-cron-worker.js"
 *   compatibility_date = "2025-01-01"
 *   [triggers]
 *   crons = ["0 * * * *"]            # hourly
 *   [[kv_namespaces]]
 *   binding = "PUSH_KV"
 *   id = "<your-kv-id>"
 *   # vars (use `wrangler secret put` for the key):
 *   #   SUPABASE_URL, SUPABASE_KEY
 *
 * Notes:
 *   - iOS delivery needs an APNs key configured in EAS (paid Apple account).
 *   - Android delivery needs FCM credentials in your EAS build.
 *   - Until both exist, this still runs harmlessly; Expo just can't deliver.
 */

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
const TOP_N = 25;

export default {
  async scheduled(event, env, ctx) {
    // Every minute: refresh World Cup scores into KV (read by /api/scores).
    // Hourly (the original trigger): send Top-25 push notifications.
    if (event.cron === '* * * * *') { ctx.waitUntil(pollScores(env)); return; }
    ctx.waitUntil(run(env));
  },
  // Manual triggers for testing: GET /?run=1 (push)  |  GET /?scores=1 (scores)
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.searchParams.get('run') === '1') { await run(env); return new Response('ran'); }
    if (url.searchParams.get('scores') === '1') { const ok = await pollScores(env); return new Response('scores ' + (ok ? 'ok' : 'fail')); }
    return new Response('ephix-push worker');
  },
};

// Pull the full WC match list once per minute and stash the raw JSON in KV.
// /api/scores reads this, so football-data is hit ~once/min total, not per visitor.
async function pollScores(env) {
  try {
    const token = env.FOOTBALL_DATA_TOKEN;
    if (!token || !env.PUSH_KV) return false;
    const res = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
      headers: { 'X-Auth-Token': token },
    });
    if (!res.ok) return false;
    const raw = await res.text();
    await env.PUSH_KV.put('scores:raw', raw, { expirationTtl: 3600 });
    await env.PUSH_KV.put('scores:at', String(Date.now()));
    return true;
  } catch (_) {
    return false;
  }
}

async function run(env) {
  const { SUPABASE_URL, SUPABASE_KEY, PUSH_KV } = env;
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const supa = (qs) => fetch(`${SUPABASE_URL}/rest/v1/${qs}`, { headers }).then((r) => (r.ok ? r.json() : null));

  // 1. latest snapshot timestamp + its top 25
  const latest = await supa('pulse_snapshots?select=captured_at&order=captured_at.desc&limit=1');
  if (!latest?.length) return;
  const ts = latest[0].captured_at;
  const rows = await supa(
    `pulse_snapshots?captured_at=eq.${encodeURIComponent(ts)}` +
      `&rank=lte.${TOP_N}&select=tmdb_id,media_type,title,rank&order=rank.asc`
  );
  if (!rows?.length) return;

  const currentIds = rows.map((r) => `${r.media_type}_${r.tmdb_id}`);

  // 2. previous top-25 from KV
  const prevRaw = await PUSH_KV.get('prev_top25');
  const prev = prevRaw ? JSON.parse(prevRaw) : null;
  await PUSH_KV.put('prev_top25', JSON.stringify(currentIds));
  if (!prev) return; // first run = baseline, don't spam

  const fresh = rows.filter((r) => !prev.includes(`${r.media_type}_${r.tmdb_id}`));
  if (!fresh.length) return;

  // 3. message
  const titles = fresh.slice(0, 3).map((r) => r.title);
  const body =
    fresh.length === 1
      ? `${titles[0]} just entered the Top 25`
      : `${titles.join(', ')}${fresh.length > 3 ? ' and more' : ''} just entered the Top 25`;

  // 4. all tokens, send in chunks of 100
  const tokens = (await supa('push_tokens?select=token')) || [];
  // Tapping the push deep-links to the title when there's exactly one new entry;
  // otherwise it just opens the app (the in-app "New in Top 25" rail shows them all).
  const deepLink = fresh.length === 1 ? `/title/${fresh[0].media_type}/${fresh[0].tmdb_id}` : undefined;
  const messages = tokens.map((t) => ({
    to: t.token,
    title: 'New in the Top 25',
    body,
    sound: 'default',
    channelId: 'default',
    badge: fresh.length,                       // app-icon count; app clears to 0 on open
    data: deepLink ? { url: deepLink } : {},
  }));

  for (let i = 0; i < messages.length; i += 100) {
    await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    }).catch(() => {});
  }
}
