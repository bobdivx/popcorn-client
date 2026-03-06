import { useState, useEffect, useCallback } from 'preact/hooks';
import { i18nStore } from './i18n-store';
import type { I18nContextValue, SupportedLanguage } from './types';
import { AVAILABLE_LANGUAGES } from './types';

/**
 * Hook pour accéder au système i18n
 * Fonctionne de manière autonome sans nécessiter de Provider
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { t, language, setLanguage } = useI18n();
 *   
 *   return (
 *     <div>
 *       <p>{t('common.next')}</p>
 *       <button onClick={() => setLanguage('en')}>English</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useI18n(): I18nContextValue {
  const [language, setLanguageState] = useState<SupportedLanguage>(i18nStore.getLanguage());

  useEffect(() => {
    // S'abonne aux changements de langue
    const unsubscribe = i18nStore.subscribe((newLang) => {
      setLanguageState(newLang);
    });

    // Synchronise avec la valeur actuelle du store (au cas où elle aurait changé)
    setLanguageState(i18nStore.getLanguage());

    return unsubscribe;
  }, []);

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    i18nStore.setLanguage(lang);
  }, []);

  const t = useCallback((key: string, params?: Record<string, string | number>) => {
    return i18nStore.t(key, params);
  }, [language]); // Recalcule quand la langue change

  return {
    language,
    setLanguage,
    t,
    availableLanguages: AVAILABLE_LANGUAGES,
  };
}
