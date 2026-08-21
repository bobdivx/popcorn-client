import { createPortal } from 'preact/compat';
import { ArrowLeft, Pause, Play, SkipBack, SkipForward } from 'lucide-preact';
import { formatTime } from '../utils/formatTime';

interface TvPlayerDockProps {
  show: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onClose?: () => void;
  onPlayPause: () => void;
  onSeekToTime: (timeSeconds: number) => void;
}

/**
 * Commandes TV hors de la <video> native : deux blocs comme les badges
 * (coin haut-gauche + bandeau bas). Jamais de calque inset-0.
 */
export function TvPlayerDock({
  show,
  isPlaying,
  currentTime,
  duration,
  onClose,
  onPlayPause,
  onSeekToTime,
}: TvPlayerDockProps) {
  if (!show || typeof document === 'undefined') return null;
  const host = document.getElementById('video-player-wrapper');
  if (!host) return null;

  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const t = Number.isFinite(currentTime) ? currentTime : 0;
  const pct = dur > 0 ? Math.min(100, Math.max(0, (t / dur) * 100)) : 0;

  const seekBy = (delta: number) => {
    if (!dur) return;
    onSeekToTime(Math.max(0, Math.min(dur, t + delta)));
  };

  return createPortal(
    <>
      {onClose && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
          aria-label="Retour"
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            zIndex: 410,
            width: 48,
            height: 48,
            borderRadius: 999,
            background: '#000',
            color: '#fff',
            border: '2px solid #fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ArrowLeft class="w-6 h-6" />
        </button>
      )}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 410,
          background: '#000',
          padding: '12px 16px 16px',
          color: '#fff',
        }}
      >
        <div
          role="slider"
          aria-valuenow={Math.round(t)}
          aria-valuemin={0}
          aria-valuemax={Math.round(dur)}
          style={{
            height: 8,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.3)',
            marginBottom: 12,
            overflow: 'hidden',
          }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: '#fff' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            type="button"
            onClick={() => seekBy(-10)}
            aria-label="Reculer 10 s"
            style={tvDockBtnStyle}
          >
            <SkipBack class="w-6 h-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPlayPause();
            }}
            aria-label={isPlaying ? 'Pause' : 'Lecture'}
            style={tvDockBtnStyle}
          >
            {isPlaying ? <Pause class="w-6 h-6" /> : <Play class="w-6 h-6" />}
          </button>
          <button
            type="button"
            onClick={() => seekBy(10)}
            aria-label="Avancer 10 s"
            style={tvDockBtnStyle}
          >
            <SkipForward class="w-6 h-6" />
          </button>
          <span style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>
            {formatTime(t)}{dur ? ` / ${formatTime(dur)}` : ''}
          </span>
        </div>
      </div>
    </>,
    host,
  );
}

const tvDockBtnStyle: Record<string, string | number> = {
  width: 48,
  height: 48,
  borderRadius: 999,
  background: '#222',
  color: '#fff',
  border: '2px solid #fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
