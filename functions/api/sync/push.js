// POST /api/sync/push  { code, items, baseUpdatedAt? }
// Optimistic LWW update for a watchlist. Server stamps updated_at and rejects stale pushes.

export async function onRequestPost({ request, env }) {
  const { SUPABASE_URL, SUPABASE_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json({ error: 'SUPABASE not configured' }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const code = (body?.code || '').trim().toUpperCase();
  const items = Array.isArray(body?.items) ? body.items : null;
  const baseUpdatedAt = body?.baseUpdatedAt ? new Date(body.baseUpdatedAt).getTime() : null;

  if (!/^[2-9A-Z]{6}$/.test(code) || !items) {
    return json({ error: 'invalid_payload' }, 400);
  }

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };

  // 1. Fetch current row
  const currentRes = await fetch(
    `${SUPABASE_URL}/rest/v1/sync_lists?code=eq.${encodeURIComponent(code)}&select=items,updated_at`,
    { method: 'GET', headers }
  );

  if (!currentRes.ok) return json({ error: 'db_error', status: currentRes.status }, 502);

  const rows = await currentRes.json().catch(() => []);
  if (!rows || !rows.length) {
    return json({ error: 'not_found' }, 404);
  }

  const row = rows[0];
  const serverTime = new Date(row.updated_at).getTime();

  // 2. Check for conflict if client specified baseUpdatedAt (allow 1000ms clock drift)
  if (baseUpdatedAt !== null && !isNaN(baseUpdatedAt) && serverTime > baseUpdatedAt + 1000) {
    return json({
      ok: false,
      conflict: true,
      serverUpdatedAt: row.updated_at,
      serverItems: row.items || [],
    }, 409);
  }

  // 3. Update items and stamp updated_at = now()
  const now = new Date().toISOString();
  const updateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/sync_lists?code=eq.${encodeURIComponent(code)}`,
    {
      method: 'PATCH',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ items, updated_at: now }),
    }
  );

  if (!updateRes.ok) return json({ error: 'update_failed', status: updateRes.status }, 502);

  const updatedRows = await updateRes.json().catch(() => []);
  const updatedRow = updatedRows[0] || {};

  return json({ ok: true, updated_at: updatedRow.updated_at || now }, 200);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
