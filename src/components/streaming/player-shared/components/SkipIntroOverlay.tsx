import { useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '../../../../lib/i18n';
import { SkipForward } from 'lucide-preact';
import { isTVPlatform } from '../../../../lib/utils/device-detection';

interface SkipIntroOverlayProps {
  onSkip: () => void;
  visible: boolean;
  /** Si true, remonte le bouton au-dessus de la barre + miniatures. */
  chromeVisible?: boolean;
}

/** Fade in/out sans unmount immédiat (la transition-opacity peut se jouer). */
export function SkipIntroOverlay({ onSkip, visible, chromeVisible = false }: SkipIntroOverlayProps) {
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
    // Ne pas voler le focus TV tant que le chrome lecteur est ouvert (conflit télécommande).
    if (!shown || !isTV || chromeVisible) return;
    const id = window.setTimeout(() => btnRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [shown, isTV, chromeVisible]);

  if (!mounted) return null;

  // Chrome ouvert (miniatures + boutons) : remonter clairement au-dessus.
  // Chrome masqué : bas-droite type Netflix.
  const bottom = chromeVisible
    ? isTV
      ? 'calc(15.5rem + env(safe-area-inset-bottom, 0px))'
      : 'calc(11rem + env(safe-area-inset-bottom, 0px))'
    : 'calc(5rem + env(safe-area-inset-bottom, 0px))';

  return (
    <div
      className={`player-overlay absolute z-30 transition-[opacity,transform,bottom] duration-200 ease-out ${
        shown ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'
      }`}
      style={{
        bottom,
        right: 'calc(1rem + env(safe-area-inset-right, 0px))',
      }}
      aria-hidden={!shown}
    >
      <button
        ref={btnRef}
        type="button"
        onClick={onSkip}
        data-focusable
        data-player-overlay-action
        tabIndex={0}
        className="flex items-center gap-2 px-4 py-2.5 min-h-11 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur-md border-2 border-white/25 text-white font-medium text-sm shadow-lg transition-[opacity,transform,background-color] duration-200 focus:outline-none focus:ring-2 focus:ring-primary-400 active:scale-95"
        aria-label={t('interfaceSettings.skipIntro')}
      >
        <SkipForward className="w-5 h-5 shrink-0" />
        {t('interfaceSettings.skipIntro')}
      </button>
    </div>
  );
}
