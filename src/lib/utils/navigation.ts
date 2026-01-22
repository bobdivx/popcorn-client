/**
 * Utilitaires de navigation qui préservent le port dans les URLs
 */

/**
 * Redirige vers un chemin en préservant le port actuel
 * @param path - Le chemin de destination (ex: '/setup', '/dashboard')
 */
export function redirectTo(path: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  
  // S'assurer que le chemin commence par /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // Utiliser window.location.origin pour préserver le port
  window.location.href = `${window.location.origin}${normalizedPath}`;
}

/**
 * Retourne l'URL complète avec le port pour un chemin donné
 * @param path - Le chemin (ex: '/setup', '/dashboard')
 * @returns L'URL complète avec le port
 */
export function getFullUrl(path: string): string {
  if (typeof window === 'undefined') {
    return path;
  }
  
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${window.location.origin}${normalizedPath}`;
}
