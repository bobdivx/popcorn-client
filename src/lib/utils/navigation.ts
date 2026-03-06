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
  // Sous file://, pathname peut être le chemin fichier complet (ex. /D:/.../index.html) : extraire la "route" logique
  let currentPath = window.location.pathname;
  if (window.location.protocol === 'file:') {
    const match = currentPath.match(/\/([^/]+)\.html?$/);
    if (match) {
      const base = match[1].toLowerCase();
      currentPath = base === 'index' ? '/' : '/' + base;
    }
  }
  if (normalizePath(currentPath) === normalizePath(normalizedPath)) {
    return;
  }
  
  // Protection contre les redirections multiples rapides
  const now = Date.now();
  if (lastRedirect && normalizePath(lastRedirect.path) === normalizePath(normalizedPath) && (now - lastRedirect.timestamp) < REDIRECT_COOLDOWN) {
    return;
  }
  
  lastRedirect = { path: normalizedPath, timestamp: now };

  // Sous file:// (webOS), les routes sont des fichiers .html. Retarder un peu la navigation
  // pour que la page courante soit stable (évite erreur -20 quand setup.html ne charge pas).
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    const file = normalizedPath === '/' ? './index.html' : `./${normalizedPath.slice(1)}.html`;
    const doReplace = () => window.location.replace(file);
    if (document.readyState !== 'complete') {
      window.addEventListener('load', () => setTimeout(doReplace, 100), { once: true });
    } else {
      setTimeout(doReplace, 100);
    }
    return;
  }

  // Utiliser window.location.origin pour préserver le port
  window.location.href = `${window.location.origin}${normalizedPath}`;
}

/**
 * Retourne l'URL complète avec le port pour un chemin donné (ou chemin relatif .html sous file://).
 * @param path - Le chemin (ex: '/setup', '/dashboard')
 * @returns L'URL complète avec le port, ou ./page.html sous file:// (webOS)
 */
export function getFullUrl(path: string): string {
  if (typeof window === 'undefined') {
    return path;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (window.location.protocol === 'file:') {
    return normalizedPath === '/' ? './index.html' : `./${normalizedPath.slice(1)}.html`;
  }
  return `${window.location.origin}${normalizedPath}`;
}

/**
 * Retourne l'href à utiliser pour un lien <a> (compatibilité file:// webOS).
 * Sous file://, /setup → ./setup.html pour éviter erreur -20.
 */
export function getPathHref(path: string): string {
  if (typeof window === 'undefined') return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (window.location.protocol === 'file:') {
    return normalizedPath === '/' ? './index.html' : `./${normalizedPath.slice(1)}.html`;
  }
  return `${window.location.origin}${normalizedPath}`;
}
