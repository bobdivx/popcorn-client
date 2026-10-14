import { useEffect } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';

export interface AiChoice {
  id: string;
  label: string;
  detail?: string;
  imageUrl?: string | null;
}

/** Faits structurés (qualité, langue, sources…) — plus lisibles qu’un résumé « 1080P, MULTI, 508 ». */
export interface AiFact {
  label: string;
  value: string;
}

export interface AiAssistProps {
  mode: 'explain' | 'pick' | 'confirm';
  summary: string;
  /** Titre court au-dessus du résumé (ex. « Version recommandée »). */
  title?: string;
  facts?: AiFact[];
  choices?: AiChoice[];
  primaryLabel?: string;
  dismissLabel?: string;
  busy?: boolean;
  onPrimary?: () => void;
  onChoose?: (id: string) => void;
  onDismiss?: () => void;
}

export function AiAssist({
  mode,
  summary,
  title,
  facts = [],
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

  if (!summary && choices.length === 0 && facts.length === 0) return null;

  return (
    <section
      className="ed-assist w-full"
      aria-live="polite"
      data-ai-assist={mode}
    >
      {title ? <p className="ed-assist__kicker">{title}</p> : null}

      {busy ? (
        <p className="ed-assist__summary ed-assist__summary--muted">{t('ai.busy')}</p>
      ) : summary ? (
        <p className="ed-assist__summary">{summary}</p>
      ) : null}

      {facts.length > 0 ? (
        <dl className="ed-assist__facts">
          {facts.map((fact) => (
            <div key={`${fact.label}-${fact.value}`} className="ed-assist__fact">
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {mode !== 'explain' && choices.length > 0 && (
        <div className="ed-assist__choices">
          {choices.slice(0, 3).map((choice) => (
            <button
              key={choice.id}
              type="button"
              data-focusable
              tabIndex={0}
              className="ed-assist__choice"
              onClick={() => onChoose?.(choice.id)}
            >
              {choice.imageUrl ? (
                <img src={choice.imageUrl} alt="" className="ed-assist__choice-img" />
              ) : null}
              <span className="ed-assist__choice-text">
                <span className="ed-assist__choice-label">{choice.label}</span>
                {choice.detail ? (
                  <span className="ed-assist__choice-detail">{choice.detail}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}

      {(onPrimary || onDismiss) && mode !== 'explain' ? (
        <div className="ed-assist__actions">
          {onPrimary && primaryLabel ? (
            <button
              type="button"
              data-focusable
              tabIndex={0}
              className="ed-assist__btn ed-assist__btn--primary"
              disabled={busy}
              onClick={onPrimary}
            >
              {primaryLabel}
            </button>
          ) : null}
          {onDismiss ? (
            <button
              type="button"
              data-focusable
              tabIndex={0}
              className="ed-assist__btn ed-assist__btn--ghost"
              onClick={onDismiss}
            >
              {dismissLabel || t('ai.dismiss')}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
