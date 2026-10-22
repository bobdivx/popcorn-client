import { useI18n, LANGUAGE_NAMES, type SupportedLanguage } from '../../../lib/i18n';
import { syncFieldToCloud } from '../../../lib/utils/cloud-sync';

interface LanguageStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: () => void;
}

/** Codes affichés dans le repère carré (les drapeaux emoji s'affichent mal sur webOS / Windows). */
const LANGUAGE_CODES: Record<SupportedLanguage, string> = {
  fr: 'FR',
  en: 'EN',
};

const LANGUAGE_DESCRIPTIONS: Record<SupportedLanguage, string> = {
  fr: 'Interface en français',
  en: 'English interface',
};

export function LanguageStep({ focusedButtonIndex, buttonRefs, onNext }: LanguageStepProps) {
  const { language, setLanguage, t, availableLanguages } = useI18n();

  const handleLanguageChange = (lang: SupportedLanguage) => {
    setLanguage(lang);
    syncFieldToCloud({ language: lang }).catch(() => {});
  };

  return (
    <div>
      <header class="wz-head">
        <span class="wz-kicker">Langue · Language</span>
        <h2 class="wz-title">{t('wizard.language.title')}</h2>
        <span class="wz-rule" />
        <p class="wz-lead">{t('wizard.language.description')}</p>
      </header>

      <div class="wz-stack-sm" style="max-width:460px;" role="radiogroup" aria-label={t('wizard.language.title')}>
        {availableLanguages.map((lang) => {
          const selected = language === lang;
          return (
            <button
              key={lang}
              type="button"
              role="radio"
              aria-checked={selected}
              data-focusable
              class={`wz-option${selected ? ' is-selected' : ''}`}
              onClick={() => handleLanguageChange(lang)}
            >
              <span class="wz-option__icon" style="font-family:var(--wz-display);font-size:0.72rem;letter-spacing:0.16em;">
                {LANGUAGE_CODES[lang] || String(lang).toUpperCase()}
              </span>
              <span class="wz-option__body">
                <span class="wz-option__title">{LANGUAGE_NAMES[lang]}</span>
                <span class="wz-option__desc">{LANGUAGE_DESCRIPTIONS[lang]}</span>
              </span>
              <span class="wz-option__end">
                {selected ? (
                  <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={1.5} aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div class="wz-actions wz-actions--end">
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          type="button"
          class="wz-btn wz-btn--primary"
          data-focusable
          onClick={onNext}
        >
          Continuer
          <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width={1.5} aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
