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
 * Config lives in ../wrangler.jsonc — deployed as the Worker "ephixpulse-cron",
 * with the PUSH_KV namespace bound and SUPABASE_URL / SUPABASE_KEY /
 * PUSH_TRIGGER_KEY / FOOTBALL_DATA_TOKEN set via `wrangler secret put`.
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
  // Manual triggers for testing, all gated on the shared key:
  //   GET /?run=1&key=…      send the Top-25 push now
  //   GET /?peek=1&key=…     report what *would* send, without touching KV
  //   GET /?test=1&key=…     push a test notification to every token, now
  //   GET /?scores=1&key=…   refresh scores into KV now
  // Set with: wrangler secret put PUSH_TRIGGER_KEY
  async fetch(req, env) {
    const url = new URL(req.url);
    const wants = ['run', 'peek', 'test', 'scores'].some((p) => url.searchParams.get(p) === '1');
    if (wants && !authorized(url, env)) return new Response('forbidden', { status: 403 });
    if (url.searchParams.get('peek') === '1') { return new Response(await run(env, { peek: true })); }
    if (url.searchParams.get('test') === '1') { return new Response(await testPush(env)); }
    if (url.searchParams.get('run') === '1') { return new Response(await run(env)); }
    if (url.searchParams.get('scores') === '1') { const ok = await pollScores(env); return new Response('scores ' + (ok ? 'ok' : 'fail')); }
    return new Response('ephix-push worker');
  },
};

// Manual triggers fan out to every registered token, so they need the shared key.
// Fails closed: if PUSH_TRIGGER_KEY was never set, nothing manual can run.
function authorized(url, env) {
  const expected = env.PUSH_TRIGGER_KEY;
  if (!expected) return false;
  const given = url.searchParams.get('key') || '';
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// Delivery check that ignores the Top-25 diff entirely: how many tokens are
// registered, and what does Expo actually say when we push to them. Separates
// "nothing was new" from "nothing can be delivered", which the normal run
// cannot distinguish from the outside.
async function testPush(env) {
  const { SUPABASE_URL, SUPABASE_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_KEY) return 'test: no supabase config';
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const tokens = await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?select=token,platform`, { headers })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null);
  if (!tokens) return 'test: could not read push_tokens (check SUPABASE_KEY / RLS)';
  if (!tokens.length) return 'test: 0 registered tokens — the app never successfully registered this device';

  const res = await fetch(EXPO_PUSH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(
      tokens.map((t) => ({
        to: t.token,
        title: 'Ephix Pulse test',
        body: 'If you can see this, push delivery works.',
        sound: 'default',
        channelId: 'default',
      }))
    ),
  }).catch((e) => e);
  if (!(res instanceof Response)) return `test: expo unreachable (${String(res)})`;
  // Return Expo's raw tickets — DeviceNotRegistered, MismatchSenderId and the
  // rest name the actual problem far better than any summary would.
  const raw = await res.text();
  return `test: ${tokens.length} token(s) [${tokens.map((t) => t.platform || '?').join(',')}] · http ${res.status} · ${raw}`;
}

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

async function run(env, { peek = false } = {}) {
  const { SUPABASE_URL, SUPABASE_KEY, PUSH_KV } = env;
  if (!SUPABASE_URL || !SUPABASE_KEY) return 'skipped: no supabase config';
  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const supa = (qs) => fetch(`${SUPABASE_URL}/rest/v1/${qs}`, { headers }).then((r) => (r.ok ? r.json() : null));

  // 1. latest snapshot timestamp + its top 25
  const latest = await supa('pulse_snapshots?select=captured_at&order=captured_at.desc&limit=1');
  if (!latest?.length) return 'skipped: no snapshots';
  const ts = latest[0].captured_at;
  const rows = await supa(
    `pulse_snapshots?captured_at=eq.${encodeURIComponent(ts)}` +
      `&rank=lte.${TOP_N}&select=tmdb_id,media_type,title,rank&order=rank.asc`
  );
  if (!rows?.length) return 'skipped: snapshot has no top-25 rows';

  const currentIds = rows.map((r) => `${r.media_type}_${r.tmdb_id}`);

  // 2. previous top-25 from KV. The baseline is deliberately NOT advanced here:
  // a run that never manages to send has to leave the diff intact for the next
  // one, or those entries vanish. Advancing it up front is what silently ate
  // real notifications — whichever call landed first consumed the diff and
  // every call after it saw "no new entries".
  const prevRaw = await PUSH_KV.get('prev_top25');
  const prev = prevRaw ? JSON.parse(prevRaw) : null;
  const saveBaseline = () => PUSH_KV.put('prev_top25', JSON.stringify(currentIds));

  const fresh = prev ? rows.filter((r) => !prev.includes(`${r.media_type}_${r.tmdb_id}`)) : [];

  // Read-only diff for debugging: reports what would send, mutates nothing.
  if (peek) {
    if (!prev) return 'peek: no baseline stored yet — a real run would store one and send nothing';
    return fresh.length
      ? `peek: ${fresh.length} new since last run: ${fresh.map((r) => r.title).join(', ')}`
      : 'peek: no new entries since last run';
  }

  if (!prev) {
    await saveBaseline();
    return 'skipped: baseline stored, nothing to diff against yet'; // first run, don't spam
  }

  // Nothing new is a real outcome, not a failure — move the baseline up so a
  // title that drops out of the Top 25 and later returns counts as new again.
  if (!fresh.length) {
    await saveBaseline();
    return 'skipped: no new entries since last run';
  }

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

  // No tokens means nobody could have been told, so hold the baseline and let
  // these entries stay pending rather than marking them as delivered.
  if (!messages.length) return `held: ${fresh.length} new, but no registered push tokens`;

  const ticketErrors = [];
  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch(EXPO_PUSH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    }).catch((e) => e);
    // A transport error or non-2xx means this batch never landed. Bail without
    // touching the baseline so the next run retries instead of losing the diff.
    if (!(res instanceof Response) || !res.ok) {
      const why = res instanceof Response ? `http ${res.status}` : String(res);
      return `failed: expo send errored (${why}), baseline held for retry`;
    }
    // Expo answers 200 with per-token tickets; DeviceNotRegistered and friends
    // live in there, so surface them instead of reporting a clean send.
    const json = await res.json().catch(() => null);
    for (const t of json?.data || []) {
      if (t.status === 'error') ticketErrors.push(t.details?.error || t.message || 'unknown');
    }
  }

  await saveBaseline();
  const problems = ticketErrors.length
    ? ` (${ticketErrors.length} token error(s): ${[...new Set(ticketErrors)].join('; ')})`
    : '';
  return `sent to ${messages.length} token(s): ${body}${problems}`;
}
