import { useEffect, useMemo, useRef, useState } from 'react';
import reference from './data/places.json';
import MapView from './MapView.jsx';
import PlaceDetail from './PlaceDetail.jsx';
import { api } from './api.js';

const TYPES = reference.types;
const TYPE_KEYS = Object.keys(TYPES);
const PLACES = reference.places;
const DISTRICTS = [...new Set(PLACES.map((p) => p.district))].sort((a, b) => a.localeCompare(b, 'fr'));
const STATUS_LABEL = { todo: 'À faire', love: 'Coup de cœur', done: 'Fait', skip: 'Bof' };

function loadPref(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function savePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* navigation privée */ }
}

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export default function App() {
  const [theme, setTheme] = useState(() => loadPref('hk-theme', 'dark'));
  const [authed, setAuthed] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [notes, setNotes] = useState({});
  const [loadError, setLoadError] = useState('');
  const [types, setTypes] = useState(() => new Set(TYPE_KEYS));
  const [district, setDistrict] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [flyKey, setFlyKey] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [toast, setToast] = useState('');
  const importInput = useRef(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    savePref('hk-theme', theme);
  }, [theme]);

  async function refresh() {
    try {
      const s = await api.session();
      setAuthed(s.authed);
      setConfigured(s.configured);
      if (s.authed) {
        const st = await api.state();
        setNotes(st.notes || {});
        setLoadError('');
      }
    } catch (e) {
      setLoadError(e.message);
    }
  }
  useEffect(() => { refresh(); }, []);

  // Lien direct vers un lieu : #lieu-<id>
  useEffect(() => {
    const fromHash = () => {
      const m = location.hash.match(/^#lieu-(.+)$/);
      if (m && PLACES.some((p) => p.id === m[1])) { setSelectedId(m[1]); setFlyKey((k) => k + 1); setSheetOpen(true); }
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    return PLACES.filter((p) => {
      if (!types.has(p.type)) return false;
      if (district !== 'all' && p.district !== district) return false;
      const st = notes[p.id]?.status || null;
      if (statusFilter === 'none' && st) return false;
      if (!['all', 'none'].includes(statusFilter) && st !== statusFilter) return false;
      if (q) {
        const hay = normalize([p.name, p.nameZh, p.district, p.address, p.why, ...(p.tags || [])].join(' '));
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [types, district, statusFilter, query, notes]);

  const counts = useMemo(() => {
    const c = {};
    for (const p of PLACES) c[p.type] = (c[p.type] || 0) + 1;
    return c;
  }, []);

  function select(id, opts = {}) {
    setSelectedId(id);
    setSheetOpen(true);
    if (!opts.fromMap) setFlyKey((k) => k + 1);
    try { history.replaceState(null, '', id ? `#lieu-${id}` : location.pathname); } catch { /* ignore */ }
  }

  function toggleType(key) {
    setTypes((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function soloType(key) {
    setTypes((prev) => (prev.size === 1 && prev.has(key) ? new Set(TYPE_KEYS) : new Set([key])));
  }

  function onNoteChange(id, note) {
    setNotes((prev) => ({ ...prev, [id]: note }));
  }

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2600);
  }

  function exportJSON() {
    const payload = {
      exportedAt: new Date().toISOString(),
      reference,
      notes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hk-2027-carte-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importJSON(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const incoming = data.notes || {};
      let n = 0;
      for (const [id, note] of Object.entries(incoming)) {
        if (!PLACES.some((p) => p.id === id)) continue;
        await api.saveNote(id, { status: note.status || null, order: note.order || [], notes: note.notes || '' });
        n += 1;
      }
      await refresh();
      flash(`${n} fiche${n > 1 ? 's' : ''} importée${n > 1 ? 's' : ''} (les photos restent celles déjà en ligne)`);
    } catch (err) {
      flash(`Import impossible : ${err.message}`);
    }
  }

  async function logout() {
    await api.logout().catch(() => {});
    setAuthed(false);
    setNotes({});
  }

  const selected = PLACES.find((p) => p.id === selectedId) || null;
  const doneCount = Object.values(notes).filter((n) => n.status === 'done').length;

  return (
    <div className={`app ${sheetOpen ? 'sheet-open' : ''}`}>
      <MapView
        places={filtered}
        notes={notes}
        types={TYPES}
        theme={theme}
        selectedId={selectedId}
        onSelect={select}
        flyKey={flyKey}
      />

      <aside className="panel">
        <button className="handle" onClick={() => setSheetOpen((o) => !o)} aria-label={sheetOpen ? 'Réduire' : 'Agrandir'}>
          <span />
        </button>

        {selected ? (
          <PlaceDetail
            key={selected.id}
            place={selected}
            type={TYPES[selected.type]}
            note={notes[selected.id]}
            authed={authed}
            onBack={() => select(null)}
            onNoteChange={onNoteChange}
            onAskLogin={() => setShowLogin(true)}
          />
        ) : (
          <div className="list-view">
            <header className="top">
              <div>
                <h1>Hong Kong <span>2027</span></h1>
                <p className="sub">{PLACES.length} lieux · {doneCount} faits · 16 → 24 janv. · Eco Tree Sheung Wan</p>
              </div>
              <div className="top-actions">
                <button className="icon" title={theme === 'dark' ? 'Fond clair' : 'Fond sombre'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                  {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                </button>
                {authed
                  ? <button className="icon on" title="Connecté — se déconnecter" onClick={logout}><UnlockIcon /></button>
                  : <button className="icon" title="Se connecter" onClick={() => setShowLogin(true)}><LockIcon /></button>}
              </div>
            </header>

            <input
              className="search"
              type="search"
              placeholder="Chercher un lieu, un quartier, « dim sum »…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSheetOpen(true)}
            />

            <div className="chips">
              {TYPE_KEYS.map((k) => (
                <button
                  key={k}
                  className={`chip type ${types.has(k) ? 'on' : ''}`}
                  style={{ '--c': TYPES[k].color }}
                  onClick={() => toggleType(k)}
                  onDoubleClick={() => soloType(k)}
                  title="Clic : afficher/masquer · double-clic : seulement ce type"
                >
                  <i />{TYPES[k].label} <small>{counts[k] || 0}</small>
                </button>
              ))}
            </div>

            <div className="selects">
              <select value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="Quartier">
                <option value="all">Tous les quartiers</option>
                {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Statut" disabled={!authed}>
                <option value="all">Tous les statuts</option>
                <option value="none">Sans statut</option>
                <option value="todo">À faire</option>
                <option value="love">Coups de cœur</option>
                <option value="done">Faits</option>
                <option value="skip">Bof</option>
              </select>
            </div>

            {loadError && <p className="error">{loadError}</p>}
            {!configured && <p className="warning">APP_PASSWORD n'est pas encore configuré sur Vercel : les notes sont désactivées.</p>}

            <ul className="places">
              {filtered.map((p) => {
                const n = notes[p.id];
                return (
                  <li key={p.id}>
                    <button onClick={() => select(p.id)}>
                      <i className="dot" style={{ '--c': TYPES[p.type].color }} />
                      <span className="pname">
                        {p.name}
                        <small>{p.district}{p.warning ? ' · ⚠︎' : ''}{n?.attachments?.length ? ` · 📎${n.attachments.length}` : ''}</small>
                      </span>
                      {n?.status && <span className={`st st-${n.status}`}>{STATUS_LABEL[n.status]}</span>}
                    </button>
                  </li>
                );
              })}
              {!filtered.length && <li className="empty">Aucun lieu avec ces filtres.</li>}
            </ul>

            <footer className="foot">
              <button className="btn" onClick={exportJSON}>Exporter en JSON</button>
              {authed && <button className="btn" onClick={() => importInput.current?.click()}>Importer</button>}
              <input ref={importInput} type="file" accept="application/json" hidden onChange={importJSON} />
            </footer>
          </div>
        )}
      </aside>

      {showLogin && (
        <Login
          onClose={() => setShowLogin(false)}
          onDone={async () => { setShowLogin(false); await refresh(); flash('Connecté'); }}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function Login({ onClose, onDone }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try { await api.login(pw); await onDone(); } catch (e2) { setErr(e2.message); }
    setBusy(false);
  }
  return (
    <div className="modal" onClick={onClose}>
      <form className="modal-box" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>Connexion</h3>
        <p>Le mot de passe défini dans Vercel (APP_PASSWORD).</p>
        <input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        {err && <p className="error">{err}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Annuler</button>
          <button type="submit" className="btn primary" disabled={busy || !pw}>{busy ? '…' : 'Entrer'}</button>
        </div>
      </form>
    </div>
  );
}

const svg = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
function SunIcon() { return <svg {...svg}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>; }
function MoonIcon() { return <svg {...svg}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>; }
function LockIcon() { return <svg {...svg}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>; }
function UnlockIcon() { return <svg {...svg}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.8-1.2" /></svg>; }
