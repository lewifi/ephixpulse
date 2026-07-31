// functions/api/ratelimit-stats.js — Cloudflare Pages Function (route: /api/ratelimit-stats)
// Returns rate limit event history from KV for the analytics dashboard.

const BASE_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

const SERVICES = ['tmdb', 'trakt', 'youtube', 'wikipedia'];

export async function onRequest(context) {
  const { env } = context;
  const kv = env.RATE_KV || env.PUSH_KV;

  if (!kv) {
    return new Response(JSON.stringify({ error: 'No KV binding available' }), {
      status: 500,
      headers: BASE_HEADERS,
    });
  }

  // Look back 30 days
  const days = [];
  const now = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const results = {};
  const fetches = [];

  for (const service of SERVICES) {
    results[service] = { totalHits: 0, days: {} };
    for (const date of days) {
      fetches.push(
        kv.get(`ratelimit:${service}:${date}`).then((raw) => {
          if (raw) {
            const data = JSON.parse(raw);
            results[service].totalHits += data.count || 0;
            results[service].days[date] = data;
          }
        }).catch(() => {})
      );
    }
  }

  await Promise.all(fetches);

  return new Response(JSON.stringify({
    ok: true,
    generated: now.toISOString(),
    lookbackDays: 30,
    services: results,
  }), {
    status: 200,
    headers: {
      ...BASE_HEADERS,
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  });
}
