/**
 * Gestion de la configuration de l'URL du backend Rust
 * 
 * Stockage dans localStorage (côté client uniquement)
 * Pour les routes API Astro (SSR), utiliser les variables d'environnement
 * 
 * Priorité de récupération:
 * 1. localStorage (côté client uniquement)
 * 2. Variable d'environnement BACKEND_URL (dev/prod)
 * 3. Valeur par défaut http://127.0.0.1:3000
 */

const STORAGE_KEY = 'popcorn_backend_url';

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
           'http://127.0.0.1:3000';
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

  // Valeur par défaut
  return 'http://127.0.0.1:3000';
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
 * Vérifie si une URL du backend est configurée
 */
export function hasBackendUrl(): boolean {
  if (typeof window === 'undefined') {
    // Côté serveur: vérifier env vars
    return !!(import.meta.env.BACKEND_URL || import.meta.env.PUBLIC_BACKEND_URL);
  }

  try {
    // Côté client: considérer configuré si:
    // - localStorage contient une valeur, OU
    // - une env var est fournie au build (use-case web / déploiement)
    if (localStorage.getItem(STORAGE_KEY) !== null) return true;
    return !!(import.meta.env.BACKEND_URL || import.meta.env.PUBLIC_BACKEND_URL);
  } catch (error) {
    return !!(import.meta.env.BACKEND_URL || import.meta.env.PUBLIC_BACKEND_URL);
  }
}
