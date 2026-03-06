import { useI18n } from '../../../../lib/i18n';
import { Play } from 'lucide-preact';

interface NextEpisodeOverlayProps {
  onNext: () => void;
  visible: boolean;
  /** Titre optionnel de l'épisode suivant (ex. "S1 E3") */
  nextTitle?: string;
}

export function NextEpisodeOverlay({ onNext, visible, nextTitle }: NextEpisodeOverlayProps) {
  const { t } = useI18n();

  if (!visible) return null;

  return (
    <div
      className="absolute bottom-20 right-4 z-20 pointer-events-auto transition-opacity duration-300 max-w-[280px]"
      style={{ opacity: visible ? 1 : 0 }}
    >
      {nextTitle && (
        <p className="text-white/90 text-sm mb-1 truncate" title={nextTitle}>
          {nextTitle}
        </p>
      )}
      <button
        type="button"
        onClick={onNext}
        className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md border-2 border-white/20 text-white font-medium text-sm transition-all focus:outline-none"
        aria-label={t('playback.nextEpisode')}
      >
        <Play className="w-5 h-5 shrink-0" />
        {t('playback.nextEpisode')}
      </button>
    </div>
  );
}
