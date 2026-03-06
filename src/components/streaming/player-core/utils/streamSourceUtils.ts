/**
 * Utilitaires partagés pour la détection du type de source (local, UNC, ami)
 * et les politiques de seek/fallback.
 */

/**
 * Retourne true si le chemin est un chemin réseau UNC (\\server\share ou //server/share).
 * Exclut les URLs de protocole (https://, etc.).
 */
export function isUncPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  const n = path.replace(/\\/g, '/').trim();
  if (!n.startsWith('//')) return false;
  // Exclure les URLs (https://, etc.)
  if (/^\/\/[a-z][a-z0-9+.-]*:\//i.test(n)) return false;
  return n.length > 2;
}

/**
 * Retourne true si l'info_hash désigne un média de la bibliothèque locale (local_<id>).
 */
export function isLocalLibraryMedia(infoHash: string | undefined): boolean {
  return Boolean(infoHash?.startsWith('local_'));
}

/**
 * Détermine si le reload avec seek backend (force_vod + seek=) peut être utilisé.
 * Activé pour tous les types : on s'appuie sur le retry limité (2x) + fallback force_vod sans seek
 * dans useHlsPlayer pour éviter une boucle 503 tout en permettant d'avancer dans la vidéo.
 */
export function canUseSeekReload(_options: {
  infoHash?: string;
  streamBackendUrl?: string | null;
  filePath?: string | null;
}): boolean {
  return true;
}
