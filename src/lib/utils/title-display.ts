/**
 * Utilitaires pour afficher un titre propre (sans qualité, langue, codec) dans le hero et les cartes.
 * Préférence pour le titre TMDB quand disponible.
 */

import type { ContentItem } from '../client/types';

/** Tokens techniques à retirer de la fin du titre (qualité, langue, codec, source). */
const TRAILING_TOKENS = [
  '1080p', '720p', '480p', '2160p', '4k', 'hdr', 'remux',
  'vostfr', 'vost', 'truefr', 'multi', 'vfi', 'vo', 'fr', 'en', 'french', 'english',
  'x264', 'x265', 'hevc', 'av1',
  'bdrip', 'webrip', 'web-dl', 'webdl', 'bluray', 'hdtv', 'web',
  'theatrical', 'extended', 'uncut', 'director',
];

/**
 * Retire les suffixes qualité/langue/codec courants à la fin du titre.
 * Ne modifie pas le titre s'il ne se termine pas par ces tokens.
 */
function stripTrailingTechnicalTokens(title: string): string {
  if (!title || typeof title !== 'string') return title;
  let t = title.trim();
  let changed = true;
  let iterations = 0;
  while (changed && iterations < 15) {
    changed = false;
    iterations++;
    for (const tok of TRAILING_TOKENS) {
      const re = new RegExp(`\\s*${tok}\\s*$`, 'gi');
      const before = t;
      t = t.replace(re, '').trim();
      if (t !== before) changed = true;
    }
  }
  return t.trim() || title;
}

/**
 * Retourne le titre à afficher pour le hero (et toute carte où on veut le titre TMDB propre).
 * - Si l'item a un champ tmdbTitle (envoyé par l'API), on l'utilise.
 * - Sinon on nettoie le titre (retrait qualité/langue/codec en fin).
 */
export function getDisplayTitle(item: ContentItem | undefined | null): string {
  if (!item) return '';
  const raw = item as ContentItem & { tmdbTitle?: string; tmdb_title?: string };
  const tmdbTitle =
    (typeof raw.tmdbTitle === 'string' && raw.tmdbTitle.trim() ? raw.tmdbTitle.trim() : null) ||
    (typeof raw.tmdb_title === 'string' && raw.tmdb_title.trim() ? raw.tmdb_title.trim() : null);
  if (tmdbTitle) return tmdbTitle;
  if (item.title && typeof item.title === 'string') {
    return stripTrailingTechnicalTokens(item.title);
  }
  return '';
}
