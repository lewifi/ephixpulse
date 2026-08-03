// POST /api/sync/join  { code, deviceToken? }
// Request to join a sync code bucket. Auto-approves bootstrap/re-joins; sends approval push to members for new devices.

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

export async function onRequestPost({ request, env }) {
  const { SUPABASE_URL, SUPABASE_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json({ error: 'SUPABASE not configured' }, 500);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const code = (body?.code || '').trim().toUpperCase();
  const deviceToken = typeof body?.deviceToken === 'string' ? body.deviceToken.trim() : null;

  if (!/^[2-9A-Z]{6}$/.test(code)) {
    return json({ error: 'invalid_code' }, 400);
  }

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  };

  // 1. Fetch current row
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/sync_lists?code=eq.${encodeURIComponent(code)}&select=code,items,members,pending_joins,updated_at`,
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

  // Auto-approve: add to members if not already there
  const isAlreadyMember = deviceToken && members.includes(deviceToken);
  const newMembers = deviceToken && !isAlreadyMember ? [...members, deviceToken] : members;
  if (newMembers.length !== members.length) {
    await fetch(`${SUPABASE_URL}/rest/v1/sync_lists?code=eq.${encodeURIComponent(code)}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ members: newMembers }),
    });
  }

  return json(
    {
      status: 'approved',
      code: row.code,
      items: row.items || [],
      updated_at: row.updated_at,
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
