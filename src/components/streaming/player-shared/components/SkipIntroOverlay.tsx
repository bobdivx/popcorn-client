import { useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '../../../../lib/i18n';
import { SkipForward } from 'lucide-preact';
import { isTVPlatform } from '../../../../lib/utils/device-detection';

interface SkipIntroOverlayProps {
  onSkip: () => void;
  visible: boolean;
}

/** Fade in/out sans unmount immédiat (la transition-opacity peut se jouer). */
export function SkipIntroOverlay({ onSkip, visible }: SkipIntroOverlayProps) {
  const { t } = useI18n();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [mounted, setMounted] = useState(visible);
  const [shown, setShown] = useState(visible);

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
    if (!shown || !isTVPlatform()) return;
    const id = window.setTimeout(() => btnRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [shown]);

  if (!mounted) return null;

  return (
    <div
      className={`player-overlay absolute z-20 transition-[opacity,transform] duration-200 ease-out ${
        shown ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 translate-y-2 pointer-events-none'
      }`}
      style={{
        bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))',
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
        className="flex items-center gap-2 px-4 py-2.5 min-h-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border-2 border-white/20 text-white font-medium text-sm transition-[opacity,transform,background-color] duration-200 focus:outline-none focus:ring-2 focus:ring-primary-400 active:scale-95"
        aria-label={t('interfaceSettings.skipIntro')}
      >
        <SkipForward className="w-5 h-5 shrink-0" />
        {t('interfaceSettings.skipIntro')}
      </button>
    </div>
  );
}
