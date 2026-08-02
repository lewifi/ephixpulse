// POST /api/sync/pull  { code }
// Fetches the current items, updated_at timestamp, and pending joins for a sync code.

export async function onRequestPost({ request, env }) {
  const { SUPABASE_URL, SUPABASE_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json({ error: 'SUPABASE not configured' }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const code = (body?.code || '').trim().toUpperCase();

  if (!/^[2-9A-Z]{6}$/.test(code)) {
    return json({ error: 'invalid_code' }, 400);
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sync_lists?code=eq.${encodeURIComponent(code)}&select=code,items,members,pending_joins,updated_at`,
    {
      method: 'GET',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );

  if (!res.ok) return json({ error: 'db_error', status: res.status }, 502);

  const rows = await res.json().catch(() => []);
  if (!rows || !rows.length) {
    return json({ error: 'not_found' }, 404);
  }

  const row = rows[0];
  return json(
    {
      ok: true,
      code: row.code,
      items: row.items || [],
      updated_at: row.updated_at,
      pending_joins: row.pending_joins || [],
    },
    200
  );
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
