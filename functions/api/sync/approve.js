// POST /api/sync/approve  { code, joinId, decision }
// Approves or denies a pending join request. On approval, adds caller's device token to members.

export async function onRequestPost({ request, env }) {
  const { SUPABASE_URL, SUPABASE_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json({ error: 'SUPABASE not configured' }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const code = (body?.code || '').trim().toUpperCase();
  const joinId = (body?.joinId || '').trim();
  const decision = (body?.decision || '').trim().toLowerCase(); // 'approved' | 'denied'

  if (!/^[2-9A-Z]{6}$/.test(code) || !joinId || !['approved', 'denied'].includes(decision)) {
    return json({ error: 'invalid_payload' }, 400);
  }

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };

  // 1. Fetch current row
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sync_lists?code=eq.${encodeURIComponent(code)}&select=members,pending_joins`,
    { method: 'GET', headers }
  );

  if (!res.ok) return json({ error: 'db_error', status: res.status }, 502);

  const rows = await res.json().catch(() => []);
  if (!rows || !rows.length) {
    return json({ error: 'not_found' }, 404);
  }

  const row = rows[0];
  const members = Array.isArray(row.members) ? row.members : [];
  const pendingJoins = Array.isArray(row.pending_joins) ? row.pending_joins : [];

  const targetJoin = pendingJoins.find((j) => j.joinId === joinId);
  const remainingJoins = pendingJoins.filter((j) => j.joinId !== joinId);

  let newMembers = [...members];
  if (decision === 'approved' && targetJoin?.deviceToken && !newMembers.includes(targetJoin.deviceToken)) {
    newMembers.push(targetJoin.deviceToken);
  }

  // 2. Update DB
  await fetch(`${SUPABASE_URL}/rest/v1/sync_lists?code=eq.${encodeURIComponent(code)}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      members: newMembers,
      pending_joins: remainingJoins,
    }),
  });

  return json({ ok: true, decision }, 200);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
