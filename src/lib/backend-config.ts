/**
 * Gestion de la configuration de l'URL du backend Rust
 * 
 * Stockage dans localStorage (côté client uniquement)
 * Pour les routes API Astro (SSR), utiliser les variables d'environnement
 * 
 * Priorité de récupération:
 * 1. localStorage (côté client uniquement)
 * 2. Variable d'environnement BACKEND_URL (dev/prod)
 * 3. Valeur par défaut:
 *    - Android: http://10.0.2.2:3000 (adresse spéciale émulateur pour accéder à localhost de l'hôte)
 *    - Autres: http://127.0.0.1:3000
 */

const STORAGE_KEY = 'popcorn_backend_url';

/**
 * Retourne l'URL backend par défaut selon la plateforme
 */
function getDefaultBackendUrl(): string {
  // Sur Android (émulateur), utiliser 10.0.2.2 pour accéder à localhost de la machine hôte
  if (typeof window !== 'undefined') {
    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);
    if (isAndroid) {
      return 'http://10.0.2.2:3000';
    }
  }
  return 'http://127.0.0.1:3000';
}

/**
 * Récupère l'URL du backend
 * 
 * Côté client: lit depuis localStorage, puis env, puis défaut
 * Côté serveur (SSR): lit depuis env, puis défaut (localStorage non disponible)
 */
export function getBackendUrl(): string {
  // Côté serveur (Astro SSR), localStorage n'est pas disponible
  if (typeof window === 'undefined') {
    // Utiliser variable d'environnement ou valeur par défaut
    return import.meta.env.BACKEND_URL || 
           import.meta.env.PUBLIC_BACKEND_URL || 
           getDefaultBackendUrl();
  }

  // Côté client: priorité localStorage
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return stored;
    }
  } catch (error) {
    console.warn('[backend-config] Erreur lors de la lecture de localStorage:', error);
  }

  // Fallback: variable d'environnement
  if (import.meta.env.BACKEND_URL || import.meta.env.PUBLIC_BACKEND_URL) {
    return import.meta.env.BACKEND_URL || import.meta.env.PUBLIC_BACKEND_URL || '';
  }

  // Valeur par défaut (détecte Android automatiquement)
  return getDefaultBackendUrl();
}

/**
 * Version asynchrone pour compatibilité
 */
export async function getBackendUrlAsync(): Promise<string> {
  return getBackendUrl();
}

/**
 * Définit l'URL du backend dans localStorage (côté client uniquement)
 */
export function setBackendUrl(url: string): void {
  if (typeof window === 'undefined') {
    console.warn('[backend-config] setBackendUrl appelé côté serveur, ignoré');
    return;
  }

  try {
    // Valider l'URL avant de la stocker
    try {
      const urlObj = new URL(url);
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        throw new Error('Le protocole doit être http:// ou https://');
      }
    } catch (e) {
      if (e instanceof TypeError) {
        throw new Error('URL invalide. Format attendu: http://ip:port ou https://domaine.com');
      }
      throw e;
    }

    localStorage.setItem(STORAGE_KEY, url.trim());
  } catch (error) {
    console.error('[backend-config] Erreur lors de la sauvegarde dans localStorage:', error);
    throw error;
  }
}

/**
 * Supprime l'URL du backend de localStorage
 */
export function clearBackendUrl(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[backend-config] Erreur lors de la suppression de localStorage:', error);
  }
}

/**
 * Vérifie si une URL du backend est configurée PAR L'UTILISATEUR
 * 
 * IMPORTANT: Cette fonction doit retourner true SEULEMENT si l'utilisateur a configuré l'URL
 * (via localStorage). Les env vars sont des fallbacks pour getBackendUrl(), pas des "configurations".
 * 
 * Si hasBackendUrl() retourne false, l'app doit rediriger vers /setup (premier démarrage).
 */
export function hasBackendUrl(): boolean {
  if (typeof window === 'undefined') {
    // Côté serveur: considérer comme non configuré (le setup n'existe qu'en client)
    return false;
  }

  try {
    // Côté client: retourner true SEULEMENT si localStorage contient une valeur
    // (env vars = fallback, pas une "configuration utilisateur")
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null && stored.trim() !== '';
  } catch (error) {
    // Si localStorage n'est pas accessible, considérer comme non configuré
    console.warn('[backend-config] hasBackendUrl: localStorage access failed:', error);
    return false;
  }
}
