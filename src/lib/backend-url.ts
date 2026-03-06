/**
 * Obtient l'URL du backend Rust
 * 
 * DÉPRÉCIÉ: Utilise maintenant backend-config.ts qui stocke dans localStorage
 * 
 * Cette fonction est conservée pour compatibilité ascendante.
 * Elle délègue maintenant à backend-config.ts
 * 
 * Note: Cette fonction est utilisée côté serveur (routes API Astro) et côté client.
 * Côté serveur: utilise les variables d'environnement ou valeur par défaut
 * Côté client: utilise localStorage, puis env vars, puis valeur par défaut
 */
import { getBackendUrl as getBackendUrlFromConfig, getBackendUrlAsync as getBackendUrlAsyncFromConfig } from './backend-config.js';

/**
 * Réinitialise le cache de l'URL du backend (conservé pour compatibilité)
 * Note: Le cache est maintenant géré par backend-config.ts
 */
export function clearBackendUrlCache(): void {
  // Pas de cache à réinitialiser, localStorage est utilisé directement
  console.warn('[backend-url] clearBackendUrlCache() est déprécié, utiliser backend-config.ts directement');
}

/**
 * Récupère l'URL du backend (version asynchrone)
 * Délègue à backend-config.ts
 */
export async function getBackendUrlAsync(): Promise<string> {
  return getBackendUrlAsyncFromConfig();
}

/**
 * Récupère l'URL du backend (version synchrone)
 * Délègue à backend-config.ts
 */
export function getBackendUrl(): string {
  return getBackendUrlFromConfig();
}
