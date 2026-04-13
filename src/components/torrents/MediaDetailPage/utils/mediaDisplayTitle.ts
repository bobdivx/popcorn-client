import type { MediaDetailPageProps } from '../types';
import { decodeHtmlEntities } from '../../../../lib/utils/htmlEntities';

/**
 * Titre pour hero / lecteur.
 * `tmdbApiTitle` : titre renvoyé par `/api/discover/movie|tv/:id` (prioritaire = source TMDB fiable).
 */
export function getMediaDisplayTitle(
  torrent: MediaDetailPageProps['torrent'],
  tmdbApiTitle?: string | null
): string {
  const raw =
    (tmdbApiTitle ?? '').trim() ||
    (torrent as { tmdbTitle?: string | null }).tmdbTitle?.trim() ||
    (torrent.mainTitle ?? '').trim() ||
    (torrent.cleanTitle ?? '').trim() ||
    (torrent.name ?? '').trim();
  return decodeHtmlEntities(raw).trim();
}
