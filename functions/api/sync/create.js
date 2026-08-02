// POST /api/sync/create  { items?, deviceToken? }
// Generates a unique 6-character code, creates the sync_lists row, and returns it.

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function generateCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length));
  }
  return code;
}

export async function onRequestPost({ request, env }) {
  const { SUPABASE_URL, SUPABASE_KEY } = env;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return json({ error: 'SUPABASE not configured' }, 500);
  }

  let body = {};
  try { body = await request.json(); } catch {}

  const items = Array.isArray(body?.items) ? body.items : [];
  const deviceToken = typeof body?.deviceToken === 'string' ? body.deviceToken.trim() : null;
  const members = deviceToken ? [deviceToken] : [];

  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // Try generating a non-colliding 6-char code up to 5 times
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/sync_lists`, {
      method: 'POST',
      headers,
      body: JSON.stringify([{ code, items, members }]),
    });

    if (res.ok) {
      const rows = await res.json().catch(() => []);
      const row = rows[0] || {};
      return json({ ok: true, code, updated_at: row.updated_at || new Date().toISOString() }, 200);
    }

    // If duplicate primary key error (code collision 409/23505), loop and try another code
    if (res.status !== 409) {
      const errText = await res.text().catch(() => '');
      return json({ error: 'db_error', status: res.status, details: errText }, 502);
    }
  }

  return json({ error: 'code_generation_failed' }, 500);
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
