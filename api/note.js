import { sql, migrate, isAuthed, json, unauthorized } from './_lib.js';

const STATUSES = new Set(['todo', 'done', 'love', 'skip']);

// PUT /api/note?id=<placeId>  { status, order, notes }
export async function PUT(request) {
  if (!isAuthed(request)) return unauthorized();
  const id = new URL(request.url).searchParams.get('id');
  if (!id || id.length > 120) return json({ error: 'id manquant' }, { status: 400 });
  let body = {};
  try { body = await request.json(); } catch {}
  const status = STATUSES.has(body.status) ? body.status : null;
  const order = Array.isArray(body.order) ? body.order.map(String).map((s) => s.slice(0, 200)).slice(0, 50) : [];
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, 10000) : '';
  try {
    const db = sql();
    await migrate(db);
    const rows = await db`
      INSERT INTO hk_notes (place_id, status, order_items, notes, updated_at)
      VALUES (${id}, ${status}, ${JSON.stringify(order)}::jsonb, ${notes}, now())
      ON CONFLICT (place_id) DO UPDATE SET status = EXCLUDED.status, order_items = EXCLUDED.order_items,
        notes = EXCLUDED.notes, updated_at = now()
      RETURNING updated_at`;
    return json({ ok: true, updatedAt: rows[0].updated_at });
  } catch (e) {
    return json({ error: String(e.message || e) }, { status: 500 });
  }
}
