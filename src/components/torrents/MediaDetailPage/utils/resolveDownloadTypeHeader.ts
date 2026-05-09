/**
 * Valeur pour l'en-tête X-Download-Type.
 * Ne renvoie une valeur que si le type est clair (TMDB ou catégorie du groupe) ;
 * sinon `undefined` pour laisser le serveur inférer depuis le nom du torrent (S01E01, etc.).
 */
export function resolveDownloadTypeHeader(torrent: {
  tmdbType?: string | null;
  category?: string | null;
}): 'film' | 'serie' | undefined {
  const t = String(torrent.tmdbType ?? '').toLowerCase();
  if (t === 'movie') return 'film';
  if (t === 'tv' || t === 'series') return 'serie';

  const c = String(torrent.category ?? '').toLowerCase();
  if (c === 'series') return 'serie';
  if (c === 'films' || c === 'film' || c === 'movie' || c === 'movies') return 'film';

  return undefined;
}
