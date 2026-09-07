import { useEffect, useState } from 'preact/hooks';
import { isCarPlayerMode, isTeslaBrowser, stampTeslaBrowserHints } from '../../../lib/utils/device-detection';

type ProbeRow = { name: string; ok: boolean; detail: string };

function runProbe(): ProbeRow[] {
  const rows: ProbeRow[] = [];
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  rows.push({ name: 'userAgent', ok: true, detail: ua || '(vide)' });
  rows.push({
    name: 'isTeslaBrowser',
    ok: isTeslaBrowser(),
    detail: String(isTeslaBrowser()),
  });
  rows.push({
    name: 'isCarPlayerMode',
    ok: isCarPlayerMode(),
    detail: String(isCarPlayerMode()),
  });
  rows.push({
    name: 'secureContext',
    ok: typeof window !== 'undefined' && window.isSecureContext,
    detail: String(typeof window !== 'undefined' && window.isSecureContext),
  });

  const video = typeof document !== 'undefined' ? document.createElement('video') : null;
  rows.push({
    name: 'HTMLVideoElement',
    ok: !!video,
    detail: video ? 'ok' : 'indisponible',
  });

  if (video) {
    const codecs: Array<[string, string]> = [
      ['H.264 AVC', 'video/mp4; codecs="avc1.42E01E"'],
      ['AAC', 'audio/mp4; codecs="mp4a.40.2"'],
      ['HLS (application/vnd.apple.mpegurl)', 'application/vnd.apple.mpegurl'],
      ['VP8 WebM', 'video/webm; codecs="vp8"'],
    ];
    for (const [label, type] of codecs) {
      const r = video.canPlayType(type);
      rows.push({
        name: `canPlayType ${label}`,
        ok: r === 'probably' || r === 'maybe',
        detail: r || '(vide)',
      });
    }
  }

  const mse =
    typeof window !== 'undefined' &&
    typeof (window as unknown as { MediaSource?: unknown }).MediaSource !== 'undefined';
  rows.push({ name: 'MediaSource (MSE)', ok: mse, detail: String(mse) });

  const webCodecs =
    typeof window !== 'undefined' &&
    typeof (window as unknown as { VideoDecoder?: unknown }).VideoDecoder !== 'undefined';
  rows.push({ name: 'WebCodecs VideoDecoder', ok: webCodecs, detail: String(webCodecs) });

  let audioCtx = false;
  try {
    const AC =
      typeof window !== 'undefined'
        ? (window as unknown as { AudioContext?: new () => unknown; webkitAudioContext?: new () => unknown })
            .AudioContext ||
          (window as unknown as { webkitAudioContext?: new () => unknown }).webkitAudioContext
        : undefined;
    audioCtx = typeof AC === 'function';
  } catch {
    audioCtx = false;
  }
  rows.push({ name: 'AudioContext', ok: audioCtx, detail: String(audioCtx) });

  rows.push({
    name: 'WebSocket',
    ok: typeof WebSocket !== 'undefined',
    detail: String(typeof WebSocket !== 'undefined'),
  });
  rows.push({
    name: 'WebGL',
    ok: (() => {
      try {
        const c = document.createElement('canvas');
        return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
      } catch {
        return false;
      }
    })(),
    detail: 'canvas webgl',
  });

  return rows;
}

export default function CarProbe() {
  const [rows, setRows] = useState<ProbeRow[]>([]);

  useEffect(() => {
    stampTeslaBrowserHints();
    setRows(runProbe());
  }, []);

  return (
    <div className="tesla-car-root" style={{ padding: '1.75rem', maxWidth: '48rem', margin: '0 auto' }}>
      <header style={{ marginBottom: '2rem' }}>
        <p className="tesla-car-lib__eyebrow">Popcornn</p>
        <h1 className="tesla-car-lib__title" style={{ marginTop: '0.35rem' }}>
          Diagnostic
        </h1>
        <p style={{ color: 'var(--tesla-muted)', fontSize: '1.05rem', marginTop: '0.75rem', lineHeight: 1.45 }}>
          Capacités du Chromium embarqué. Utile pour valider Direct / HLS / MSE dans la voiture.
        </p>
        <a href="/car" className="tesla-car-link-quiet" style={{ marginTop: '1.25rem' }}>
          ← Theater
        </a>
      </header>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {rows.map((row) => (
          <li
            key={row.name}
            style={{
              borderRadius: 'var(--tesla-radius)',
              border: `1px solid ${row.ok ? 'rgba(60,180,100,0.35)' : 'rgba(227,25,55,0.35)'}`,
              background: row.ok ? 'rgba(30,80,50,0.25)' : 'var(--tesla-red-soft)',
              padding: '0.9rem 1.1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 500, fontSize: '1.05rem' }}>{row.name}</span>
              <span style={{ fontSize: '0.8rem', color: row.ok ? '#8fd9a8' : '#ffb3bc', letterSpacing: '0.06em' }}>
                {row.ok ? 'OK' : 'LIMITÉ'}
              </span>
            </div>
            <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: 'var(--tesla-muted)', wordBreak: 'break-all' }}>
              {row.detail}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
