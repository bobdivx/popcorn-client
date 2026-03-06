import { createContext } from 'preact';
import type { I18nContextValue, SupportedLanguage } from './types';
import { DEFAULT_LANGUAGE, AVAILABLE_LANGUAGES } from './types';

/**
 * Contexte i18n pour Preact
 */
export const I18nContext = createContext<I18nContextValue>({
  language: DEFAULT_LANGUAGE,
  setLanguage: () => {},
  t: (key: string) => key,
  availableLanguages: AVAILABLE_LANGUAGES,
});
