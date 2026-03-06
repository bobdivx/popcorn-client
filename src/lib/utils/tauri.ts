/**
 * Utilitaires pour détecter l'environnement Tauri
 * Compatible avec Tauri 2 et mode web
 */

/**
 * Vérifie si l'application s'exécute dans Tauri
 */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  // Tauri 2 : vérifier la présence de l'objet Tauri
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

/**
 * Vérifie si les APIs Tauri sont disponibles
 * Note: Cette fonction ne doit être appelée que dans l'environnement Tauri
 */
export async function checkTauriAvailable(): Promise<boolean> {
  if (!isTauri()) return false;
  // En mode dev/web, on ne peut pas importer les plugins Tauri
  // On retourne true si on détecte Tauri, car les plugins seront disponibles au runtime
  return true;
}
