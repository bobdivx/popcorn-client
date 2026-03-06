/**
 * Types pour le système d'internationalisation
 */

export type SupportedLanguage = 'fr' | 'en';

export interface I18nContextValue {
  /** Langue actuelle */
  language: SupportedLanguage;
  /** Change la langue */
  setLanguage: (lang: SupportedLanguage) => void;
  /** Fonction de traduction */
  t: (key: string, params?: Record<string, string | number>) => string;
  /** Langues disponibles */
  availableLanguages: SupportedLanguage[];
}

export type TranslationDictionary = Record<string, any>;

export const DEFAULT_LANGUAGE: SupportedLanguage = 'fr';
export const AVAILABLE_LANGUAGES: SupportedLanguage[] = ['fr', 'en'];

export const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  fr: 'Français',
  en: 'English',
};
