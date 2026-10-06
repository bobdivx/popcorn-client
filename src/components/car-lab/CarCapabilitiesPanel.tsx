/**
 * PROVISOIRE — Labo Tesla : menu « Capacités ».
 * Affiche le dernier relevé Park vs le dernier relevé Drive (serveur : GET /api/car/capabilities),
 * différences surlignées, + la recommandation moteur/preset Drive qui en découle.
 */
import { useCallback, useEffect, useState } from 'preact/hooks';
import {
  CAPS_ENDPOINT,
  getCapsSession,
  getLocalCapabilities,
  getServerBase,
  onCapabilitiesReported,
  recommendCarDrive,
  requestCapabilitiesReport,
  type CapsRecord,
} from '../streaming/car-player/carCapabilities';
import type { TeslaDriveMode } from '../streaming/car-player/driveModeDetector';

interface CapsResponse {
  park: CapsRecord | null;
  drive: CapsRecord | null;
  unknown: CapsRecord | null;
  recent: { session?: string; mode?: string; received_at?: number; reason?: string; page?: string }[];
}

const META_KEYS = new Set(['kind', 'v', 'session', 'mode', 'reason', 'page', 'at', 'durationMs', 'received_at', 'clientVersion']);

function flatten(obj: unknown, prefix: string, out: Record<string, string>): Record<string, string> {
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (!prefix && META_KEYS.has(k)) continue;
      flatten(v, prefix ? `${prefix}.${k}` : k, out);
    }
  } else if (prefix) {
    out[prefix] = obj === undefined ? '—' : typeof obj === 'string' ? obj : JSON.stringify(obj);
  }
  return out;
}

function fmtWhen(r: CapsRecord | null | undefined): string {
  if (!r) return 'aucun relevé';
  const d = new Date(r.received_at || r.at);
  return `${d.toLocaleString('fr-FR')} · ${r.page} · ${r.reason} · ${r.clientVersion || '?'} · ${r.durationMs} ms · session ${r.session}`;
}

async function fetchCaps(session: string | null): Promise<{ data: CapsResponse; from: string }> {
  const qs = session ? `?session=${encodeURIComponent(session)}` : '';
  const base = getServerBase();
  const targets = [base ? `${base}${CAPS_ENDPOINT}${qs}` : null, `/srv${CAPS_ENDPOINT}${qs}`].filter(Boolean) as string[];
  let last = '';
  for (const url of targets) {
    try {
      const r = await fetch(url, { cache: 'no-store', credentials: 'omit' });
      if (r.ok) return { data: (await r.json()) as CapsResponse, from: url };
      last = `${url} → HTTP ${r.status}`;
    } catch (e) {
      last = `${url} → ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  throw new Error(last);
}

export default function CarCapabilitiesPanel({ mode, onClose }: { mode: TeslaDriveMode | 'testing'; onClose: () => void }) {
  const [data, setData] = useState<CapsResponse | null>(null);
  const [source, setSource] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [diffOnly, setDiffOnly] = useState(true);
  const [mine, setMine] = useState(false);
  const [lastSend, setLastSend] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const { data: d, from } = await fetchCaps(mine ? getCapsSession() : null);
      setData(d);
      setSource(`serveur (${from})`);
    } catch (e) {
      const local = getLocalCapabilities();
      setData({ park: local.park || null, drive: local.drive || null, unknown: local.unknown || null, recent: [] });
      setSource('local (serveur injoignable)');
      setErr(e instanceof Error ? e.message : String(e));
    }
  }, [mine]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () =>
      onCapabilitiesReported((rec, sentTo, e) => {
        setBusy(false);
        setLastSend(
          `${new Date(rec.at).toLocaleTimeString('fr-FR')} · ${rec.mode} · ${rec.reason} → ${sentTo ? 'envoyé' : `ÉCHEC ${e}`}`,
        );
        void load();
      }),
    [load],
  );

  const park = data?.park || null;
  const drive = data?.drive || null;
  const fp = flatten(park, '', {});
  const fd = flatten(drive, '', {});
  const keys = Array.from(new Set([...Object.keys(fp), ...Object.keys(fd)]));
  const rows = keys
    .map((k) => ({ k, p: fp[k] ?? '—', d: fd[k] ?? '—' }))
    .map((r) => ({ ...r, diff: r.p !== r.d }))
    .filter((r) => !diffOnly || r.diff);
  const reco = recommendCarDrive(drive || park);
  const diffCount = keys.filter((k) => (fp[k] ?? '—') !== (fd[k] ?? '—')).length;

  return (
    <div className="car-lab__caps" onClick={(e) => e.stopPropagation()}>
      <div className="car-lab__row">
        <strong className="car-lab__caps-title">Capacités navigateur · Park vs Drive</strong>
        <button type="button" className="car-lab__btn" onClick={onClose}>
          ✕ Fermer
        </button>
      </div>
      <div className="car-lab__row">
        <button type="button" className={`car-lab__btn${diffOnly ? ' is-active' : ''}`} onClick={() => setDiffOnly(!diffOnly)}>
          Différences seules ({diffCount})
        </button>
        <button type="button" className={`car-lab__btn${mine ? ' is-active' : ''}`} onClick={() => setMine(!mine)}>
          {mine ? 'Cette session' : 'Toutes sessions'}
        </button>
        <button type="button" className="car-lab__btn" onClick={() => void load()}>
          ↻ Rafraîchir
        </button>
        <button
          type="button"
          className="car-lab__btn"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            requestCapabilitiesReport('/car/lab', mode === 'testing' ? 'unknown' : mode, 'manual');
          }}
        >
          {busy ? 'Collecte…' : 'Relever maintenant'}
        </button>
        <button
          type="button"
          className="car-lab__btn"
          onClick={() => void navigator.clipboard?.writeText(JSON.stringify(data, null, 2))}
        >
          Copier JSON
        </button>
      </div>
      <div className="car-lab__muted">
        Source : {source} {err && <span className="is-warn">· {err}</span>}
        {lastSend && <span> · Dernier relevé : {lastSend}</span>}
      </div>
      <div className="car-lab__caps-meta">
        <div>
          <b>PARK</b> : {fmtWhen(park)}
        </div>
        <div>
          <b>DRIVE</b> : {fmtWhen(drive)}
        </div>
      </div>
      <div className="car-lab__caps-reco">
        <b>Choix auto Drive (/car, rendu « auto »)</b> : moteur <b>{reco.engine === 'img' ? '<img>' : reco.engine}</b> · preset{' '}
        <b>{reco.preset === 'lite' ? 'léger 360p/10 i/s' : 'standard 480p/12 i/s'}</b> · base : relevé {reco.basis}
        <ul>
          {reco.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>
      <table className="car-lab__caps-table">
        <thead>
          <tr>
            <th>Clé</th>
            <th>Park</th>
            <th>Drive</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k} className={r.diff ? 'is-diff' : ''}>
              <td>{r.k}</td>
              <td>{r.p}</td>
              <td>{r.d}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={3}>{park || drive ? 'Aucune différence.' : 'Aucun relevé pour l’instant (collecte auto ~5 s après chargement).'}</td>
            </tr>
          )}
        </tbody>
      </table>
      {!!data?.recent?.length && (
        <div className="car-lab__muted car-lab__caps-recent">
          Derniers relevés :{' '}
          {data.recent
            .slice(0, 12)
            .map((r) => `${r.received_at ? new Date(r.received_at).toLocaleTimeString('fr-FR') : '?'} ${r.mode}/${r.reason} ${r.page || ''}`)
            .join(' · ')}
        </div>
      )}
    </div>
  );
}
