import { useEffect } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';

export interface AiChoice {
  id: string;
  label: string;
  detail?: string;
  imageUrl?: string | null;
}

export interface AiAssistProps {
  mode: 'explain' | 'pick' | 'confirm';
  summary: string;
  choices?: AiChoice[];
  primaryLabel?: string;
  dismissLabel?: string;
  busy?: boolean;
  onPrimary?: () => void;
  onChoose?: (id: string) => void;
  onDismiss?: () => void;
}

const CHOICE_CLASS =
  'flex items-center gap-3 w-full text-left min-h-[44px] tv:min-h-[64px] px-3 tv:px-5 py-2 rounded-2xl border border-white/15 bg-white/10 text-white focus:outline-none focus:ring-4 focus:ring-violet-500/70';

const PRIMARY_CLASS =
  'inline-flex items-center justify-center min-h-[44px] tv:min-h-[56px] px-5 tv:px-8 rounded-full bg-white text-black text-sm tv:text-lg font-semibold focus:outline-none focus:ring-4 focus:ring-violet-500/70 disabled:opacity-50';

const GHOST_CLASS =
  'inline-flex items-center justify-center min-h-[44px] tv:min-h-[56px] px-4 tv:px-6 rounded-full text-sm tv:text-lg text-white/80 focus:outline-none focus:ring-4 focus:ring-violet-500/70';

export function AiAssist({
  mode,
  summary,
  choices = [],
  primaryLabel,
  dismissLabel,
  busy = false,
  onPrimary,
  onChoose,
  onDismiss,
}: AiAssistProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!onDismiss || mode === 'explain') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Back' || event.key === 'BrowserBack') {
        event.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, onDismiss]);

  if (!summary && choices.length === 0) return null;

  return (
    <section
      className="w-full rounded-2xl border border-white/10 bg-black/40 p-3 tv:p-5 space-y-3"
      aria-live="polite"
      data-ai-assist={mode}
    >
      {busy ? (
        <p className="text-sm tv:text-xl text-white/70">{t('ai.busy')}</p>
      ) : summary ? (
        <p className="text-sm tv:text-xl text-white/90">{summary}</p>
      ) : null}

      {mode !== 'explain' && choices.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 tv:gap-3">
          {choices.slice(0, 3).map((choice) => (
            <button
              key={choice.id}
              type="button"
              data-focusable
              tabIndex={0}
              className={CHOICE_CLASS}
              onClick={() => onChoose?.(choice.id)}
            >
              {choice.imageUrl ? (
                <img src={choice.imageUrl} alt="" className="h-14 w-10 tv:h-20 tv:w-14 object-cover rounded-md bg-white/10" />
              ) : null}
              <span className="min-w-0">
                <span className="block font-semibold text-sm tv:text-lg truncate">{choice.label}</span>
                {choice.detail ? <span className="block text-xs tv:text-base text-white/60 truncate">{choice.detail}</span> : null}
              </span>
            </button>
          ))}
        </div>
      )}

      {(onPrimary || onDismiss) && mode !== 'explain' ? (
        <div className="flex flex-wrap gap-2 tv:gap-3">
          {onPrimary && primaryLabel ? (
            <button type="button" data-focusable tabIndex={0} className={PRIMARY_CLASS} disabled={busy} onClick={onPrimary}>
              {primaryLabel}
            </button>
          ) : null}
          {onDismiss ? (
            <button type="button" data-focusable tabIndex={0} className={GHOST_CLASS} onClick={onDismiss}>
              {dismissLabel || t('ai.dismiss')}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
