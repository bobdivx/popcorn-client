import { useState, useEffect } from 'preact/hooks';
import { useI18n, LANGUAGE_NAMES, type SupportedLanguage } from '../../lib/i18n';
import { PreferencesManager } from '../../lib/client/storage';
import { TokenManager } from '../../lib/client/storage';
import { saveUserConfigMerge } from '../../lib/api/popcorn-web';
import { Globe, Moon, Sun, Monitor } from 'lucide-preact';
import { DsCard, DsCardSection } from '../ui/design-system';

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
  /** Si true, pas de wrapper ni titre (contenu seul pour DsSettingsSectionCard) */
  embedded?: boolean;
}

export default function UiPreferencesPanel({ section = 'all', embedded = false }: UiPreferencesPanelProps) {
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

  const languageBlock = (
    <>
      <p className="ds-text-secondary text-sm mb-4">{t('account.languageDescription')}</p>
      <div className="flex flex-wrap gap-2">
        {availableLanguages.map((lang) => (
          <button
            key={lang}
            type="button"
            disabled={languageSaving}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-[var(--ds-radius-sm)] border-2 transition-all font-medium ${
              language === lang
                ? 'border-[var(--ds-accent-violet)] bg-[var(--ds-accent-violet-muted)] text-[var(--ds-text-primary)]'
                : 'border-[var(--ds-border)] text-[var(--ds-text-secondary)] hover:border-white/20 hover:bg-white/5'
            } ${languageSaving ? 'opacity-60 cursor-not-allowed' : ''} focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)]`}
            onClick={() => handleLanguageChange(lang)}
          >
            <span className="text-lg">{lang === 'fr' ? '🇫🇷' : '🇬🇧'}</span>
            {LANGUAGE_NAMES[lang]}
            {language === lang && (
              <svg className="w-4 h-4 text-[var(--ds-accent-violet)]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </>
  );

  const themeBlock = (
    <>
      <p className="ds-text-secondary text-sm mb-4">{t('interfaceSettings.themeDescription')}</p>
      <div className="flex flex-wrap gap-2">
        {(['dark', 'light', 'auto'] as const).map((theme) => (
          <button
            key={theme}
            type="button"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-[var(--ds-radius-sm)] border-2 transition-all font-medium focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] ${
              currentTheme === theme
                ? 'border-[var(--ds-accent-violet)] bg-[var(--ds-accent-violet-muted)] text-[var(--ds-text-primary)]'
                : 'border-[var(--ds-border)] text-[var(--ds-text-secondary)] hover:border-white/20 hover:bg-white/5'
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
    </>
  );

  if (embedded && (section === 'language' || section === 'theme')) {
    return (
      <div className="min-w-0">
        {saved && (
          <div className="ds-status-badge ds-status-badge--success w-fit mb-4" role="status">
            {t('common.success')}
          </div>
        )}
        {section === 'language' && languageBlock}
        {section === 'theme' && themeBlock}
      </div>
    );
  }

  return (
    <div className="flex-1 py-4 px-4 sm:px-6 space-y-6 overflow-y-auto scrollbar-visible">
      {saved && (
        <div className="ds-status-badge ds-status-badge--success w-fit" role="status">
          {t('common.success')}
        </div>
      )}

      {showLanguage && (
        <DsCard variant="elevated">
          <DsCardSection>
            <h3 className="flex items-center gap-2 ds-title-section text-[var(--ds-text-primary)] mb-4">
              <Globe className="w-5 h-5 text-[var(--ds-accent-violet)]" />
              {t('account.language')}
            </h3>
            {languageBlock}
          </DsCardSection>
        </DsCard>
      )}

      {showTheme && (
        <DsCard variant="elevated">
          <DsCardSection>
            <h3 className="flex items-center gap-2 ds-title-section text-[var(--ds-text-primary)] mb-4">
              <Moon className="w-5 h-5 text-[var(--ds-accent-violet)]" />
              {t('interfaceSettings.theme')}
            </h3>
            {themeBlock}
          </DsCardSection>
        </DsCard>
      )}

      <p className="ds-text-tertiary text-sm mt-4">
        Les paramètres d'affichage de la bibliothèque (langue, qualité, pagination) sont dans Paramètres → Bibliothèque.
      </p>
    </div>
  );
}
