import { useEffect } from 'preact/hooks';
import { ArrowLeft, Pause, Play, SkipBack, SkipForward } from 'lucide-preact';
import { formatTime } from '../utils/formatTime';

interface TvPlayerDockProps {
  show: boolean;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  focusedControlId?: string;
  onClose?: () => void;
  onPlayPause: () => void;
  onSeekToTime: (timeSeconds: number) => void;
}

function dockBtnStyle(focused: boolean): Record<string, string | number> {
  return {
    width: 52,
    height: 52,
    borderRadius: 999,
    background: focused ? '#fff' : '#222',
    color: focused ? '#000' : '#fff',
    border: focused ? '3px solid #fff' : '2px solid rgba(255,255,255,0.7)',
    boxShadow: focused ? '0 0 0 3px #000, 0 0 0 6px #fff' : 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };
}

/**
 * Bandeau TV sous la <video> (pas un overlay). Les clics Magic Remote
 * atteignent les boutons sans passer par le plan compositor webOS.
 */
export function TvPlayerDock({
  show,
  isPlaying,
  currentTime,
  duration,
  focusedControlId = 'playpause',
  onClose,
  onPlayPause,
  onSeekToTime,
}: TvPlayerDockProps) {
  const dur = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const t = Number.isFinite(currentTime) ? currentTime : 0;
  const pct = dur > 0 ? Math.min(100, Math.max(0, (t / dur) * 100)) : 0;

  useEffect(() => {
    if (!show) return;
    const el = document.querySelector<HTMLElement>(
      `[data-tv-dock-btn="${focusedControlId}"]`,
    );
    el?.focus({ preventScroll: true });
  }, [show, focusedControlId]);

  if (!show) return null;

  const seekBy = (delta: number) => {
    if (!dur) return;
    onSeekToTime(Math.max(0, Math.min(dur, t + delta)));
  };

  const activate = (fn: () => void) => (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    fn();
  };

  return (
    <div
      data-tv-player-dock="true"
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: '#000',
        padding: '12px 20px 18px',
        color: '#fff',
        zIndex: 410,
        pointerEvents: 'auto',
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
          marginBottom: 14,
          overflow: 'hidden',
        }}
      >
        <div style={{ width: `${pct}%`, height: '100%', background: '#fff' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {onClose && (
          <button
            type="button"
            data-tv-dock-btn="back"
            data-focusable
            tabIndex={0}
            onClick={activate(onClose)}
            aria-label="Retour"
            style={dockBtnStyle(focusedControlId === 'back')}
          >
            <ArrowLeft class="w-6 h-6" />
          </button>
        )}
        <button
          type="button"
          data-tv-dock-btn="skipback"
          data-focusable
          tabIndex={0}
          onClick={activate(() => seekBy(-10))}
          aria-label="Reculer 10 s"
          style={dockBtnStyle(focusedControlId === 'skipback')}
        >
          <SkipBack class="w-6 h-6" />
        </button>
        <button
          type="button"
          data-tv-dock-btn="playpause"
          data-focusable
          tabIndex={0}
          onClick={activate(onPlayPause)}
          aria-label={isPlaying ? 'Pause' : 'Lecture'}
          style={dockBtnStyle(focusedControlId === 'playpause')}
        >
          {isPlaying ? <Pause class="w-6 h-6" /> : <Play class="w-6 h-6" />}
        </button>
        <button
          type="button"
          data-tv-dock-btn="skipforward"
          data-focusable
          tabIndex={0}
          onClick={activate(() => seekBy(10))}
          aria-label="Avancer 10 s"
          style={dockBtnStyle(focusedControlId === 'skipforward')}
        >
          <SkipForward class="w-6 h-6" />
        </button>
        <span style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums', marginLeft: 8 }}>
          {formatTime(t)}
          {dur ? ` / ${formatTime(dur)}` : ''}
        </span>
      </div>
    </div>
  );
}
