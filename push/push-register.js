// POST /api/push-register  { token, platform }
// Stores an Expo push token so the scheduled sender can target this device.
// Upserts on `token` so re-registering is idempotent.
//
// Requires (already set for /api/movers): env.SUPABASE_URL, env.SUPABASE_KEY.
// Requires a table (see push/schema.sql):
//   create table push_tokens (token text primary key, platform text, created_at timestamptz default now());
//   alter table push_tokens enable row level security;
//   create policy push_insert on push_tokens for insert to anon with check (true);

export async function onRequestPost({ request, env }) {
  const { SUPABASE_URL, SUPABASE_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json({ error: 'SUPABASE not configured' }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const token = (body?.token || '').trim();
  const platform = (body?.platform || '').slice(0, 16);

  // Basic shape check for Expo push tokens.
  if (!/^ExponentPushToken\[.+\]$/.test(token) && !/^ExpoPushToken\[.+\]$/.test(token)) {
    return json({ error: 'invalid_token' }, 400);
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/push_tokens?on_conflict=token`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([{ token, platform }]),
  });

  if (!res.ok) return json({ error: 'store_failed', status: res.status }, 502);
  return json({ ok: true }, 200);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
