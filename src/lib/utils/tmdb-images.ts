/**
 * Utilitaires pour les images TMDB.
 * Hero / détail : w780 (mobile) ou w1280 (desktop, TV) — jamais « original ».
 */
import { isTVPlatform } from './device-detection';
import { installImageCache } from '../media/imageCache';

// Patch des <img> TMDB (taille, priorité, cache persistant des apps) installé dès qu'un composant
// d'images est chargé, même si une île s'hydrate avant le script du Layout. Idempotent.
if (typeof window !== 'undefined') installImageCache();

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
 * Taille de backdrop adaptée à l'écran : w780 sur petits écrans (mobile), w1280 au-delà.
 * Jamais « original » (souvent 3840 px / plusieurs Mo, aucun gain visible sous un voile) ;
 * TV : w1280 (décoder du 4K à chaque slide fige l'UI).
 */
export function heroBackdropSize(): TmdbSize {
  if (typeof window === 'undefined') return 'w1280';
  if (isTVPlatform()) return 'w1280';
  const vw = Math.max(window.innerWidth || 0, (window.screen && window.screen.width) || 0);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return vw * dpr <= 900 ? 'w780' : 'w1280';
}

/**
 * URL TMDB pour hero / page détail (taille stable par appareil → même URL d'une page à l'autre,
 * donc servie depuis le cache).
 */
export function getHighQualityTmdbImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string' || !url.trim()) return null;
  const u = url.trim();
  if (!u.includes(TMDB_IMG_BASE)) return u;
  return tmdbSized(u, heroBackdropSize());
}
