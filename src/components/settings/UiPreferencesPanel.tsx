import { useState, useEffect } from 'preact/hooks';
import { useI18n, LANGUAGE_NAMES, type SupportedLanguage } from '../../lib/i18n';
import { PreferencesManager } from '../../lib/client/storage';
import { TokenManager } from '../../lib/client/storage';
import { saveUserConfigMerge } from '../../lib/api/popcorn-web';
import { Globe, Moon, Sun, Monitor } from 'lucide-preact';

type ThemeValue = 'light' | 'dark' | 'auto';

function applyTheme(theme: ThemeValue) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = prefersDark ? 'dark' : 'light';
  } else {
    root.dataset.theme = theme;
  }
}

export type UiSection = 'language' | 'theme' | 'all';

interface UiPreferencesPanelProps {
  section?: UiSection;
}

export default function UiPreferencesPanel({ section = 'all' }: UiPreferencesPanelProps) {
  const { t, language, setLanguage, availableLanguages } = useI18n();
  const [languageSaving, setLanguageSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [preferences, setPreferences] = useState(() => PreferencesManager.getPreferences());

  // Appliquer le thème au chargement et quand il change
  useEffect(() => {
    const theme = (preferences.theme || 'auto') as ThemeValue;
    applyTheme(theme);
  }, [preferences.theme]);

  // Écouter les changements de préférence système (mode auto)
  useEffect(() => {
    const theme = (preferences.theme || 'auto') as ThemeValue;
    if (theme !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('auto');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [preferences.theme]);

  const handleLanguageChange = async (newLang: SupportedLanguage) => {
    if (newLang === language) return;
    setLanguage(newLang);
    setLanguageSaving(true);
    try {
      const cloudToken = TokenManager.getCloudAccessToken();
      if (cloudToken) {
        await saveUserConfigMerge({ language: newLang }, cloudToken);
      }
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
    } catch {
      // Langue locale déjà sauvegardée
    } finally {
      setLanguageSaving(false);
    }
  };

  const handleThemeChange = (theme: ThemeValue) => {
    PreferencesManager.updatePreferences({ theme });
    setPreferences(PreferencesManager.getPreferences());
    applyTheme(theme);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const currentTheme = (preferences.theme || 'auto') as ThemeValue;
  const showLanguage = section === 'all' || section === 'language';
  const showTheme = section === 'all' || section === 'theme';

  return (
    <div className="flex-1 py-4 px-4 sm:px-6 space-y-6 overflow-y-auto scrollbar-visible">
      {saved && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500/20 text-primary-400 text-sm">
          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
          {t('common.success')}
        </div>
      )}

      {/* Langue */}
      {showLanguage && (
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
          <Globe className="w-5 h-5 text-primary-400" />
          {t('account.language')}
        </h3>
        <p className="text-sm text-gray-400 mb-4">{t('account.languageDescription')}</p>
        <div className="flex flex-wrap gap-2">
          {availableLanguages.map((lang) => (
            <button
              key={lang}
              type="button"
              disabled={languageSaving}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all font-medium ${
                language === lang
                  ? 'border-primary-500 bg-primary-500/20 text-white'
                  : 'border-white/10 text-gray-300 hover:border-white/20 hover:bg-white/5'
              } ${languageSaving ? 'opacity-60 cursor-not-allowed' : ''}`}
              onClick={() => handleLanguageChange(lang)}
            >
              <span className="text-lg">{lang === 'fr' ? '🇫🇷' : '🇬🇧'}</span>
              {LANGUAGE_NAMES[lang]}
              {language === lang && (
                <svg className="w-4 h-4 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </section>
      )}

      {/* Thème */}
      {showTheme && (
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
          <Moon className="w-5 h-5 text-primary-400" />
          {t('interfaceSettings.theme')}
        </h3>
        <p className="text-sm text-gray-400 mb-4">{t('interfaceSettings.themeDescription')}</p>
        <div className="flex flex-wrap gap-2">
          {(['dark', 'light', 'auto'] as const).map((theme) => (
            <button
              key={theme}
              type="button"
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all font-medium ${
                currentTheme === theme
                  ? 'border-primary-500 bg-primary-500/20 text-white'
                  : 'border-white/10 text-gray-300 hover:border-white/20 hover:bg-white/5'
              }`}
              onClick={() => handleThemeChange(theme)}
            >
              {theme === 'dark' && <Moon className="w-4 h-4" />}
              {theme === 'light' && <Sun className="w-4 h-4" />}
              {theme === 'auto' && <Monitor className="w-4 h-4" />}
              {t(`interfaceSettings.themeOptions.${theme}`)}
            </button>
          ))}
        </div>
      </section>
      )}

      <p className="text-sm text-gray-500 mt-4">
        Les paramètres d'affichage de la bibliothèque (langue, qualité, pagination) sont dans Paramètres → Synchronisation.
      </p>
    </div>
  );
}
