import { useI18n, LANGUAGE_NAMES, type SupportedLanguage } from '../../../lib/i18n';

interface LanguageStepProps {
  focusedButtonIndex: number;
  buttonRefs: { current: (HTMLButtonElement | null)[] };
  onNext: () => void;
}

const LANGUAGE_FLAGS: Record<SupportedLanguage, string> = {
  fr: '🇫🇷',
  en: '🇬🇧',
};

export function LanguageStep({ focusedButtonIndex, buttonRefs, onNext }: LanguageStepProps) {
  const { language, setLanguage, t, availableLanguages } = useI18n();

  const handleLanguageChange = (lang: SupportedLanguage) => {
    setLanguage(lang);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-2xl font-bold text-white">{t('wizard.language.title')}</h3>
        <p className="text-gray-400 mt-2">{t('wizard.language.description')}</p>
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md mx-auto">
        {availableLanguages.map((lang) => (
          <button
            key={lang}
            type="button"
            className={`flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 ${
              language === lang
                ? 'border-primary-500 bg-primary-500/10 text-white'
                : 'border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-600 hover:bg-gray-800'
            }`}
            onClick={() => handleLanguageChange(lang)}
          >
            <span className="text-2xl">{LANGUAGE_FLAGS[lang]}</span>
            <span className="font-medium text-lg">{LANGUAGE_NAMES[lang]}</span>
            {language === lang && (
              <svg className="w-5 h-5 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        ))}
      </div>

      <div className="flex justify-end pt-4">
        <button
          ref={(el) => { buttonRefs.current[0] = el; }}
          className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition-colors"
          onClick={onNext}
        >
          {t('common.next')} →
        </button>
      </div>
    </div>
  );
}
