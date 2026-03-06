import { useI18n } from '../../../../lib/i18n';
import { SkipForward } from 'lucide-preact';

interface SkipIntroOverlayProps {
  onSkip: () => void;
  visible: boolean;
}

export function SkipIntroOverlay({ onSkip, visible }: SkipIntroOverlayProps) {
  const { t } = useI18n();

  if (!visible) return null;

  return (
    <div
      className="absolute bottom-20 right-4 z-20 pointer-events-auto transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <button
        type="button"
        onClick={onSkip}
        className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border-2 border-white/20 text-white font-medium text-sm transition-all focus:outline-none"
        aria-label={t('interfaceSettings.skipIntro')}
      >
        <SkipForward className="w-5 h-5 shrink-0" />
        {t('interfaceSettings.skipIntro')}
      </button>
    </div>
  );
}
