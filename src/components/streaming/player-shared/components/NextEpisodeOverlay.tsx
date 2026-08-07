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
        <p className="text-white/90 text-sm mb-1 truncate drop-shadow" title={nextTitle}>
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
        className="flex items-center gap-2 px-5 py-3 min-h-12 rounded-full bg-black/55 hover:bg-black/70 backdrop-blur-md border-2 border-white/35 text-white font-semibold text-sm sm:text-base shadow-[0_8px_28px_rgba(0,0,0,0.45)] transition-[opacity,transform,background-color] duration-200 focus:outline-none focus:ring-2 focus:ring-primary-400 active:scale-95"
        aria-label={t('playback.nextEpisode')}
      >
        <Play className="w-5 h-5 shrink-0" />
        {t('playback.nextEpisode')}
      </button>
    </div>
  );
}
