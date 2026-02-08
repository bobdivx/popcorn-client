/**
 * Utilitaires de navigation qui préservent le port dans les URLs
 */

// Protection contre les redirections multiples
let lastRedirect: { path: string; timestamp: number } | null = null;
const REDIRECT_COOLDOWN = 500; // 500ms de cooldown entre redirections

/**
 * Normalise un chemin pour comparaison (sans slash final, sauf pour la racine).
 * Évite les boucles /login ↔ /login/ quand le serveur redirige avec un trailing slash.
 */
export function normalizePath(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`;
  return p.replace(/\/$/, '') || '/';
}

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
  
  // Vérifier si on est déjà sur cette page (comparaison sans slash final pour éviter boucle /login vs /login/)
  const currentPath = window.location.pathname;
  if (normalizePath(currentPath) === normalizePath(normalizedPath)) {
    return;
  }
  
  // Protection contre les redirections multiples rapides
  const now = Date.now();
  if (lastRedirect && normalizePath(lastRedirect.path) === normalizePath(normalizedPath) && (now - lastRedirect.timestamp) < REDIRECT_COOLDOWN) {
    return;
  }
  
  lastRedirect = { path: normalizedPath, timestamp: now };
  
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
