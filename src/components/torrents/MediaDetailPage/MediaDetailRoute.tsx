import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ClientTorrentStats } from '../../../lib/client/types';
import { getDownloadClientStats } from '../../../lib/utils/download-meta-storage';
import MediaDetailPage from './index';
import type { MediaDetailPageProps } from './types';
import { serverApi } from '../../../lib/client/server-api';

type Torrent = MediaDetailPageProps['torrent'];

function getContentIdFromLocation(): string {
  if (typeof window === 'undefined') return '';

  const urlParams = new URLSearchParams(window.location.search);
  const fromQuery =
    urlParams.get('slug') || urlParams.get('contentId') || urlParams.get('id') || urlParams.get('infoHash');
  if (fromQuery) return fromQuery;

  const pathname = window.location.pathname;
  const torrentsMatch = pathname.match(/^\/torrents\/(.+)$/);
  if (torrentsMatch?.[1]) return torrentsMatch[1];

  return '';
}

function getTmdbIdFromLocation(): number | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('tmdbId');
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

function getTitleFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('title');
}

/** Lit le paramètre `from` dans l'URL (ex. ?from=library). */
function getFromFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const from = new URLSearchParams(window.location.search).get('from');
  return from ? from.toLowerCase() : null;
}

/** Lit le paramètre `from` et retourne l’URL de retour (fallback si pas d'historique). La priorité est à history.back(). */
function getBackHrefFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const from = getFromFromLocation();
  if (!from) return null;
  if (from === 'library') {
    const type = new URLSearchParams(window.location.search).get('type');
    return type === 'tv' ? '/series?view=library' : '/films?view=library';
  }
  const map: Record<string, string> = {
    dashboard: '/dashboard',
    discover: '/discover',
    downloads: '/downloads',
    search: '/search',
    torrents: '/torrents',
  };
  return map[from] ?? null;
}

/** Lit le paramètre streamBackendUrl (média partagé par un ami : streamer depuis son serveur sans changer notre backend). */
function getStreamBackendUrlFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('streamBackendUrl');
  return v && v.trim() ? v.trim().replace(/\/$/, '') : null;
}

function getStreamInfoHashFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('infoHash');
  return v && v.trim() ? v.trim() : null;
}

function getStreamPathFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('streamPath');
  return v ? decodeURIComponent(v) : null;
}

function normalizeSeedCount(t: any): number {
  return Number(t?.seedCount ?? t?.seed_count ?? 0) || 0;
}

/** Normalise un titre/fichier pour comparaison (lowercase, sans extension). */
function normalizeTitleForMatch(s: string): string {
  return (s || '').toLowerCase().replace(/\.[a-z0-9]+$/i, '').trim();
}

/** True si le chemin ressemble à un fichier (contient une extension vidéo), pas seulement un dossier. */
function pathLooksLikeFile(p: string | null | undefined): boolean {
  if (!p || !p.trim()) return false;
  const lower = p.replace(/\\/g, '/').trim().toLowerCase();
  return /\.(mkv|mp4|avi|webm|mov|m4v|wmv|ts|m2ts)$/i.test(lower) || /\.[a-z0-9]{2,4}$/.test(lower);
}

/** Retourne true si le variant correspond au titre demandé (ex. nom de fichier bibliothèque). */
function variantMatchesTitle(variant: any, titleHint: string): boolean {
  if (!titleHint || titleHint.trim().length === 0) return false;
  const hintNorm = normalizeTitleForMatch(titleHint);
  const nameNorm = normalizeTitleForMatch(variant?.name ?? variant?.clean_title ?? '');
  const cleanNorm = normalizeTitleForMatch(variant?.clean_title ?? '');
  if (!hintNorm) return false;
  // Premier segment (ex. "mercy" depuis "mercy.2026.multi...") pour matcher le titre du film
  const hintFirstWord = hintNorm.split(/[.\s\-_]+/)[0] ?? hintNorm;
  if (hintFirstWord.length < 2) return false;
  return (
    nameNorm.includes(hintFirstWord) ||
    hintNorm.includes(nameNorm.split(/[.\s\-_]+/)[0] ?? '') ||
    (nameNorm.includes(hintNorm) || hintNorm.includes(nameNorm)) ||
    (cleanNorm.includes(hintFirstWord) || cleanNorm.includes(hintNorm))
  );
}

/**
 * Convertit un variant du backend en objet torrent pour le frontend
 */
function convertVariantToTorrent(variant: any): Torrent {
  // Parser genres si c'est une string JSON
  let genres: string[] | null = null;
  if (variant.genres) {
    try {
      if (typeof variant.genres === 'string') {
        genres = JSON.parse(variant.genres);
      } else if (Array.isArray(variant.genres)) {
        genres = variant.genres;
      }
    } catch (e) {
      console.warn('[MediaDetailRoute] Erreur lors du parsing de genres:', e);
    }
  }

  // Parser quality si c'est une string JSON (format depuis la DB)
  let qualityObj: any = null;
  if (variant.quality) {
    try {
      if (typeof variant.quality === 'string') {
        // Vérifier si c'est du JSON valide avant de parser
        // Si ça commence par { ou [, c'est probablement du JSON
        const trimmed = variant.quality.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
          qualityObj = JSON.parse(variant.quality);
        } else {
          // Ce n'est pas du JSON, c'est probablement juste une chaîne simple comme "1080P"
          // On l'utilisera directement dans le champ "full"
          qualityObj = null;
        }
      } else if (typeof variant.quality === 'object') {
        qualityObj = variant.quality;
      }
    } catch (e) {
      // Erreur de parsing JSON, ce n'est probablement pas du JSON
      // On ignore l'erreur et on utilisera la valeur directement
      console.debug('[MediaDetailRoute] quality n\'est pas du JSON valide, utilisation directe:', variant.quality);
      qualityObj = null;
    }
  }

  // Construire l'objet quality avec priorité aux données de la DB, puis fallback sur quality parsé, puis extraction
  const quality = {
    resolution: variant.resolution || qualityObj?.resolution || null,
    source: variant.source_format || variant.format || qualityObj?.source || null,
    codec: variant.video_codec || variant.codec || qualityObj?.codec || null,
    audio: variant.audio_codec || qualityObj?.audio || null,
    language: variant.language || qualityObj?.language || null,
    full: qualityObj?.full || variant.quality || null,
  };

  const infoHash = variant.info_hash || variant.infoHash || null;
  return {
    id: variant.id || '',
    slug: variant.slug || variant.id || null,
    infoHash: infoHash,
    name: variant.name || '',
    cleanTitle: variant.clean_title || variant.cleanTitle || null,
    description: variant.description || null,
    category: variant.category || null,
    imageUrl: variant.poster_url || variant.posterUrl || variant.image_url || variant.imageUrl || null,
    heroImageUrl: variant.hero_image_url || variant.heroImageUrl || null,
    logoUrl: variant.logo_url || variant.logoUrl || null,
    trailerKey: variant.trailer_key || variant.trailerKey || null,
    fileSize: variant.file_size || variant.fileSize || 0,
    seedCount: variant.seed_count || variant.seedCount || 0,
    leechCount: variant.leech_count || variant.leechCount || 0,
    _externalLink: variant._externalLink || variant.external_link || null,
    _externalMagnetUri: variant._externalMagnetUri || variant.external_magnet_uri || null,
    _guid: (variant as any)._guid || null, // GUID Torznab pour téléchargement via API
    indexerId: (variant as any).indexer_id || (variant as any).indexerId || null,
    indexerName: (variant as any).indexer_name || (variant as any).indexerName || null,
    language: variant.language || null,
    format: variant.format || variant.source_format || null,
    codec: variant.codec || variant.video_codec || null,
    quality: quality,
    // Données TMDB
    synopsis: variant.synopsis || null,
    releaseDate: variant.release_date || variant.releaseDate || null,
    genres: genres,
    voteAverage: variant.vote_average || variant.voteAverage || null,
    runtime: variant.runtime || null,
    tmdbId: variant.tmdb_id || variant.tmdbId || null,
    tmdbType: variant.tmdb_type || variant.tmdbType || null,
  } as Torrent;
}

function pickBestTorrentFromGroupPayload(payload: any, titleHint?: string | null): Torrent | null {
  // Payloads possibles selon backend / versions:
  // - { success, torrents: [...] }
  // - { success, data: { torrents: [...] } }
  // - { success, data: { variants: [...] } }
  // - { success, data: { success, data: { torrents: [...] } } } (double imbrication)
  // - { success, data: { success, data: { variants: [...] } } } (double imbrication)
  
  // Gérer la double imbrication (data.data)
  let data = payload?.data;
  if (data && data.success && data.data) {
    data = data.data;
  }
  
  const torrents =
    payload?.torrents ??
    data?.torrents ??
    data?.variants ??
    data?.items ??
    data;

  if (Array.isArray(torrents) && torrents.length > 0) {
    let best: any;
    if (titleHint && titleHint.trim().length > 0) {
      const matching = torrents.filter((t: any) => variantMatchesTitle(t, titleHint));
      if (matching.length > 0) {
        best = matching.slice().sort((a: any, b: any) => normalizeSeedCount(b) - normalizeSeedCount(a))[0];
      }
    }
    if (!best) {
      best = torrents.slice().sort((a: any, b: any) => normalizeSeedCount(b) - normalizeSeedCount(a))[0];
    }
    // Convertir le variant en objet torrent avec toutes les données nettoyées
    const converted = convertVariantToTorrent(best);
    console.log('[MediaDetailRoute] Meilleur torrent sélectionné et converti:', {
      id: converted.id,
      name: converted.name,
      cleanTitle: converted.cleanTitle,
      quality: converted.quality,
      language: converted.language,
      format: converted.format,
      codec: converted.codec,
      releaseDate: converted.releaseDate,
      hasExternalLink: !!converted._externalLink,
      hasTrailerKey: !!converted.trailerKey,
    });
    return converted;
  }

  // Si la donnée est déjà un torrent unique
  if (torrents && typeof torrents === 'object' && (torrents.infoHash || torrents.info_hash || torrents.id)) {
    // Convertir si c'est un variant, sinon retourner tel quel
    const converted = convertVariantToTorrent(torrents);
    console.log('[MediaDetailRoute] Torrent unique converti:', {
      id: converted.id,
      name: converted.name,
      cleanTitle: converted.cleanTitle,
      quality: converted.quality,
    });
    return converted;
  }

  return null;
}

/** Convertit un item de la bibliothèque (getLibrary) en objet Torrent pour la page détail */
function libraryItemToTorrent(localMedia: any): Torrent {
  // name est déjà le titre TMDB (tmdb_title || file_name) côté backend
  const displayTitle = localMedia.name || '';
  return {
    id: localMedia.info_hash || localMedia.slug || '',
    slug: localMedia.slug || null,
    infoHash: localMedia.info_hash || null,
    name: displayTitle,
    mainTitle: displayTitle || null,
    cleanTitle: displayTitle || null,
    description: localMedia.synopsis || null,
    category: localMedia.category || null,
    imageUrl: localMedia.poster_url || null,
    heroImageUrl: localMedia.hero_image_url || null,
    logoUrl: localMedia.logo_url || localMedia.logoUrl || null,
    trailerKey: null,
    fileSize: localMedia.file_size || 0,
    seedCount: 0,
    leechCount: 0,
    _externalLink: null,
    _externalMagnetUri: null,
    _guid: null,
    indexerId: null,
    indexerName: null,
    language: localMedia.language || null,
    format: localMedia.source_format || null,
    codec: localMedia.video_codec || null,
    quality: {
      resolution: localMedia.resolution || null,
      source: localMedia.source_format || null,
      codec: localMedia.video_codec || null,
      audio: localMedia.audio_codec || null,
      language: localMedia.language || null,
      full: localMedia.quality || null,
    },
    synopsis: localMedia.synopsis || null,
    releaseDate: localMedia.release_date || null,
    genres: (() => {
      if (!localMedia.genres) return null;
      if (typeof localMedia.genres === 'string') {
        try {
          return JSON.parse(localMedia.genres);
        } catch {
          return [localMedia.genres];
        }
      }
      return Array.isArray(localMedia.genres) ? localMedia.genres : null;
    })(),
    voteAverage: localMedia.vote_average ?? null,
    runtime: localMedia.runtime ?? null,
    tmdbId: localMedia.tmdb_id ?? null,
    tmdbType: localMedia.tmdb_type ?? null,
    downloadPath: localMedia.download_path ?? null,
  } as Torrent;
}

export default function MediaDetailRoute() {
  const contentId = useMemo(() => getContentIdFromLocation(), []);
  const tmdbId = useMemo(() => getTmdbIdFromLocation(), []);
  const titleFromQuery = useMemo(() => getTitleFromLocation(), []);
  const [torrent, setTorrent] = useState<Torrent | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  /** Incrémenté quand le backend revient (backendReconnected) pour relancer le chargement. */
  const [retryKey, setRetryKey] = useState(0);
  /** Quand groupe vide (pas encore synchronisé), titre pour "Rechercher sur les indexeurs" */
  const [emptyGroupMainTitle, setEmptyGroupMainTitle] = useState<string | null>(null);
  /** Toutes les variantes du groupe (pour séries) */
  const [initialVariants, setInitialVariants] = useState<Torrent[]>([]);
  /** Épisodes par saison (séries uniquement) */
  const [seriesEpisodes, setSeriesEpisodes] = useState<import('../../../lib/client/server-api/media.js').SeriesEpisodesResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEmptyGroupMainTitle(null);

    async function load() {
      const streamBackendUrl = getStreamBackendUrlFromLocation();
      const streamInfoHash = getStreamInfoHashFromLocation();
      const streamPath = getStreamPathFromLocation();
      const streamTitle = getTitleFromLocation();

      // Média partagé par un ami : on a tout dans l'URL, pas besoin d'appeler notre backend
      if (streamBackendUrl && (streamInfoHash || streamPath)) {
        const sharedTorrent: Torrent = {
          id: streamInfoHash || `shared_${streamPath?.replace(/[/\\]/g, '_') || 'unknown'}`,
          slug: null,
          infoHash: streamInfoHash || null,
          name: streamTitle || 'Média partagé',
          cleanTitle: streamTitle || null,
          description: null,
          category: null,
          imageUrl: null,
          heroImageUrl: null,
          trailerKey: null,
          fileSize: 0,
          seedCount: 0,
          leechCount: 0,
          _externalLink: null,
          _externalMagnetUri: null,
          _guid: null,
          indexerId: null,
          indexerName: null,
          quality: null,
          synopsis: null,
          releaseDate: null,
          genres: null,
          voteAverage: null,
          runtime: null,
          tmdbId: tmdbId ?? null,
          tmdbType: null,
          downloadPath: streamPath || null,
        };
        if (!cancelled) {
          setTorrent(sharedTorrent);
          setLoading(false);
        }
        return;
      }

      if (!contentId && !tmdbId) {
        setLoading(false);
        setError('Aucun contenu spécifié');
        return;
      }

      setLoading(true);
      setError(null);
      setTorrent(null);
      setInitialVariants([]);
      setSeriesEpisodes(null);

      try {
        // Détecter si c'est un média local (slug commence par "local_")
        const isLocalMedia = contentId.startsWith('local_');
        
        // Si c'est un média local, récupérer depuis la bibliothèque
        if (isLocalMedia) {
          console.log('[MediaDetailRoute] Détection d\'un média local, récupération depuis la bibliothèque:', contentId);
          const libraryResponse = await serverApi.getLibrary();
          if (libraryResponse.success && libraryResponse.data) {
            const libraryItems = Array.isArray(libraryResponse.data) ? libraryResponse.data : [];
            // Trouver le média correspondant au slug
            const localMedia = libraryItems.find((item: any) => 
              item.info_hash === contentId || item.slug === contentId
            );
            
            if (localMedia && !cancelled) {
              console.log('[MediaDetailRoute] Média local trouvé:', localMedia);
              // Convertir le média local en objet Torrent
              const displayTitle = localMedia.name || '';
              const t: Torrent = {
                id: localMedia.info_hash || localMedia.slug || contentId,
                slug: localMedia.slug || null,
                // Pour les médias locaux, utiliser contentId (qui contient "local_...") si info_hash n'est pas disponible
                infoHash: localMedia.info_hash || (contentId.startsWith('local_') ? contentId : null),
                name: displayTitle,
                mainTitle: displayTitle || null,
                cleanTitle: displayTitle || null,
                description: localMedia.synopsis || null,
                category: localMedia.category || null,
                imageUrl: localMedia.poster_url || null,
                heroImageUrl: localMedia.hero_image_url || null,
                trailerKey: null,
                fileSize: localMedia.file_size || 0,
                seedCount: 0,
                leechCount: 0,
                _externalLink: null,
                _externalMagnetUri: null,
                _guid: null,
                indexerId: null,
                indexerName: null,
                language: localMedia.language || null,
                format: localMedia.source_format || null,
                codec: localMedia.video_codec || null,
                quality: {
                  resolution: localMedia.resolution || null,
                  source: localMedia.source_format || null,
                  codec: localMedia.video_codec || null,
                  audio: localMedia.audio_codec || null,
                  language: localMedia.language || null,
                  full: localMedia.quality || null,
                },
                synopsis: localMedia.synopsis || null,
                releaseDate: localMedia.release_date || null,
                genres: (() => {
                  if (!localMedia.genres) return null;
                  if (typeof localMedia.genres === 'string') {
                    try {
                      return JSON.parse(localMedia.genres);
                    } catch {
                      return [localMedia.genres];
                    }
                  }
                  return Array.isArray(localMedia.genres) ? localMedia.genres : null;
                })(),
                voteAverage: localMedia.vote_average || null,
                runtime: localMedia.runtime || null,
                tmdbId: localMedia.tmdb_id || null,
                tmdbType: localMedia.tmdb_type || null,
                // Chemin du fichier local
                downloadPath: localMedia.download_path || null,
                _demoStreamUrl: localMedia.demo_stream_url || null,
              } as Torrent;
              
              setTorrent(t);
              setLoading(false);
              return;
            } else {
              console.warn('[MediaDetailRoute] Média local non trouvé dans la bibliothèque:', contentId);
              if (!cancelled) {
                setError('Média local non trouvé dans la bibliothèque. Le fichier peut avoir été supprimé ou déplacé.');
                setLoading(false);
                return;
              }
            }
          } else {
            // Erreur lors de la récupération de la bibliothèque
            if (!cancelled) {
              setError(libraryResponse.message || 'Erreur lors de la récupération de la bibliothèque');
              setLoading(false);
              return;
            }
          }
        }

        // Cas tmdbId : recherche → détail (média peut ne pas être synchronisé)
        if (tmdbId) {
          const fromParam = getFromFromLocation();

          // Depuis la bibliothèque avec un titre (nom de fichier) : privilégier l'entrée bibliothèque qui correspond
          if (fromParam === 'library' && titleFromQuery && titleFromQuery.trim().length > 0) {
            const libraryResponse = await serverApi.getLibrary();
            if (libraryResponse.success && libraryResponse.data && !cancelled) {
              const libraryItems = Array.isArray(libraryResponse.data) ? libraryResponse.data : [];
              const titleNorm = normalizeTitleForMatch(titleFromQuery);
              const hintFirst = titleNorm.split(/[.\s\-_]+/)[0] ?? '';
              const matchByTitle = (item: any) => {
                const name = (item.name || item.file_name || '').toString();
                const nameNorm = normalizeTitleForMatch(name);
                return name && (nameNorm.includes(hintFirst) || titleNorm.includes(nameNorm.split(/[.\s\-_]+/)[0] ?? ''));
              };
              const typeParam = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('type');
              const isSeries = typeParam === 'tv';
              if (isSeries) {
                const seriesInLibrary = libraryItems.filter(
                  (item: any) =>
                    item.tmdb_id === tmdbId &&
                    (item.tmdb_type === 'tv' || item.tmdb_type === 'series' || item.category === 'SERIES') &&
                    item.exists
                );
                const matchingByTitle = seriesInLibrary.filter(matchByTitle);
                const seriesCandidates = matchingByTitle.length > 0 ? matchingByTitle : seriesInLibrary;
                const toUse = seriesCandidates.find((i: any) => pathLooksLikeFile(i.download_path)) ?? seriesCandidates[0];
                if (toUse) {
                  const variants = seriesInLibrary.map((i: any) => libraryItemToTorrent(i));
                  setTorrent(libraryItemToTorrent(toUse));
                  setInitialVariants(variants);
                  try {
                    const episodesRes = await serverApi.getSeriesEpisodesByTmdbId(tmdbId);
                    if (episodesRes.success && episodesRes.data && !cancelled) setSeriesEpisodes(episodesRes.data);
                  } catch { setSeriesEpisodes(null); }
                  setLoading(false);
                  return;
                }
              } else {
                const moviesInLibrary = libraryItems.filter(
                  (item: any) =>
                    item.tmdb_id === tmdbId &&
                    (item.tmdb_type === 'movie' || item.category === 'MOVIE') &&
                    item.exists
                );
                const matchingByTitle = moviesInLibrary.filter(matchByTitle);
                const candidates = matchingByTitle.length > 0 ? matchingByTitle : moviesInLibrary;
                // Privilégier une entrée dont download_path est un fichier (pas seulement le dossier)
                const toUse = candidates.find((i: any) => pathLooksLikeFile(i.download_path)) ?? candidates[0];
                if (toUse) {
                  const t = libraryItemToTorrent(toUse);
                  const variants = moviesInLibrary.map((i: any) => libraryItemToTorrent(i));
                  setTorrent(t);
                  setInitialVariants(variants);
                  setLoading(false);
                  return;
                }
              }
            }
          }

          const groupResponse = await serverApi.getTorrentGroupByTmdbId(tmdbId, titleFromQuery ?? undefined);
          let best = groupResponse.success && groupResponse.data
            ? pickBestTorrentFromGroupPayload(groupResponse, titleFromQuery ?? undefined)
            : null;
          const data = groupResponse?.data as any;
          const emptyGroupTitle = data?.main_title || titleFromQuery || '';

          if (best && !cancelled) {
            setTorrent({ ...best, mainTitle: data?.main_title ?? undefined });
            setLoading(false);
            return;
          }

          // Fallback : média (série ou film) peut être dans la bibliothèque (fichiers locaux / NAS) sans être dans le groupe indexé
          const libraryResponse = await serverApi.getLibrary();
          if (libraryResponse.success && libraryResponse.data && !cancelled) {
            const libraryItems = Array.isArray(libraryResponse.data) ? libraryResponse.data : [];
            const seriesInLibrary = libraryItems.filter(
              (item: any) =>
                item.tmdb_id === tmdbId &&
                (item.tmdb_type === 'tv' || item.tmdb_type === 'series' || item.category === 'SERIES') &&
                item.exists
            );
            if (seriesInLibrary.length > 0) {
              const withPoster = seriesInLibrary.find((i: any) => i.poster_url || i.hero_image_url);
              const main = withPoster ?? seriesInLibrary[0];
              const variants = seriesInLibrary.map((i: any) => libraryItemToTorrent(i));
              setTorrent(libraryItemToTorrent(main));
              setInitialVariants(variants);
              // Charger les saisons/épisodes pour la page détail série (médias locaux)
              try {
                const episodesRes = await serverApi.getSeriesEpisodesByTmdbId(tmdbId);
                if (episodesRes.success && episodesRes.data && !cancelled) {
                  setSeriesEpisodes(episodesRes.data);
                }
              } catch (_e) {
                setSeriesEpisodes(null);
              }
              setLoading(false);
              return;
            }
            // Film(s) en bibliothèque (dossier local / NAS) pour ce tmdbId
            const moviesInLibrary = libraryItems.filter(
              (item: any) =>
                item.tmdb_id === tmdbId &&
                (item.tmdb_type === 'movie' || item.category === 'MOVIE') &&
                item.exists
            );
            if (moviesInLibrary.length > 0) {
              const withPoster = moviesInLibrary.find((i: any) => i.poster_url || i.hero_image_url);
              const main = withPoster ?? moviesInLibrary[0];
              const variants = moviesInLibrary.map((i: any) => libraryItemToTorrent(i));
              setTorrent(libraryItemToTorrent(main));
              setInitialVariants(variants);
              setLoading(false);
              return;
            }
          }

          if (!cancelled) {
            setEmptyGroupMainTitle(emptyGroupTitle || null);
            setError(
              data?.variants && Array.isArray(data.variants) && data.variants.length === 0
                ? 'Aucun torrent trouvé pour ce slug. Le torrent peut ne pas encore être synchronisé dans la base de données.'
                : (groupResponse?.message || 'Torrent non trouvé')
            );
            setLoading(false);
          }
          return;
        }

        // Détecter si contentId ressemble à un info_hash
        const looksLikeInfoHash = !contentId.startsWith('external_') && !isLocalMedia &&
          (contentId.length === 40 || contentId.length === 32) &&
          /^[a-fA-F0-9]+$/.test(contentId);

        if (looksLikeInfoHash) {
          const byIdResponse = await serverApi.getTorrentById(contentId);
          const byIdData = byIdResponse?.data as any;
          const best = pickBestTorrentFromGroupPayload(byIdResponse);
          if (best && !cancelled) {
            setTorrent({ ...best, mainTitle: byIdData?.main_title ?? undefined });
            setLoading(false);
            return;
          }
        }

        // 1) Essayer group/<slug> via serverApi
        const groupResponse = await serverApi.getTorrentGroup(contentId);
        console.log('[MediaDetailRoute] Réponse getTorrentGroup complète:', JSON.stringify(groupResponse, null, 2));
        if (groupResponse.success && groupResponse.data) {
          const data = groupResponse.data as any;
          console.log('[MediaDetailRoute] Structure data:', {
            hasVariants: !!data.variants,
            variantsCount: data.variants?.length,
            variants: data.variants,
            variantCount: data.variant_count,
            slug: data.slug,
            mainTitle: data.main_title,
          });
          
          const best = pickBestTorrentFromGroupPayload(groupResponse);
          const mainTitle = data?.main_title ?? undefined;
          if (best && !cancelled) {
            setTorrent({ ...best, mainTitle });
            console.log('[MediaDetailRoute] Torrent final sélectionné:', {
              id: best.id,
              name: best.name,
              mainTitle,
              hasExternalLink: !!(best as any)._externalLink,
              externalLink: (best as any)._externalLink,
              hasExternalMagnetUri: !!(best as any)._externalMagnetUri,
              hasGuid: !!(best as any)._guid,
              guid: (best as any)._guid,
              allKeys: Object.keys(best as any),
            });
            // Toutes les variantes pour la page (séries : sélection par épisode)
            const variants = (data?.variants ?? []) as any[];
            if (variants.length > 0) {
              setInitialVariants(variants.map((v: any) => ({ ...convertVariantToTorrent(v), mainTitle })));
            } else {
              setInitialVariants([{ ...best, mainTitle }]);
            }
            // Épisodes par saison si c'est une série
            if (best.tmdbType === 'tv' || (best as any).tmdb_type === 'tv') {
              try {
                const episodesRes = await serverApi.getSeriesEpisodes(contentId);
                if (episodesRes.success && episodesRes.data && !cancelled) {
                  setSeriesEpisodes(episodesRes.data);
                } else {
                  setSeriesEpisodes(null);
                }
              } catch (_e) {
                setSeriesEpisodes(null);
              }
            } else {
              setSeriesEpisodes(null);
            }
            setLoading(false);
            return;
          }
          
          // Si le groupe existe mais est vide, vérifier les raisons
          if (data.variants && Array.isArray(data.variants) && data.variants.length === 0) {
            if (contentId.startsWith('external_')) {
              console.warn('[MediaDetailRoute] Groupe externe vide détecté:', {
                slug: data.slug,
                mainTitle: data.main_title,
                variantCount: data.variant_count,
                message: 'Le torrent externe existe mais aucune variante n\'a été trouvée dans la base de données. Le torrent peut ne pas encore être synchronisé.',
              });
              if (!cancelled) {
                setError('Torrent externe trouvé mais aucune variante disponible. Le torrent peut ne pas encore être synchronisé dans la base de données.');
                setLoading(false);
                return;
              }
            } else {
              console.warn('[MediaDetailRoute] Groupe vide détecté (non-externe):', {
                slug: data.slug,
                mainTitle: data.main_title,
                variantCount: data.variant_count,
                contentId,
                looksLikeInfoHash,
              });
              
              // Si le groupe est vide mais que contentId ressemble à un info_hash,
              // essayer getTorrentById comme fallback (cas des médias de la bibliothèque)
              if (looksLikeInfoHash) {
                console.log('[MediaDetailRoute] Tentative de fallback avec getTorrentById pour info_hash:', contentId);
                const byIdResponse = await serverApi.getTorrentById(contentId);
                const byIdData = byIdResponse?.data as any;
                const best = pickBestTorrentFromGroupPayload(byIdResponse);
                if (best && !cancelled) {
                  console.log('[MediaDetailRoute] Torrent trouvé via getTorrentById fallback');
                  setTorrent({ ...best, mainTitle: byIdData?.main_title ?? data?.main_title ?? undefined });
                  setLoading(false);
                  return;
                }
              }
              
              if (!cancelled) {
                setEmptyGroupMainTitle(data.main_title || '');
                setError('Aucun torrent trouvé pour ce slug. Le torrent peut ne pas encore être synchronisé dans la base de données.');
                setLoading(false);
                return;
              }
            }
          }
        }

        // 2) Fallback final pour les slugs qui ne sont pas des info_hash
        // (seulement si on n'a pas déjà essayé getTorrentById)
        if (!looksLikeInfoHash) {
          if (!cancelled) {
            setError(groupResponse?.message || 'Torrent non trouvé');
            setLoading(false);
          }
        } else {
          // Si c'était un info_hash mais qu'on n'a rien trouvé, afficher l'erreur
          if (!cancelled) {
            setError(groupResponse?.message || 'Torrent non trouvé');
            setLoading(false);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Erreur lors du chargement');
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [contentId, tmdbId, titleFromQuery, retryKey]);

  // Quand le backend redevient disponible, relancer le chargement pour mettre à jour la page
  useEffect(() => {
    const onReconnected = () => setRetryKey((k) => k + 1);
    window.addEventListener('backendReconnected', onReconnected);
    return () => window.removeEventListener('backendReconnected', onReconnected);
  }, []);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-16 h-16 mb-4 mx-auto">
            <div className="absolute inset-0 border-4 border-primary-600/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-white/80">Chargement...</p>
        </div>
      </div>
    );
  }

  if (error) {
    const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const tmdbIdParam = urlParams?.get('tmdbId');
    const typeParam = urlParams?.get('type') || 'movie';
    const discoverHref =
      tmdbIdParam && (typeParam === 'movie' || typeParam === 'tv')
        ? `/discover?tmdbId=${tmdbIdParam}&type=${typeParam}`
        : null;

    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-3">{error}</h1>
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            {discoverHref && (
              <a
                href={discoverHref}
                className="text-primary-400 hover:text-primary-300 font-medium"
              >
                Demander ce média
              </a>
            )}
            {emptyGroupMainTitle && !discoverHref && (
              <a
                href={`/search?q=${encodeURIComponent(emptyGroupMainTitle)}`}
                className="text-primary-400 hover:text-primary-300 font-medium"
              >
                Rechercher sur les indexeurs
              </a>
            )}
            <a href="/dashboard" className="text-blue-400 hover:text-blue-300">
              Retour au dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (!torrent) return null;
  // Récupérer les stats client (progression, partage) dès qu'on a un info_hash, pour afficher
  // le statut de téléchargement et "en partage" que l'on ouvre la page depuis Téléchargements
  // (infoHash dans l'URL) ou depuis la Bibliothèque (slug dans l'URL, mais torrent.infoHash connu).
  const initialTorrentStats: ClientTorrentStats | null = torrent.infoHash
    ? (getDownloadClientStats(torrent.infoHash) as ClientTorrentStats | null)
    : null;
  const backHref = getBackHrefFromLocation();
  const streamBackendUrl = getStreamBackendUrlFromLocation();
  return (
    <MediaDetailPage
      torrent={torrent}
      initialVariants={initialVariants.length > 0 ? initialVariants : undefined}
      seriesEpisodes={seriesEpisodes ?? undefined}
      initialTorrentStats={initialTorrentStats ?? undefined}
      backHref={backHref ?? undefined}
      streamBackendUrl={streamBackendUrl ?? undefined}
    />
  );
}

