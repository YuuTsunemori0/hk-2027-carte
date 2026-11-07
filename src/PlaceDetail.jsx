import { useEffect, useRef, useState } from 'react';
import { api, shrinkImage } from './api.js';

const STATUSES = [
  { key: 'todo', label: 'À faire' },
  { key: 'love', label: 'Coup de cœur' },
  { key: 'done', label: 'Fait' },
  { key: 'skip', label: 'Bof / zappé' },
];

function gmapsUrl(p) {
  const q = `${p.name} ${p.address || ''} Hong Kong`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export default function PlaceDetail({ place, type, note, authed, onBack, onNoteChange, onAskLogin }) {
  const empty = { status: null, order: place.order || [], notes: '', attachments: [] };
  const current = note || empty;
  const [draft, setDraft] = useState({ status: current.status, order: current.order, notes: current.notes });
  const [newItem, setNewItem] = useState('');
  const [saveState, setSaveState] = useState('idle');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [viewer, setViewer] = useState(null);
  const timer = useRef(null);
  const pending = useRef(null);
  const fileInput = useRef(null);

  // Recharge le brouillon quand on change de lieu (et envoie ce qui restait en attente)
  useEffect(() => {
    const id = place.id;
    const n = note || empty;
    setDraft({ status: n.status, order: n.order, notes: n.notes });
    setSaveState('idle');
    setError('');
    return () => {
      clearTimeout(timer.current);
      if (pending.current) { api.saveNote(id, pending.current).catch(() => {}); pending.current = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place.id]);

  function update(patch) {
    const next = { ...draft, ...patch };
    setDraft(next);
    onNoteChange(place.id, { ...current, ...next });
    setSaveState('pending');
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next), 700);
  }

  async function save(next) {
    pending.current = null;
    setSaveState('saving');
    try {
      await api.saveNote(place.id, next);
      setSaveState('saved');
      setError('');
    } catch (e) {
      setSaveState('error');
      setError(e.status === 401 ? 'Session expirée, reconnecte-toi.' : e.message);
    }
  }

  function addItem(e) {
    e.preventDefault();
    const v = newItem.trim();
    if (!v) return;
    update({ order: [...draft.order, v] });
    setNewItem('');
  }

  async function onFiles(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setUploading(true);
    setError('');
    let atts = [...(current.attachments || [])];
    for (const f of files) {
      try {
        const small = await shrinkImage(f);
        const att = await api.upload(place.id, small);
        atts = [...atts, att];
        onNoteChange(place.id, { ...current, ...draft, attachments: atts });
      } catch (err) {
        setError(err.message);
      }
    }
    setUploading(false);
  }

  async function removeAtt(att) {
    try {
      await api.removeAttachment(att.id);
      const atts = (current.attachments || []).filter((a) => a.id !== att.id);
      onNoteChange(place.id, { ...current, ...draft, attachments: atts });
      setViewer(null);
    } catch (err) { setError(err.message); }
  }

  const atts = current.attachments || [];

  return (
    <div className="detail">
      <button className="back" onClick={onBack}>← Tous les lieux</button>

      <div className="detail-head">
        <span className="badge" style={{ '--c': type?.color }}>{type?.label}</span>
        <span className="district">{place.district}</span>
      </div>
      <h2>{place.name}</h2>
      {place.nameZh && <div className="zh">{place.nameZh}</div>}

      {place.warning && <p className="warning">⚠︎ {place.warning}</p>}
      {place.why && <p className="why">{place.why}</p>}

      <div className="address">
        <span>{place.address}</span>
      </div>
      <div className="actions">
        <a className="btn primary" href={gmapsUrl(place)} target="_blank" rel="noreferrer">Ouvrir dans Google Maps</a>
        {place.source?.url && (
          <a className="btn" href={place.source.url} target="_blank" rel="noreferrer">Voir le reel {place.source.account}</a>
        )}
      </div>

      <section className="mine">
        <h3>Mes notes</h3>
        {!authed ? (
          <div className="locked">
            <p>Connecte-toi pour noter ce que tu veux commander, ajouter tes notes et des photos.</p>
            <button className="btn" onClick={onAskLogin}>Se connecter</button>
          </div>
        ) : (
          <>
            <div className="status-row" role="radiogroup" aria-label="Statut">
              {STATUSES.map((s) => (
                <button
                  key={s.key}
                  className={`chip ${draft.status === s.key ? 'on' : ''} st-${s.key}`}
                  onClick={() => update({ status: draft.status === s.key ? null : s.key })}
                >{s.label}</button>
              ))}
            </div>

            <label className="field-label">À commander / à faire</label>
            <ul className="order">
              {draft.order.map((item, i) => (
                <li key={i}>
                  <span>{item}</span>
                  <button aria-label="Retirer" onClick={() => update({ order: draft.order.filter((_, j) => j !== i) })}>×</button>
                </li>
              ))}
            </ul>
            <form className="add-item" onSubmit={addItem}>
              <input value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Ajouter un plat, un truc à voir…" />
              <button className="btn" type="submit">Ajouter</button>
            </form>

            <label className="field-label" htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              value={draft.notes}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="Pourquoi j'y vais, horaires, meilleure heure pour la photo…"
              rows={4}
            />

            <label className="field-label">Pièces jointes</label>
            <div className="atts">
              {atts.map((a) => (
                <button key={a.id} className="att" onClick={() => setViewer(a)}>
                  <img src={a.url} alt={a.caption || 'pièce jointe'} loading="lazy" />
                </button>
              ))}
              <button className="att add" onClick={() => fileInput.current?.click()} disabled={uploading}>
                {uploading ? '…' : '+ Photo'}
              </button>
              <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={onFiles} />
            </div>

            <div className={`save-state ${saveState}`}>
              {saveState === 'pending' && 'Modifications en cours…'}
              {saveState === 'saving' && 'Enregistrement…'}
              {saveState === 'saved' && 'Enregistré ✓'}
              {saveState === 'error' && 'Pas enregistré'}
            </div>
            {error && <p className="error">{error}</p>}
          </>
        )}
      </section>

      {viewer && (
        <div className="viewer" onClick={() => setViewer(null)}>
          <img src={viewer.url} alt="" />
          <div className="viewer-bar" onClick={(e) => e.stopPropagation()}>
            <a className="btn" href={viewer.url} target="_blank" rel="noreferrer">Ouvrir</a>
            <button className="btn danger" onClick={() => removeAtt(viewer)}>Supprimer</button>
            <button className="btn" onClick={() => setViewer(null)}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}
