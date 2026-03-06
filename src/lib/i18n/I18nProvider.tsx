import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { I18nContext } from './I18nContext';
import type { SupportedLanguage, TranslationDictionary } from './types';
import { DEFAULT_LANGUAGE, AVAILABLE_LANGUAGES } from './types';
import { PreferencesManager } from '../client/storage';

// Import des traductions
import frTranslations from '../../locales/fr.json';
import enTranslations from '../../locales/en.json';

const translations: Record<SupportedLanguage, TranslationDictionary> = {
  fr: frTranslations,
  en: enTranslations,
};

interface I18nProviderProps {
  children: ComponentChildren;
  initialLanguage?: SupportedLanguage;
}

/**
 * Récupère une valeur imbriquée dans un objet à partir d'une clé avec points
 * Ex: getNestedValue(obj, 'wizard.language.title')
 */
function getNestedValue(obj: any, path: string): string | undefined {
  const keys = path.split('.');
  let current = obj;
  
  for (const key of keys) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[key];
  }
  
  return typeof current === 'string' ? current : undefined;
}

/**
 * Remplace les paramètres dans une chaîne de traduction
 * Ex: "Bonjour {name}" avec { name: "John" } => "Bonjour John"
 */
function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  
  return Object.entries(params).reduce((result, [key, value]) => {
    return result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }, text);
}

/**
 * Provider i18n pour l'application
 */
export function I18nProvider({ children, initialLanguage }: I18nProviderProps) {
  // Récupère la langue depuis les préférences ou utilise la valeur par défaut
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    if (initialLanguage) return initialLanguage;
    
    // Côté client, récupère depuis localStorage
    if (typeof window !== 'undefined') {
      const prefs = PreferencesManager.getPreferences();
      const savedLang = prefs.language as SupportedLanguage;
      if (savedLang && AVAILABLE_LANGUAGES.includes(savedLang)) {
        return savedLang;
      }
    }
    
    return DEFAULT_LANGUAGE;
  });

  // Met à jour la langue et la sauvegarde dans les préférences
  const setLanguage = useCallback((newLang: SupportedLanguage) => {
    if (!AVAILABLE_LANGUAGES.includes(newLang)) {
      console.warn(`[i18n] Langue non supportée: ${newLang}`);
      return;
    }
    
    setLanguageState(newLang);
    
    // Sauvegarde dans les préférences locales
    if (typeof window !== 'undefined') {
      PreferencesManager.updatePreferences({ language: newLang });
      
      // Met à jour l'attribut lang du document
      document.documentElement.lang = newLang;
      
      // Émet un événement pour notifier les autres composants
      window.dispatchEvent(new CustomEvent('language-changed', { detail: { language: newLang } }));
    }
  }, []);

  // Fonction de traduction
  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const translation = getNestedValue(translations[language], key);
    
    if (translation === undefined) {
      // Fallback sur le français si la traduction n'existe pas
      const fallback = getNestedValue(translations[DEFAULT_LANGUAGE], key);
      if (fallback === undefined) {
        console.warn(`[i18n] Clé de traduction manquante: ${key}`);
        return key;
      }
      return interpolate(fallback, params);
    }
    
    return interpolate(translation, params);
  }, [language]);

  // Met à jour l'attribut lang du document au chargement
  useEffect(() => {
    if (typeof window !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  // Écoute les changements de langue depuis d'autres sources (ex: import cloud)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorageChange = () => {
      const prefs = PreferencesManager.getPreferences();
      const savedLang = prefs.language as SupportedLanguage;
      if (savedLang && AVAILABLE_LANGUAGES.includes(savedLang) && savedLang !== language) {
        setLanguageState(savedLang);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [language]);

  const contextValue = useMemo(() => ({
    language,
    setLanguage,
    t,
    availableLanguages: AVAILABLE_LANGUAGES,
  }), [language, setLanguage, t]);

  return (
    <I18nContext.Provider value={contextValue}>
      {children}
    </I18nContext.Provider>
  );
}
