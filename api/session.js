import { isAuthed, checkPassword, sessionCookie, clearCookie, json } from './_lib.js';

// GET : état de connexion
export async function GET(request) {
  return json({ authed: isAuthed(request), configured: Boolean(process.env.APP_PASSWORD) });
}

// POST : connexion { password }
export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}
  if (!checkPassword(body.password)) {
    await new Promise((r) => setTimeout(r, 600));
    return json({ error: 'Mot de passe incorrect' }, { status: 401 });
  }
  return json({ authed: true }, { headers: { 'set-cookie': sessionCookie() } });
}

// DELETE : déconnexion
export async function DELETE() {
  return json({ authed: false }, { headers: { 'set-cookie': clearCookie() } });
}
