import { useState, useEffect } from 'preact/hooks';
import { useI18n, LANGUAGE_NAMES, type SupportedLanguage } from '../../lib/i18n';
import { PreferencesManager } from '../../lib/client/storage';
import { TokenManager } from '../../lib/client/storage';
import { saveUserConfigMerge } from '../../lib/api/popcorn-web';
import { Globe, Moon, Sun, Clock, Palette } from 'lucide-preact';
import { UI_PACKS, type UiPackId } from '../../lib/theme/packs';
import {
  THEME_CHANGED_EVENT,
  THEME_DAY_START_HOUR,
  THEME_NIGHT_START_HOUR,
  applyTheme,
  saveTheme,
  saveUiPack,
  type ThemePreference,
} from '../../lib/theme';

type ThemeValue = ThemePreference;

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

  // Mode auto : le passage 7 h / 20 h est géré par Layout.astro ; on resynchronise l’UI
  useEffect(() => {
    const sync = () => setPreferences(PreferencesManager.getPreferences());
    window.addEventListener(THEME_CHANGED_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGED_EVENT, sync);
  }, []);

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
    saveTheme(theme);
    setPreferences(PreferencesManager.getPreferences());
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const handlePackChange = (id: UiPackId) => {
    saveUiPack(id);
    setPreferences(PreferencesManager.getPreferences());
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const currentTheme = (preferences.theme || 'auto') as ThemeValue;
  const currentPack = (preferences.uiPack === 'classic' ? 'classic' : 'tesla') as UiPackId;
  const showLanguage = section === 'all' || section === 'language';
  const showTheme = section === 'all' || section === 'theme';
  const lang = language === 'en' ? 'en' : 'fr';

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
            data-focusable
            tabIndex={0}
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

  const themeModeBlock = (
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
            data-focusable
            tabIndex={0}
            onClick={() => handleThemeChange(theme)}
          >
            {theme === 'dark' && <Moon className="w-4 h-4" />}
            {theme === 'light' && <Sun className="w-4 h-4" />}
            {theme === 'auto' && <Clock className="w-4 h-4" />}
            {t(`interfaceSettings.themeOptions.${theme}`)}
          </button>
        ))}
      </div>
      <p className="ds-text-tertiary text-xs mt-3">
        {t('interfaceSettings.themeAutoHint', {
          dayStart: THEME_DAY_START_HOUR,
          nightStart: THEME_NIGHT_START_HOUR,
        })}
      </p>
    </>
  );

  const packBlock = (
    <>
      <p className="ds-text-secondary text-sm mb-4">{t('interfaceSettings.uiPackDescription')}</p>
      <div className="flex flex-col gap-2">
        {UI_PACKS.map((pack) => (
          <button
            key={pack.id}
            type="button"
            className={`flex items-start gap-3 px-4 py-3 rounded-[var(--ds-radius-sm)] border-2 text-left transition-all font-medium focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] ${
              currentPack === pack.id
                ? 'border-[var(--ds-accent-violet)] bg-[var(--ds-accent-violet-muted)] text-[var(--ds-text-primary)]'
                : 'border-[var(--ds-border)] text-[var(--ds-text-secondary)] hover:border-white/20 hover:bg-white/5'
            }`}
            data-focusable
            tabIndex={0}
            onClick={() => handlePackChange(pack.id)}
          >
            <span
              className="mt-1 w-3 h-3 rounded-full flex-shrink-0"
              style={{ background: pack.swatch.accent }}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="block">{pack.name[lang]}</span>
              <span className="block text-xs font-normal opacity-80 mt-0.5">{pack.description[lang]}</span>
              <span className="block text-xs font-normal ds-text-tertiary mt-1">
                {pack.id === 'classic' ? t('interfaceSettings.uiPackClassicHint') : t('interfaceSettings.uiPackTeslaHint')}
              </span>
            </span>
          </button>
        ))}
      </div>
    </>
  );

  const themeBlock = (
    <div className="space-y-8">
      {packBlock}
      {themeModeBlock}
    </div>
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
        <div class="sc-frame">
          <div class="sc-frame-header">
            <div class="sc-frame-icon">
              <Globe className="w-5 h-5" aria-hidden />
            </div>
            <div class="sc-frame-title">{t('account.language')}</div>
          </div>
          <div class="sc-frame-body">
            {languageBlock}
          </div>
        </div>
      )}

      {showTheme && (
        <div class="sc-frame">
          <div class="sc-frame-header">
            <div class="sc-frame-icon">
              <Palette className="w-5 h-5" aria-hidden />
            </div>
            <div class="sc-frame-title">{t('interfaceSettings.theme')}</div>
          </div>
          <div class="sc-frame-body">
            {themeBlock}
          </div>
        </div>
      )}

      <p className="ds-text-tertiary text-sm mt-4">
        Les paramètres d'affichage de la bibliothèque (langue, qualité, pagination) sont dans Paramètres → Bibliothèque.
      </p>
    </div>
  );
}
