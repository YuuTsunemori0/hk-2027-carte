async function call(path, options = {}) {
  const res = await fetch(path, { credentials: 'same-origin', ...options });
  let data = null;
  try { data = await res.json(); } catch { /* corps vide */ }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Erreur ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  session: () => call('/api/session'),
  login: (password) => call('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  }),
  logout: () => call('/api/session', { method: 'DELETE' }),
  state: () => call('/api/state'),
  saveNote: (id, note) => call(`/api/note?id=${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(note),
  }),
  upload: (placeId, file, caption = '') => call(
    `/api/attachment?placeId=${encodeURIComponent(placeId)}&caption=${encodeURIComponent(caption)}`,
    { method: 'POST', headers: { 'content-type': file.type }, body: file },
  ),
  removeAttachment: (id) => call(`/api/attachment?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// Réduit une photo à 1600 px max (JPEG) avant envoi, pour rester léger.
export async function shrinkImage(file, max = 1600, quality = 0.82) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  return blob ? new File([blob], 'photo.jpg', { type: 'image/jpeg' }) : file;
}
