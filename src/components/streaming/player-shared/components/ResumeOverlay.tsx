import { useEffect, useState } from 'preact/hooks';
import { RotateCcw } from 'lucide-preact';
import { useI18n } from '../../../../lib/i18n';
import { isTVPlatform } from '../../../../lib/utils/device-detection';
import { formatTime } from '../utils/formatTime';

interface ResumeOverlayProps {
  /** Position (s) de reprise appliquée ; null = rien à afficher. */
  resumedAt: number | null;
  /** Repartir du début. */
  onRestart: () => void;
  /** Le chrome lecteur est ouvert (remonter le bandeau). */
  chromeVisible?: boolean;
  /** Durée d'affichage (ms). */
  durationMs?: number;
}

/**
 * Bandeau discret après une reprise automatique : « Reprise à 12:34 · Recommencer ».
 * Ne vole jamais le focus (TV : atteignable à la télécommande via data-focusable).
 */
export function ResumeOverlay({ resumedAt, onRestart, chromeVisible = false, durationMs = 8000 }: ResumeOverlayProps) {
  const { t, language } = useI18n();
  const [shownFor, setShownFor] = useState<number | null>(null);
  const isTV = isTVPlatform();
  const en = language === 'en';
  const label = (key: string, fallback: string) => {
    const v = t(key);
    return v && v !== key ? v : fallback;
  };

  useEffect(() => {
    if (resumedAt == null || !(resumedAt > 0)) {
      setShownFor(null);
      return;
    }
    setShownFor(resumedAt);
    const id = window.setTimeout(() => setShownFor(null), durationMs);
    return () => clearTimeout(id);
  }, [resumedAt, durationMs]);

  if (shownFor == null) return null;

  const position = isTV
    ? { left: 'calc(2rem + env(safe-area-inset-left, 0px))', top: '48%', transform: 'translateY(-50%)' }
    : {
        left: 'calc(1rem + env(safe-area-inset-left, 0px))',
        bottom: chromeVisible
          ? 'calc(11rem + env(safe-area-inset-bottom, 0px))'
          : 'calc(5rem + env(safe-area-inset-bottom, 0px))',
      };

  return (
    <div
      className="player-overlay absolute z-40 flex items-center gap-3 rounded-full border border-white/15 bg-black/60 backdrop-blur-md pl-4 pr-1.5 py-1.5 text-sm text-white/85 animate-[fade-in_0.25s_ease-out]"
      style={position}
      role="status"
      aria-live="polite"
      data-resume-overlay
    >
      <span className="tabular-nums whitespace-nowrap">
        {label('playback.resume.resumedAt', en ? 'Resumed at' : 'Reprise à')} {formatTime(shownFor)}
      </span>
      <button
        type="button"
        onClick={() => {
          setShownFor(null);
          onRestart();
        }}
        data-focusable
        data-player-overlay-action
        tabIndex={0}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-[#f2545b]"
      >
        <RotateCcw size={14} aria-hidden />
        {label('playback.resume.restart', en ? 'Start over' : 'Recommencer')}
      </button>
    </div>
  );
}

export default ResumeOverlay;
