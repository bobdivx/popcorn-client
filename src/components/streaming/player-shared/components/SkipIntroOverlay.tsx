import { useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '../../../../lib/i18n';
import { SkipForward } from 'lucide-preact';
import { isTVPlatform } from '../../../../lib/utils/device-detection';
import { PLAYER_FLOATING_ACTION_BOTTOM, stopPlayerTapPropagation } from './playerFloatingActions';

interface SkipIntroOverlayProps {
  onSkip: () => void;
  visible: boolean;
  /** Si true, le chrome lecteur est ouvert (barre + miniatures). */
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
    // Ne pas voler le focus TV tant que le chrome lecteur est ouvert.
    if (!shown || !isTV || chromeVisible) return;
    const id = window.setTimeout(() => btnRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [shown, isTV, chromeVisible]);

  if (!mounted) return null;

  // TV : milieu-droite (hors de la zone barre/miniatures).
  // Mobile / desktop : bas-droite à une hauteur FIXE, au-dessus de la barre de commandes,
  // que le chrome soit affiché ou non. Avant, le bouton remontait de 6rem quand le chrome
  // apparaissait — or le 1er toucher affiche le chrome : le bouton sautait sous le doigt et
  // le tap tombait à côté (il fallait taper deux fois).
  const positionStyle = isTV
    ? {
        top: '48%',
        right: 'calc(2rem + env(safe-area-inset-right, 0px))',
        bottom: 'auto' as const,
        transform: shown ? 'translateY(-50%)' : 'translateY(calc(-50% + 8px))',
      }
    : {
        bottom: PLAYER_FLOATING_ACTION_BOTTOM,
        right: 'calc(1rem + env(safe-area-inset-right, 0px))',
        top: 'auto' as const,
        transform: shown ? 'translateY(0)' : 'translateY(8px)',
      };

  return (
    <div
      className={`player-overlay absolute z-40 transition-[opacity,transform] duration-200 ease-out ${
        shown ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      style={positionStyle}
      aria-hidden={!shown}
    >
      <button
        ref={btnRef}
        type="button"
        onClick={onSkip}
        {...stopPlayerTapPropagation}
        data-focusable
        data-player-overlay-action
        tabIndex={0}
        className="ed-cta !w-auto shrink-0 touch-manipulation"
        aria-label={t('interfaceSettings.skipIntro')}
      >
        <SkipForward />
        {t('interfaceSettings.skipIntro')}
      </button>
    </div>
  );
}
