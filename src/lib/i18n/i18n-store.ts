/**
 * Store i18n global pour gérer la langue de manière partagée entre les composants
 * Utilise un pattern pub/sub pour notifier les composants des changements
 */

import type { SupportedLanguage, TranslationDictionary } from './types';
import { DEFAULT_LANGUAGE, AVAILABLE_LANGUAGES } from './types';

// Import des traductions
import frTranslations from '../../locales/fr.json';
import enTranslations from '../../locales/en.json';

const translations: Record<SupportedLanguage, TranslationDictionary> = {
  fr: frTranslations,
  en: enTranslations,
};

type Listener = (language: SupportedLanguage) => void;

class I18nStore {
  private language: SupportedLanguage = DEFAULT_LANGUAGE;
  private listeners: Set<Listener> = new Set();
  private initialized = false;

  constructor() {
    // Initialisation côté client uniquement
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  private init() {
    if (this.initialized) return;
    this.initialized = true;

    // Récupère la langue depuis localStorage
    try {
      const stored = localStorage.getItem('popcorn_client_user_preferences');
      if (stored) {
        const prefs = JSON.parse(stored);
        if (prefs.language && AVAILABLE_LANGUAGES.includes(prefs.language)) {
          this.language = prefs.language;
        }
      }
    } catch (e) {
      console.warn('[i18n] Erreur lors de la lecture des préférences:', e);
    }

    // Met à jour l'attribut lang du document
    document.documentElement.lang = this.language;

    // Écoute les changements depuis d'autres onglets/fenêtres
    window.addEventListener('storage', this.handleStorageChange);

    // Écoute les événements personnalisés de changement de langue
    window.addEventListener('language-changed', this.handleLanguageEvent as EventListener);
  }

  private handleStorageChange = (e: StorageEvent) => {
    if (e.key === 'popcorn_client_user_preferences' && e.newValue) {
      try {
        const prefs = JSON.parse(e.newValue);
        if (prefs.language && AVAILABLE_LANGUAGES.includes(prefs.language) && prefs.language !== this.language) {
          this.language = prefs.language;
          this.notifyListeners();
        }
      } catch (e) {
        // Ignore les erreurs de parsing
      }
    }
  };

  private handleLanguageEvent = (e: CustomEvent<{ language: SupportedLanguage }>) => {
    if (e.detail.language && e.detail.language !== this.language) {
      this.language = e.detail.language;
      this.notifyListeners();
    }
  };

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.language));
  }

  getLanguage(): SupportedLanguage {
    return this.language;
  }

  setLanguage(lang: SupportedLanguage) {
    if (!AVAILABLE_LANGUAGES.includes(lang)) {
      console.warn(`[i18n] Langue non supportée: ${lang}`);
      return;
    }

    if (lang === this.language) return;

    this.language = lang;

    // Sauvegarde dans localStorage
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('popcorn_client_user_preferences');
        const prefs = stored ? JSON.parse(stored) : {};
        prefs.language = lang;
        localStorage.setItem('popcorn_client_user_preferences', JSON.stringify(prefs));

        // Met à jour l'attribut lang du document
        document.documentElement.lang = lang;

        // Émet un événement pour les autres composants dans la même page
        window.dispatchEvent(new CustomEvent('language-changed', { detail: { language: lang } }));
      } catch (e) {
        console.warn('[i18n] Erreur lors de la sauvegarde de la langue:', e);
      }
    }

    this.notifyListeners();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Récupère une valeur imbriquée dans un objet à partir d'une clé avec points
   */
  private getNestedValue(obj: any, path: string): string | undefined {
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
   */
  private interpolate(text: string, params?: Record<string, string | number>): string {
    if (!params) return text;
    
    return Object.entries(params).reduce((result, [key, value]) => {
      return result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }, text);
  }

  /**
   * Fonction de traduction
   */
  t(key: string, params?: Record<string, string | number>): string {
    const translation = this.getNestedValue(translations[this.language], key);
    
    if (translation === undefined) {
      // Fallback sur le français si la traduction n'existe pas
      const fallback = this.getNestedValue(translations[DEFAULT_LANGUAGE], key);
      if (fallback === undefined) {
        console.warn(`[i18n] Clé de traduction manquante: ${key}`);
        return key;
      }
      return this.interpolate(fallback, params);
    }
    
    return this.interpolate(translation, params);
  }
}

// Instance singleton
export const i18nStore = new I18nStore();
