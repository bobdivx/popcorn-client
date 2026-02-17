/**
 * Utilitaires pour les images TMDB.
 * Permet d'afficher des images en qualité max (type 1080p+) dans les zones hero et détail.
 */

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/';

/** Tailles TMDB : original = résolution complète (qualité type 1080p+) */
const TMDB_SIZE_ORIGINAL = 'original';

/**
 * Retourne l'URL TMDB en qualité maximale (original = résolution complète, type 1080p+) pour hero / page détail.
 * Remplace w500 et w780 par original pour les posters/backdrops.
 */
export function getHighQualityTmdbImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const u = url.trim();
  if (!u.includes(TMDB_IMG_BASE)) return u;
  // w500 ou w780 → original pour qualité max (1080p+)
  if (u.includes(`${TMDB_IMG_BASE}w500`)) {
    return u.replace(`${TMDB_IMG_BASE}w500`, `${TMDB_IMG_BASE}${TMDB_SIZE_ORIGINAL}`);
  }
  if (u.includes(`${TMDB_IMG_BASE}w780`)) {
    return u.replace(`${TMDB_IMG_BASE}w780`, `${TMDB_IMG_BASE}${TMDB_SIZE_ORIGINAL}`);
  }
  return u;
}
