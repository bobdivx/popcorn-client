import { useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '../../../../lib/i18n';
import { Play } from 'lucide-preact';
import { isTVPlatform } from '../../../../lib/utils/device-detection';

interface NextEpisodeOverlayProps {
  onNext: () => void;
  visible: boolean;
  /** Titre optionnel de l'épisode suivant (ex. "S1 E3") */
  nextTitle?: string;
  /** Si true, remonte le bouton au-dessus de la barre + miniatures. */
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

  const bottom = chromeVisible
    ? isTV
      ? 'calc(15.5rem + env(safe-area-inset-bottom, 0px))'
      : 'calc(11rem + env(safe-area-inset-bottom, 0px))'
    : 'calc(5rem + env(safe-area-inset-bottom, 0px))';

  return (
    <div
      className={`player-overlay absolute z-30 max-w-[280px] transition-[opacity,transform,bottom] duration-200 ease-out ${
        shown ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'
      }`}
      style={{
        bottom,
        right: 'calc(1rem + env(safe-area-inset-right, 0px))',
      }}
      aria-hidden={!shown}
    >
      {nextTitle && (
        <p className="text-white/90 text-sm mb-1 truncate transition-opacity duration-200" title={nextTitle}>
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
        className="flex items-center gap-2 px-4 py-2.5 min-h-11 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md border-2 border-white/25 text-white font-medium text-sm shadow-lg transition-[opacity,transform,background-color] duration-200 focus:outline-none focus:ring-2 focus:ring-primary-400 active:scale-95"
        aria-label={t('playback.nextEpisode')}
      >
        <Play className="w-5 h-5 shrink-0" />
        {t('playback.nextEpisode')}
      </button>
    </div>
  );
}
