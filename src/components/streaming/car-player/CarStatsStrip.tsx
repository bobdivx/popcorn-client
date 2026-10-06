/**
 * Bande de stats discrète (une ligne, ~24 px) collée au bord HAUT, code couleur, au-dessus de la vidéo
 * (la surface vidéo est décalée de STRIP_HEIGHT : rien n'est recouvert). Tap → détail, repli auto après 6 s.
 * Masquable (✕) ; réactivable via le menu « Stats ».
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import './car-ui.css';

export const STRIP_HEIGHT = 24;

export interface StripStats {
  state?: string;
  fpsShown?: number | null;
  targetFps?: number;
  fpsReceived?: number | null;
  dropped?: number;
  late?: number;
  stalls?: number;
  kbps?: number | null;
  bufferMs?: number | null;
  decodeMs?: number | null;
  paintMs?: number | null;
  avSyncMs?: number | null;
  paintJitterMs?: number | null;
  arrivalJitterMs?: number | null;
  frameSize?: string;
}

export interface CarStatsStripProps {
  stats: StripStats | null;
  /** Libellés courts à droite (moteur, preset, Park/Drive…) */
  tags: string[];
  /** Lignes supplémentaires dans la vue détaillée */
  details?: Array<[string, ComponentChildren]>;
  onHide: () => void;
}

export function stripLevel(s: StripStats | null): 'ok' | 'warn' | 'bad' | 'idle' {
  if (!s) return 'idle';
  if (s.state === 'stalled' || s.state === 'error') return 'bad';
  if (s.fpsShown == null || !s.targetFps) return 'idle';
  if (s.state && s.state !== 'playing') return 'warn';
  const r = s.fpsShown / s.targetFps;
  const jit = s.paintJitterMs ?? 0;
  if (r >= 0.9 && jit < 45) return 'ok';
  if (r >= 0.7) return 'warn';
  return 'bad';
}

const n = (v: number | null | undefined, d = 0): string => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));

export default function CarStatsStrip({ stats: s, tags, details, onHide }: CarStatsStripProps) {
  const [open, setOpen] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const toggle = (e: Event) => {
    e.stopPropagation();
    window.clearTimeout(timer.current);
    setOpen((o) => {
      if (!o) timer.current = window.setTimeout(() => setOpen(false), 6000);
      return !o;
    });
  };
  const level = stripLevel(s);
  const av = s?.avSyncMs;
  const parts: string[] = [];
  if (s) {
    parts.push(s.fpsShown != null ? `${n(s.fpsShown, 1)}/${s.targetFps ?? '?'} i/s` : (s.state || '—'));
    if (s.fpsReceived != null) parts.push(`reçu ${n(s.fpsReceived, 1)}`);
    if (s.kbps != null) parts.push(`${(s.kbps / 1000).toFixed(2)} Mb/s`);
    if (s.bufferMs != null) parts.push(`buf ${(s.bufferMs / 1000).toFixed(1)} s`);
    if (s.decodeMs != null) parts.push(`déc ${n(s.decodeMs, 1)} ms`);
    if (av != null) parts.push(`A/V ${av > 0 ? '+' : ''}${av} ms`);
    if (s.dropped || s.stalls) parts.push(`jetées ${s.dropped ?? 0} · coup. ${s.stalls ?? 0}`);
  } else {
    parts.push('en attente…');
  }

  return (
    <div className={`car-ui-strip is-${level}${open ? ' is-open' : ''}`} onClick={toggle} role="status">
      <div className="car-ui-strip__line">
        <span className="car-ui-strip__dot" />
        <span className="car-ui-strip__text">{parts.join(' · ')}</span>
        <span className="car-ui-strip__tags">{tags.filter(Boolean).join(' · ')}</span>
        <button
          type="button"
          className="car-ui-strip__hide"
          aria-label="Masquer les stats"
          onClick={(e) => {
            e.stopPropagation();
            onHide();
          }}
        >
          ✕
        </button>
      </div>
      {open && (
        <div className="car-ui-strip__detail">
          {s && (
            <>
              <div>État <b>{s.state || '—'}</b> · image {s.frameSize || '—'}</div>
              <div>Affiché <b>{n(s.fpsShown, 1)}</b>/{s.targetFps ?? '?'} i/s · reçu {n(s.fpsReceived, 1)}</div>
              <div>Jetées {s.dropped ?? 0} · en retard {s.late ?? 0} · coupures {s.stalls ?? 0}</div>
              <div>Jitter affichage {n(s.paintJitterMs)} ms · arrivée {n(s.arrivalJitterMs)} ms</div>
              <div>Débit {s.kbps != null ? (s.kbps / 1000).toFixed(2) : '—'} Mb/s · buffer {n(s.bufferMs)} ms</div>
              <div>Décodage {n(s.decodeMs, 1)} ms · peinture {n(s.paintMs, 1)} ms · A/V {av == null ? '—' : `${av} ms`}</div>
            </>
          )}
          {(details || []).map(([k, v]) => (
            <div key={k}>
              {k} {v}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
