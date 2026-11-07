import { put, del } from '@vercel/blob';
import { sql, migrate, isAuthed, json, unauthorized } from './_lib.js';

const MAX = 4 * 1024 * 1024;
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

// POST /api/attachment?placeId=<id>&caption=<texte>  (corps = le fichier brut)
export async function POST(request) {
  if (!isAuthed(request)) return unauthorized();
  const params = new URL(request.url).searchParams;
  const placeId = params.get('placeId');
  const caption = (params.get('caption') || '').slice(0, 200);
  const type = (request.headers.get('content-type') || '').split(';')[0];
  if (!placeId) return json({ error: 'placeId manquant' }, { status: 400 });
  if (!TYPES[type]) return json({ error: 'Format non pris en charge' }, { status: 415 });
  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length > MAX) return json({ error: 'Fichier trop lourd (4 Mo max)' }, { status: 413 });
  try {
    const blob = await put(`hk/${placeId}/piece.${TYPES[type]}`, buf, {
      access: 'public',
      addRandomSuffix: true,
      contentType: type,
    });
    const db = sql();
    await migrate(db);
    const rows = await db`
      INSERT INTO hk_attachments (place_id, url, pathname, caption)
      VALUES (${placeId}, ${blob.url}, ${blob.pathname}, ${caption})
      RETURNING id, url, caption, created_at`;
    const r = rows[0];
    return json({ id: r.id, url: r.url, caption: r.caption, createdAt: r.created_at });
  } catch (e) {
    return json({ error: String(e.message || e) }, { status: 500 });
  }
}

// DELETE /api/attachment?id=<uuid>
export async function DELETE(request) {
  if (!isAuthed(request)) return unauthorized();
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: 'id manquant' }, { status: 400 });
  try {
    const db = sql();
    await migrate(db);
    const rows = await db`DELETE FROM hk_attachments WHERE id = ${id} RETURNING url`;
    if (rows[0]) { try { await del(rows[0].url); } catch {} }
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e.message || e) }, { status: 500 });
  }
}
