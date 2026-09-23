import { useAiEnabled } from '../../lib/ai/prefs';
import { useI18n } from '../../lib/i18n/useI18n';

const CHIP =
  'inline-flex items-center justify-center min-h-[44px] tv:min-h-[56px] px-4 tv:px-6 rounded-full border border-white/15 bg-white/10 text-sm tv:text-lg text-white focus:outline-none focus:ring-4 focus:ring-violet-500/70';

interface SearchAssistProps {
  onPick: (phrase: string) => void;
  summary?: string;
}

export function SearchAssist({ onPick, summary }: SearchAssistProps) {
  const { t } = useI18n();
  const enabled = useAiEnabled();
  if (!enabled) return null;

  const chips = [
    { id: 'short', label: t('ai.searchShort'), phrase: t('ai.searchShortPhrase') },
    { id: 'fr', label: t('ai.searchFrench'), phrase: t('ai.searchFrenchPhrase') },
    { id: 'movie', label: t('ai.searchMovie'), phrase: t('ai.searchMoviePhrase') },
    { id: 'tv', label: t('ai.searchSeries'), phrase: t('ai.searchSeriesPhrase') },
  ];

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap justify-center gap-2 tv:gap-3" role="group" aria-label={t('ai.cardTitle')}>
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            data-focusable
            tabIndex={0}
            className={CHIP}
            onClick={() => onPick(chip.phrase)}
          >
            {chip.label}
          </button>
        ))}
      </div>
      {summary ? <p className="text-sm tv:text-xl text-white/80">{summary}</p> : null}
    </div>
  );
}
