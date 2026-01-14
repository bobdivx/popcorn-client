/**
 * Gestionnaire de stockage local minimal
 * Stocke uniquement les préférences, le cache et les tokens
 */

export interface UserPreferences {
  theme?: 'light' | 'dark' | 'auto';
  language?: string;
  autoplay?: boolean;
  quality?: 'auto' | '1080p' | '720p' | '480p';
  [key: string]: any;
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  expiresAt?: number;
}

class LocalStorage {
  private static readonly PREFIX = 'popcorn_client_';

  /**
   * Stocke une valeur
   */
  static setItem(key: string, value: any): void {
    if (typeof window === 'undefined') return;
    
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(`${this.PREFIX}${key}`, serialized);
    } catch (error) {
      console.error(`Erreur lors du stockage de ${key}:`, error);
    }
  }

  /**
   * Récupère une valeur
   */
  static getItem<T = any>(key: string): T | null {
    if (typeof window === 'undefined') return null;
    
    try {
      const item = localStorage.getItem(`${this.PREFIX}${key}`);
      return item ? JSON.parse(item) : null;
    } catch (error) {
      console.error(`Erreur lors de la récupération de ${key}:`, error);
      return null;
    }
  }

  /**
   * Supprime une valeur
   */
  static removeItem(key: string): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(`${this.PREFIX}${key}`);
  }

  /**
   * Vide tout le stockage
   */
  static clear(): void {
    if (typeof window === 'undefined') return;
    
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(this.PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }
}

/**
 * Gestionnaire de préférences utilisateur
 */
export class PreferencesManager {
  private static readonly KEY = 'user_preferences';

  /**
   * Récupère les préférences utilisateur
   */
  static getPreferences(): UserPreferences {
    return LocalStorage.getItem<UserPreferences>(this.KEY) || {
      theme: 'auto',
      language: 'fr',
      autoplay: false,
      quality: 'auto',
    };
  }

  /**
   * Met à jour les préférences utilisateur
   */
  static updatePreferences(preferences: Partial<UserPreferences>): void {
    const current = this.getPreferences();
    const updated = { ...current, ...preferences };
    LocalStorage.setItem(this.KEY, updated);
  }

  /**
   * Réinitialise les préférences
   */
  static resetPreferences(): void {
    LocalStorage.removeItem(this.KEY);
  }

  /**
   * Définit l'emplacement de téléchargement
   */
  static setDownloadLocation(path: string): void {
    LocalStorage.setItem('download_location', path);
  }

  /**
   * Récupère l'emplacement de téléchargement
   */
  static getDownloadLocation(): string | null {
    return LocalStorage.getItem<string>('download_location');
  }
}

/**
 * Gestionnaire de cache
 */
export class CacheManager {
  private static readonly PREFIX = 'cache_';
  private static readonly DEFAULT_TTL = 60 * 60 * 1000; // 1 heure

  /**
   * Stocke une entrée dans le cache
   */
  static set<T>(key: string, data: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl || this.DEFAULT_TTL);
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiresAt,
    };
    LocalStorage.setItem(`${this.PREFIX}${key}`, entry);
  }

  /**
   * Récupère une entrée du cache
   */
  static get<T>(key: string): T | null {
    const entry = LocalStorage.getItem<CacheEntry<T>>(`${this.PREFIX}${key}`);
    
    if (!entry) return null;

    // Vérifier l'expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.delete(key);
      return null;
    }

    return entry.data;
  }

  /**
   * Supprime une entrée du cache
   */
  static delete(key: string): void {
    LocalStorage.removeItem(`${this.PREFIX}${key}`);
  }

  /**
   * Vide tout le cache
   */
  static clear(): void {
    if (typeof window === 'undefined') return;
    
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(LocalStorage['PREFIX'] + CacheManager.PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }

  /**
   * Nettoie le cache expiré
   */
  static cleanup(): void {
    if (typeof window === 'undefined') return;
    
    const keys = Object.keys(localStorage);
    const prefix = LocalStorage['PREFIX'] + this.PREFIX;
    
    keys.forEach(key => {
      if (key.startsWith(prefix)) {
        const entry = LocalStorage.getItem<CacheEntry>(key.replace(prefix, ''));
        if (entry?.expiresAt && Date.now() > entry.expiresAt) {
          localStorage.removeItem(key);
        }
      }
    });
  }
}

/**
 * Gestionnaire de tokens d'authentification
 */
export class TokenManager {
  private static readonly ACCESS_TOKEN_KEY = 'access_token';
  private static readonly REFRESH_TOKEN_KEY = 'refresh_token';
  private static readonly CLOUD_ACCESS_TOKEN_KEY = 'cloud_access_token';
  private static readonly CLOUD_REFRESH_TOKEN_KEY = 'cloud_refresh_token';

  /**
   * Stocke les tokens locaux
   */
  static setTokens(accessToken: string, refreshToken: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(this.REFRESH_TOKEN_KEY, refreshToken);
  }

  /**
   * Stocke les tokens cloud (de popcorn-web)
   */
  static setCloudTokens(accessToken: string, refreshToken: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(this.CLOUD_ACCESS_TOKEN_KEY, accessToken);
    localStorage.setItem(this.CLOUD_REFRESH_TOKEN_KEY, refreshToken);
  }

  /**
   * Récupère le token d'accès local
   */
  static getAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.ACCESS_TOKEN_KEY);
  }

  /**
   * Récupère le token d'accès cloud (pour les appels à popcorn-web)
   */
  static getCloudAccessToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.CLOUD_ACCESS_TOKEN_KEY);
  }

  /**
   * Récupère le token de rafraîchissement local
   */
  static getRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.REFRESH_TOKEN_KEY);
  }

  /**
   * Récupère le token de rafraîchissement cloud
   */
  static getCloudRefreshToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(this.CLOUD_REFRESH_TOKEN_KEY);
  }

  /**
   * Supprime tous les tokens (locaux et cloud)
   */
  static clearTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(this.ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.REFRESH_TOKEN_KEY);
    localStorage.removeItem(this.CLOUD_ACCESS_TOKEN_KEY);
    localStorage.removeItem(this.CLOUD_REFRESH_TOKEN_KEY);
  }
}
