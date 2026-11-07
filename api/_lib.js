import { neon } from '@neondatabase/serverless';
import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'hk_session';
const MAX_AGE = 60 * 60 * 24 * 90; // 90 jours

export function sql() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.STORAGE_URL
    || Object.entries(process.env).find(([k, v]) => k.endsWith('_DATABASE_URL') && v)?.[1];
  if (!url) throw new Error('DATABASE_URL manquante');
  return neon(url);
}

let migrated = false;
export async function migrate(db) {
  if (migrated) return;
  await db`CREATE TABLE IF NOT EXISTS hk_notes (
    place_id text PRIMARY KEY,
    status text,
    order_items jsonb NOT NULL DEFAULT '[]'::jsonb,
    notes text NOT NULL DEFAULT '',
    updated_at timestamptz NOT NULL DEFAULT now()
  )`;
  await db`CREATE TABLE IF NOT EXISTS hk_attachments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    place_id text NOT NULL,
    url text NOT NULL,
    pathname text NOT NULL,
    caption text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
  )`;
  migrated = true;
}

function token() {
  const secret = process.env.APP_PASSWORD || '';
  return createHmac('sha256', secret).update('hk-map-session-v1').digest('hex');
}

export function checkPassword(pw) {
  const expected = process.env.APP_PASSWORD;
  if (!expected || typeof pw !== 'string') return false;
  const a = Buffer.from(pw);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function isAuthed(request) {
  if (!process.env.APP_PASSWORD) return false;
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(new RegExp(`${COOKIE}=([a-f0-9]+)`));
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(token());
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sessionCookie() {
  return `${COOKIE}=${token()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(init.headers || {}) },
  });
}

export function unauthorized() {
  return json({ error: 'Non connecté' }, { status: 401 });
}

export async function readState(db) {
  await migrate(db);
  const notes = await db`SELECT place_id, status, order_items, notes, updated_at FROM hk_notes`;
  const atts = await db`SELECT id, place_id, url, caption, created_at FROM hk_attachments ORDER BY created_at`;
  const byPlace = {};
  for (const n of notes) {
    byPlace[n.place_id] = { status: n.status, order: n.order_items || [], notes: n.notes || '', updatedAt: n.updated_at, attachments: [] };
  }
  for (const a of atts) {
    byPlace[a.place_id] ||= { status: null, order: [], notes: '', attachments: [] };
    byPlace[a.place_id].attachments.push({ id: a.id, url: a.url, caption: a.caption, createdAt: a.created_at });
  }
  return byPlace;
}
