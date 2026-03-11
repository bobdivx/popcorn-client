import { useI18n, LANGUAGE_NAMES, type SupportedLanguage } from '../../../lib/i18n';
import { syncFieldToCloud } from '../../../lib/utils/cloud-sync';

interface LanguageStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: () => void;
}

const LANGUAGE_FLAGS: Record<SupportedLanguage, string> = {
  fr: '🇫🇷',
  en: '🇬🇧',
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
      <style>{`
        .lang-card {
          display: flex; align-items: center; gap: 14px;
          padding: 16px 18px;
          border-radius: 12px;
          border: 1.5px solid rgba(255,255,255,0.07);
          background: rgba(255,255,255,0.03);
          cursor: pointer;
          transition: all 0.15s;
          margin-bottom: 10px;
          position: relative;
        }
        .lang-card:hover:not(.selected) {
          border-color: rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
        }
        .lang-card.selected {
          border-color: rgba(124,58,237,0.5);
          background: rgba(124,58,237,0.08);
          box-shadow: 0 0 0 3px rgba(124,58,237,0.1);
        }
        .lang-flag {
          font-size: 32px; line-height: 1; flex-shrink: 0;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
        }
        .lang-check {
          width: 20px; height: 20px; border-radius: 50%;
          background: #7c3aed;
          display: flex; align-items: center; justify-content: center;
          margin-left: auto; flex-shrink: 0;
          box-shadow: 0 0 0 3px rgba(124,58,237,0.25);
        }
        .lang-check-empty {
          width: 20px; height: 20px; border-radius: 50%;
          border: 1.5px solid rgba(255,255,255,0.12);
          margin-left: auto; flex-shrink: 0;
        }
      `}</style>

      <div style="margin-bottom:28px;">
        <h2 style="font-size:24px;font-weight:700;color:#fff;margin:0 0 8px;">{t('wizard.language.title')}</h2>
        <p style="font-size:14px;color:rgba(255,255,255,0.4);margin:0;">{t('wizard.language.description')}</p>
      </div>

      <div style="max-width:380px;">
        {availableLanguages.map((lang) => (
          <div
            key={lang}
            class={`lang-card ${language === lang ? 'selected' : ''}`}
            onClick={() => handleLanguageChange(lang)}
          >
            <span class="lang-flag">{LANGUAGE_FLAGS[lang]}</span>
            <div>
              <div style="font-size:15px;font-weight:600;color:#fff;">{LANGUAGE_NAMES[lang]}</div>
              <div style="font-size:12.5px;color:rgba(255,255,255,0.4);margin-top:2px;">{LANGUAGE_DESCRIPTIONS[lang]}</div>
            </div>
            {language === lang ? (
              <div class="lang-check">
                <svg style="width:11px;height:11px;color:#fff;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div class="lang-check-empty" />
            )}
          </div>
        ))}
      </div>

      <div style="margin-top:24px;">
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          class="wizard-btn-primary"
          onClick={onNext}
        >
          Continuer
          <svg style="width:14px;height:14px;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
