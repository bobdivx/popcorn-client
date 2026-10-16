import { useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '../../../../lib/i18n';
import { Play } from 'lucide-preact';
import { isTVPlatform } from '../../../../lib/utils/device-detection';

interface NextEpisodeOverlayProps {
  onNext: () => void;
  visible: boolean;
  /** Titre optionnel de l'épisode suivant (ex. "S1 E3") */
  nextTitle?: string;
  /** Si true, le chrome lecteur est ouvert. */
  chromeVisible?: boolean;
}

/** Fade in/out sans unmount immédiat. */
export function NextEpisodeOverlay({
  onNext,
  visible,
  nextTitle,
  chromeVisible = false,
}: NextEpisodeOverlayProps) {
  const { t } = useI18n();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(visible);
  const [shown, setShown] = useState(visible);
  const isTV = isTVPlatform();

  useEffect(() => {
    if (visible) {
      setMounted(true);
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
    setShown(false);
    const tId = window.setTimeout(() => setMounted(false), 280);
    return () => clearTimeout(tId);
  }, [visible]);

  useEffect(() => {
    if (!shown || !isTV || chromeVisible) return;
    const id = window.setTimeout(() => btnRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [shown, isTV, chromeVisible]);

  if (!mounted) return null;

  const positionStyle = isTV
    ? {
        top: '48%',
        right: 'calc(2rem + env(safe-area-inset-right, 0px))',
        bottom: 'auto' as const,
        transform: shown ? 'translateY(-50%)' : 'translateY(calc(-50% + 8px))',
      }
    : {
        bottom: chromeVisible
          ? 'calc(11rem + env(safe-area-inset-bottom, 0px))'
          : 'calc(5rem + env(safe-area-inset-bottom, 0px))',
        right: 'calc(1rem + env(safe-area-inset-right, 0px))',
        top: 'auto' as const,
        transform: shown ? 'translateY(0)' : 'translateY(8px)',
      };

  return (
    <div
      className={`player-overlay absolute z-40 max-w-[280px] transition-[opacity,transform,bottom,top] duration-200 ease-out ${
        shown ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      style={positionStyle}
      aria-hidden={!shown}
    >
      {nextTitle && (
        <p
          className="mb-2 text-[0.68rem] uppercase tracking-[0.14em] text-white/70 truncate"
          style={{ fontFamily: 'var(--ed-font-display, Josefin Sans, Jost, sans-serif)' }}
          title={nextTitle}
        >
          {nextTitle}
        </p>
      )}
      <button
        ref={btnRef}
        type="button"
        onClick={onNext}
        data-focusable
        data-player-overlay-action
        tabIndex={0}
        className="ed-cta !w-auto shrink-0"
        aria-label={t('playback.nextEpisode')}
      >
        <Play />
        {t('playback.nextEpisode')}
      </button>
    </div>
  );
}
