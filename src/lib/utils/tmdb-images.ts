/**
 * Utilitaires pour les images TMDB.
 * Web : qualité max (original) pour hero / détail. TV : plafonné (w1280) — décoder du 4K à chaque slide fige l'UI.
 */
import { isTVPlatform } from './device-detection';

const TMDB_IMG_BASE = 'https://image.tmdb.org/t/p/';
const SIZE_RE = /image\.tmdb\.org\/t\/p\/(w\d+|h\d+|original)\//;

/** Tailles TMDB valides : posters w92…w780, backdrops w300/w780/w1280. */
export type TmdbSize = 'w185' | 'w300' | 'w342' | 'w500' | 'w780' | 'w1280' | 'original';

/** Remplace la taille d'une URL TMDB (sans effet sur les autres URLs). */
export function tmdbSized(url: string | null | undefined, size: TmdbSize): string | null {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const u = url.trim();
  if (!SIZE_RE.test(u)) return u;
  return u.replace(SIZE_RE, `image.tmdb.org/t/p/${size}/`);
}

/** Affiche de carte (2:3). */
export function cardPosterUrl(url: string | null | undefined): string | null {
  return tmdbSized(url, 'w342');
}

/** Backdrop de carte paysage (16:9). */
export function cardBackdropUrl(url: string | null | undefined): string | null {
  return tmdbSized(url, 'w780');
}

/**
 * URL TMDB pour hero / page détail : original sur web, w1280 sur TV.
 */
export function getHighQualityTmdbImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const u = url.trim();
  if (!u.includes(TMDB_IMG_BASE)) return u;
  const tv = typeof window !== 'undefined' && isTVPlatform();
  return tmdbSized(u, tv ? 'w1280' : 'original');
}
