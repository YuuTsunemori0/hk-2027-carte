import { sql, isAuthed, json, unauthorized, readState } from './_lib.js';

// GET : toutes les notes et pièces jointes, indexées par lieu
export async function GET(request) {
  if (!isAuthed(request)) return unauthorized();
  try {
    const byPlace = await readState(sql());
    return json({ notes: byPlace });
  } catch (e) {
    return json({ error: String(e.message || e) }, { status: 500 });
  }
}
