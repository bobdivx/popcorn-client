import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ClientTorrentStats } from '../../../lib/client/types';
import { getDownloadClientStats } from '../../../lib/utils/download-meta-storage';
import { normalizeTorrentStats } from '../../../lib/utils/torrentStatsUtils';
import MediaDetailPage from './index';
import type { MediaDetailPageProps } from './types';
import { serverApi } from '../../../lib/client/server-api';
import type {
  SeriesEpisodesResponse,
  SeriesEpisodeInfo,
  SeriesSeasonInfo,
} from '../../../lib/client/server-api/media';

type Torrent = MediaDetailPageProps['torrent'];

/** True si la chaîne ressemble à un info_hash (32/40 hex), pas à un slug TMDB lisible. */
function isLikelyInfoHashString(s: string | null | undefined): boolean {
  if (!s || typeof s !== 'string') return false;
  const t = s.trim();
  return (t.length === 40 || t.length === 32) && /^[a-fA-F0-9]+$/.test(t);
}

/** Nom de release type S01E04 / S1.E4 (série). */
function torrentNameLooksLikeSeriesEpisode(name: string | null | undefined): boolean {
  if (!name) return false;
  return /\bS\d{1,2}[\s._-]?E\d{1,2}\b/i.test(name);
}

function parsePositiveTmdbId(v: unknown): number | null {
  if (typeof v === 'number' && !Number.isNaN(v) && v > 0) return Math.floor(v);
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return parseInt(v.trim(), 10);
  return null;
}

function mostFrequentId(ids: number[]): number | null {
  if (!ids.length) return null;
  const m = new Map<number, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  let best: number | null = null;
  let c = 0;
  m.forEach((cnt, id) => {
    if (cnt > c) {
      c = cnt;
      best = id;
    }
  });
  return best;
}

function extractTmdbTvIdFromGroupData(data: any, best: any): number | null {
  const variants = Array.isArray(data?.variants) ? data.variants : [];
  const rows = [best, data, ...variants].filter(Boolean);
  const tvIds: number[] = [];
  for (const row of rows) {
    const typ = String(row.tmdb_type ?? row.tmdbType ?? '').toLowerCase();
    const n = parsePositiveTmdbId(row.tmdb_id ?? row.tmdbId);
    if (n == null) continue;
    if (typ === 'tv' || typ === 'series') tvIds.push(n);
  }
  if (tvIds.length) return mostFrequentId(tvIds);
  const anyIds: number[] = [];
  for (const row of rows) {
    const n = parsePositiveTmdbId(row.tmdb_id ?? row.tmdbId);
    if (n != null) anyIds.push(n);
  }
  return mostFrequentId(anyIds);
}

function extractTextSeriesSlugFromGroupData(data: any): string | null {
  const tryOne = (s: unknown): string | null => {
    if (typeof s !== 'string') return null;
    const t = s.trim();
    return t && !isLikelyInfoHashString(t) ? t : null;
  };
  const fromRoot = tryOne(data?.slug);
  if (fromRoot) return fromRoot;
  const variants = Array.isArray(data?.variants) ? data.variants : [];
  for (const v of variants) {
    const s = tryOne(v?.slug ?? v?.group_slug ?? v?.series_slug);
    if (s) return s;
  }
  return null;
}

const TMDB_SYNTH_LANG = 'fr-FR';

async function buildSeriesEpisodesFromTmdbDiscover(
  cancelled: boolean,
  tmdbTvId: number,
  slugLabel: string,
): Promise<SeriesEpisodesResponse | null> {
  if (!tmdbTvId || Number.isNaN(tmdbTvId)) return null;
  const detail = await serverApi.getTmdbTvDetail(tmdbTvId, TMDB_SYNTH_LANG);
  if (cancelled || !detail.success || !detail.data) return null;
  const d = detail.data as Record<string, unknown>;
  const showName = String(d.name || d.original_name || '').trim() || 'Série';
  const seasonsMeta = Array.isArray(d.seasons)
    ? (d.seasons as { season_number?: number }[])
    : [];
  const seasonNums = [
    ...new Set(
      seasonsMeta
        .map((s) => s.season_number)
        .filter((n): n is number => typeof n === 'number' && n >= 0),
    ),
  ].sort((a, b) => a - b);

  const seasonsOut: SeriesSeasonInfo[] = [];

  for (const seasonNum of seasonNums) {
    if (cancelled) return null;
    const sRes = await serverApi.getTmdbTvSeasonDetail(tmdbTvId, seasonNum, TMDB_SYNTH_LANG);
    if (!sRes.success || !sRes.data) continue;
    const rawEps = Array.isArray((sRes.data as { episodes?: unknown }).episodes)
      ? (sRes.data as { episodes: unknown[] }).episodes
      : [];
    const episodes: SeriesEpisodeInfo[] = [];
    for (const ep of rawEps) {
      const e = ep as { episode_number?: number; name?: string };
      if (typeof e.episode_number !== 'number') continue;
      if (e.episode_number < 0) continue;
      if (seasonNum > 0 && e.episode_number === 0) continue;
      const epNum = e.episode_number;
      const epName = (typeof e.name === 'string' && e.name.trim()) || `Épisode ${epNum}`;
      episodes.push({
        season: seasonNum,
        episode: epNum,
        name: epName,
        id: `popcorn_tmdb_${tmdbTvId}_s${seasonNum}_e${epNum}`,
        info_hash: null,
        file_size: 0,
        seed_count: 0,
        leech_count: 0,
        is_from_multi_torrent: false,
      });
    }
    if (episodes.length) seasonsOut.push({ season: seasonNum, episodes });
  }

  if (!seasonsOut.length) return null;
  const slugSafe =
    slugLabel && !isLikelyInfoHashString(slugLabel) ? slugLabel : `tmdb_${tmdbTvId}`;
  return {
    slug: slugSafe,
    main_title: showName,
    seasons: seasonsOut,
  };
}

function extractShowTmdbIdFromSyntheticPayload(p: SeriesEpisodesResponse | null): number | null {
  const first = p?.seasons?.[0]?.episodes?.[0]?.id;
  const m = typeof first === 'string' ? first.match(/^popcorn_tmdb_(\d+)_s\d+_e\d+$/) : null;
  return m ? parseInt(m[1], 10) : null;
}

function applySyntheticTmdbToTorrent(t: Torrent, payload: SeriesEpisodesResponse | null): Torrent {
  const sid = extractShowTmdbIdFromSyntheticPayload(payload);
  if (sid == null) return t;
  return {
    ...t,
    tmdbId: t.tmdbId ?? sid,
    tmdbType: (t.tmdbType as string | undefined) ?? 'tv',
  } as Torrent;
}

/**
 * Charge saisons/épisodes : priorité TMDB id, puis slug groupe (jamais un info_hash seul pour /series/.../episodes).
 * Dernier recours : recherche TMDB TV par titre, puis construction Discover si le backend est vide.
 */
async function resolveSeriesEpisodesPayload(
  cancelled: boolean,
  args: {
    contentId: string;
    groupSlug?: string | null;
    tmdbId?: number | null;
    tmdbTitleSearchHint?: string | null;
  },
): Promise<SeriesEpisodesResponse | null> {
  const { contentId, groupSlug, tmdbId, tmdbTitleSearchHint } = args;
  if (cancelled) return null;

  const slugOk =
    typeof groupSlug === 'string' && groupSlug.trim() && !isLikelyInfoHashString(groupSlug)
      ? groupSlug.trim()
      : null;

  if (typeof tmdbId === 'number' && !Number.isNaN(tmdbId)) {
    const r = await serverApi.getSeriesEpisodesByTmdbId(tmdbId);
    if (cancelled) return null;
    if (r.success && r.data?.seasons?.length) return r.data;
    const synth = await buildSeriesEpisodesFromTmdbDiscover(cancelled, tmdbId, slugOk || contentId);
    if (synth) return synth;
  }

  if (slugOk) {
    const r = await serverApi.getSeriesEpisodes(slugOk);
    if (cancelled) return null;
    if (r.success && r.data?.seasons?.length) return r.data;
  }

  if (!isLikelyInfoHashString(contentId)) {
    const r = await serverApi.getSeriesEpisodes(contentId);
    if (cancelled) return null;
    if (r.success && r.data?.seasons?.length) return r.data;
  }

  const hint = (tmdbTitleSearchHint ?? '').trim();
  if (hint.length >= 2) {
    try {
      const sr = await serverApi.searchTmdb({ q: hint, type: 'tv', language: TMDB_SYNTH_LANG });
      if (cancelled) return null;
      const normalize = (v: string) =>
        v
          .toLowerCase()
          .replace(/[^a-z0-9\s]/gi, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      const qn = normalize(hint);
      const qWords = qn.split(' ').filter((w) => w.length >= 3);
      const score = (title: string) => {
        const tn = normalize(title);
        if (!tn) return 0;
        const tWords = new Set(tn.split(' ').filter((w) => w.length >= 3));
        if (qWords.length === 0) return tn === qn ? 1 : 0;
        let matched = 0;
        for (const w of qWords) {
          if (tWords.has(w)) matched += 1;
        }
        const base = matched / qWords.length;
        // Bonus si la requête est incluse textuellement dans le titre.
        return tn.includes(qn) ? Math.min(1, base + 0.25) : base;
      };
      const candidates = Array.isArray(sr.data) ? sr.data : [];
      const best = candidates
        .map((it) => ({
          item: it,
          s: score(String((it as any)?.title || (it as any)?.name || (it as any)?.tmdbTitle || '')),
        }))
        .sort((a, b) => b.s - a.s)[0];
      const sid = best && best.s >= 0.55 ? best.item?.tmdbId : null;
      if (typeof sid === 'number' && !Number.isNaN(sid)) {
        const r2 = await serverApi.getSeriesEpisodesByTmdbId(sid);
        if (cancelled) return null;
        if (r2.success && r2.data?.seasons?.length) return r2.data;
        const synth2 = await buildSeriesEpisodesFromTmdbDiscover(cancelled, sid, slugOk || contentId);
        if (synth2) return synth2;
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

function getContentIdFromLocation(): string {
  if (typeof window === 'undefined') return '';

  const urlParams = new URLSearchParams(window.location.search);
  const slug = urlParams.get('slug');
  const infoHashParam = urlParams.get('infoHash');
  // Depuis /downloads (ou dashboard) : `slug` = groupe série/film TMDB, `infoHash` = le torrent actif.
  // Il faut charger par slug pour avoir variantes + épisodes TMDB ; l’infoHash reste lu à part pour le stream.
  if (slug?.trim() && infoHashParam?.trim()) {
    return slug.trim();
  }
  const fromQuery =
    urlParams.get('infoHash') || urlParams.get('slug') || urlParams.get('contentId') || urlParams.get('id');
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
  const tmdbTitleRaw = (variant as any).tmdb_title ?? (variant as any).tmdbTitle;
  const tmdbTitle =
    typeof tmdbTitleRaw === 'string' && tmdbTitleRaw.trim().length > 0 ? tmdbTitleRaw.trim() : null;
  return {
    id: variant.id || '',
    slug: variant.slug || variant.id || null,
    infoHash: infoHash,
    name: variant.name || '',
    tmdbTitle,
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
    // GUID Torznab pour téléchargement via API (certains backends exposent `guid` directement)
    _guid: (variant as any)._guid || (variant as any).guid || null,
    // Identifiant torrent côté indexer (utile si guid absent et que l'API attend un id numérique)
    _torrentId: (variant as any).torrent_id || (variant as any).torrentId || (variant as any)._torrentId || null,
    indexerId: (variant as any).indexer_id || (variant as any).indexerId || null,
    indexerName: (variant as any).indexer_name || (variant as any).indexerName || null,
    minimumRatio: (variant as any).minimum_ratio ?? (variant as any).minimumRatio ?? null,
    tracker: (variant as any).tracker ?? null,
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
  const tmdbTitleRaw = localMedia.tmdb_title ?? localMedia.tmdbTitle;
  const tmdbTitle =
    typeof tmdbTitleRaw === 'string' && tmdbTitleRaw.trim().length > 0 ? tmdbTitleRaw.trim() : null;
  // name côté backend = tmdb_title || file_name ; on garde aussi tmdb_title séparé pour le lecteur.
  const displayTitle = (tmdbTitle || localMedia.name || '').trim();
  return {
    id: localMedia.info_hash || localMedia.slug || '',
    slug: localMedia.slug || null,
    infoHash: localMedia.info_hash || null,
    name: displayTitle,
    tmdbTitle,
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
    minimumRatio: null,
    tracker: null,
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
  const [seriesEpisodes, setSeriesEpisodes] = useState<SeriesEpisodesResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEmptyGroupMainTitle(null);

    async function load() {
      const streamBackendUrl = getStreamBackendUrlFromLocation();
      const streamInfoHash = getStreamInfoHashFromLocation();
      const streamPath = getStreamPathFromLocation();
      const streamTitle = getTitleFromLocation();
      const fromParam = getFromFromLocation();

      const enrichFromLocalMediaByInfoHash = async (t: Torrent, infoHash: string): Promise<Torrent> => {
        // Depuis /downloads, le backend peut renvoyer un torrent sans champs TMDB.
        // On tente donc d'enrichir via l'entrée local_media (si bindée / détectée).
        if (!infoHash || typeof infoHash !== 'string') return t;
        if (t.tmdbId != null && (t.synopsis || t.imageUrl || t.heroImageUrl)) return t;
        try {
          const lm = await serverApi.findLocalMediaByInfoHash(infoHash);
          const ok = (lm as any)?.success === true;
          const data = (lm as any)?.data;
          if (!ok || !data) return t;
          const localTorrent = libraryItemToTorrent(data);
          return {
            ...t,
            // Ne pas écraser les valeurs existantes (priorité à la réponse torrent), mais compléter si manquant
            name: t.name || localTorrent.name,
            cleanTitle: t.cleanTitle ?? localTorrent.cleanTitle,
            tmdbTitle: (t as any).tmdbTitle ?? (localTorrent as any).tmdbTitle,
            mainTitle: (t as any).mainTitle ?? (localTorrent as any).mainTitle,
            imageUrl: t.imageUrl ?? localTorrent.imageUrl,
            heroImageUrl: t.heroImageUrl ?? localTorrent.heroImageUrl,
            logoUrl: (t as any).logoUrl ?? (localTorrent as any).logoUrl,
            synopsis: (t as any).synopsis ?? (localTorrent as any).synopsis,
            releaseDate: t.releaseDate ?? localTorrent.releaseDate,
            genres: t.genres ?? localTorrent.genres,
            voteAverage: t.voteAverage ?? localTorrent.voteAverage,
            runtime: t.runtime ?? localTorrent.runtime,
            tmdbId: t.tmdbId ?? localTorrent.tmdbId,
            tmdbType: t.tmdbType ?? localTorrent.tmdbType,
            downloadPath: (t as any).downloadPath ?? (localTorrent as any).downloadPath,
          } as Torrent;
        } catch {
          return t;
        }
      };

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
          minimumRatio: null,
          tracker: null,
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
                minimumRatio: null,
                tracker: null,
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
                    const payload = await resolveSeriesEpisodesPayload(cancelled, {
                      contentId,
                      tmdbId,
                      tmdbTitleSearchHint: titleFromQuery
                    });
                    if (payload?.seasons?.length && !cancelled) setSeriesEpisodes(payload);
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
            const mainTitle = data?.main_title ?? undefined;
            const torrentPayload = { ...best, mainTitle } as Torrent;
            const typeParam = new URLSearchParams(
              typeof window !== 'undefined' ? window.location.search : '',
            ).get('type');
            const bestTmdbType = String(
              best.tmdbType ?? (best as { tmdb_type?: string }).tmdb_type ?? '',
            ).toLowerCase();
            const isTvDetail =
              typeParam === 'tv' || bestTmdbType === 'tv' || bestTmdbType === 'series';

            if (isTvDetail) {
              try {
                const payload = await resolveSeriesEpisodesPayload(cancelled, {
                  contentId: best.id,
                  groupSlug: data?.slug,
                  tmdbId,
                  tmdbTitleSearchHint: data?.main_title || titleFromQuery
                });
                if (payload?.seasons?.length && !cancelled) {
                  setSeriesEpisodes(payload);
                } else {
                  setSeriesEpisodes(null);
                }
              } catch {
                setSeriesEpisodes(null);
              }
              const variants = (data?.variants ?? []) as any[];
              if (variants.length > 0) {
                setInitialVariants(
                  variants.map((v: any) => ({ ...convertVariantToTorrent(v), mainTitle })),
                );
              } else {
                setInitialVariants([torrentPayload]);
              }
            } else {
              setSeriesEpisodes(null);
            }

            setTorrent(torrentPayload);
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
                const payload = await resolveSeriesEpisodesPayload(cancelled, {
                  contentId: main.info_hash || main.slug || contentId,
                  tmdbId,
                  tmdbTitleSearchHint: main.name || titleFromQuery
                });
                if (payload?.seasons?.length && !cancelled) {
                  setSeriesEpisodes(payload);
                } else {
                  setSeriesEpisodes(null);
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
            const t0 = { ...best, mainTitle: byIdData?.main_title ?? undefined } as Torrent;
            let t =
              fromParam === 'downloads' ? await enrichFromLocalMediaByInfoHash(t0, contentId) : t0;
            const tid = t.tmdbId ?? null;
            const ttype = String(t.tmdbType ?? '').toLowerCase();
            const explicitTv =
              ttype === 'tv' ||
              ttype === 'series' ||
              String((t as any).category ?? '').toUpperCase() === 'SERIES';
            const inferTvFromDownloads =
              fromParam === 'downloads' &&
              torrentNameLooksLikeSeriesEpisode(t.name) &&
              ttype !== 'movie';
            const shouldLoadEpisodesByTmdb =
              tid != null && (explicitTv || inferTvFromDownloads);

            /** Rempli seulement si l’API a renvoyé au moins une saison avec épisodes. */
            let episodesPayloadOk: SeriesEpisodesResponse | null = null;

            if (shouldLoadEpisodesByTmdb) {
              try {
                const titleHint =
                  (typeof byIdData?.main_title === 'string' && byIdData.main_title.trim()) ||
                  (typeof t.cleanTitle === 'string' && t.cleanTitle.trim()) ||
                  (typeof (t as any).clean_title === 'string' && (t as any).clean_title.trim()) ||
                  null;
                const payload = await resolveSeriesEpisodesPayload(cancelled, {
                  contentId,
                  groupSlug: null,
                  tmdbId: tid,
                  tmdbTitleSearchHint: titleHint,
                });
                if (payload?.seasons?.length && !cancelled) {
                  setSeriesEpisodes(payload);
                  episodesPayloadOk = payload;
                  t = applySyntheticTmdbToTorrent(t, payload);
                } else if (!cancelled) {
                  setSeriesEpisodes(null);
                }
              } catch {
                if (!cancelled) setSeriesEpisodes(null);
              }
              try {
                const libraryResponse = await serverApi.getLibrary();
                if (libraryResponse.success && libraryResponse.data && !cancelled) {
                  const libraryItems = Array.isArray(libraryResponse.data) ? libraryResponse.data : [];
                  const seriesInLibrary = libraryItems.filter(
                    (item: any) =>
                      item.tmdb_id === tid &&
                      (item.tmdb_type === 'tv' ||
                        item.tmdb_type === 'series' ||
                        item.category === 'SERIES') &&
                      item.exists,
                  );
                  if (seriesInLibrary.length > 0) {
                    setInitialVariants(seriesInLibrary.map((i: any) => libraryItemToTorrent(i)));
                  }
                }
              } catch {
                /* ignore */
              }
            }

            // Si le 1er essai (tmdbId seul) échoue ou renvoie des saisons vides, on retente via le groupe
            // (slug texte + tmdb agrégé + recherche TMDB). Avant c’était un « else if » : jamais exécuté
            // quand shouldLoadEpisodesByTmdb était vrai — d’où l’absence de cartes depuis Téléchargements.
            if (
              !cancelled &&
              fromParam === 'downloads' &&
              torrentNameLooksLikeSeriesEpisode(t.name) &&
              !episodesPayloadOk?.seasons?.length
            ) {
              try {
                const grp = await serverApi.getTorrentGroup(contentId);
                const gd = grp?.data as any;
                if (grp.success && gd && !cancelled) {
                  const gb = pickBestTorrentFromGroupPayload(grp);
                  const mainTitle = gd?.main_title ?? undefined;
                  const tmdbG = extractTmdbTvIdFromGroupData(gd, gb);
                  if (typeof tmdbG === 'number' && (t.tmdbId == null || t.tmdbType == null)) {
                    t = {
                      ...t,
                      tmdbId: t.tmdbId ?? tmdbG,
                      tmdbType: (t.tmdbType as string | null | undefined) ?? 'tv',
                    } as Torrent;
                  }
                  const variants = (gd?.variants ?? []) as any[];
                  if (variants.length > 0) {
                    setInitialVariants(
                      variants.map((v: any) => ({ ...convertVariantToTorrent(v), mainTitle })),
                    );
                  } else if (gb) {
                    setInitialVariants([{ ...convertVariantToTorrent(gb), mainTitle }]);
                  }
                  const titleHint =
                    (typeof gd?.main_title === 'string' && gd.main_title.trim()) ||
                    (gb && String((gb as any).cleanTitle ?? (gb as any).clean_title ?? '').trim()) ||
                    null;
                  const payload = await resolveSeriesEpisodesPayload(cancelled, {
                    contentId,
                    groupSlug: extractTextSeriesSlugFromGroupData(gd),
                    tmdbId: tmdbG,
                    tmdbTitleSearchHint: titleHint,
                  });
                  if (payload?.seasons?.length && !cancelled) {
                    setSeriesEpisodes(payload);
                    t = applySyntheticTmdbToTorrent(t, payload);
                  }
                }
              } catch {
                /* ignore */
              }
            }
            if (!cancelled) setTorrent(t);
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
            const t0 = { ...best, mainTitle } as Torrent;
            const infoHashForEnrich = (getStreamInfoHashFromLocation() || t0.infoHash || contentId || '').toString();
            let t = fromParam === 'downloads' ? await enrichFromLocalMediaByInfoHash(t0, infoHashForEnrich) : t0;
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
            // Épisodes par saison (slug texte ou tmdb — pas un info_hash seul pour l’API /series/.../episodes)
            const isSeriesGroup =
              best.tmdbType === 'tv' ||
              (best as any).tmdb_type === 'tv' ||
              (best as any).tmdb_type === 'series' ||
              torrentNameLooksLikeSeriesEpisode(best.name);
            if (isSeriesGroup) {
              try {
                const tmdbEp = extractTmdbTvIdFromGroupData(data, best);
                const slugEp = extractTextSeriesSlugFromGroupData(data);
                const titleHint =
                  (typeof data?.main_title === 'string' && data.main_title.trim()) ||
                  (typeof best.cleanTitle === 'string' && best.cleanTitle.trim()) ||
                  (typeof (best as any).clean_title === 'string' && (best as any).clean_title.trim()) ||
                  null;
                const payload = await resolveSeriesEpisodesPayload(cancelled, {
                  contentId,
                  groupSlug: slugEp,
                  tmdbId: tmdbEp,
                  tmdbTitleSearchHint: titleHint,
                });
                if (payload?.seasons?.length && !cancelled) {
                  setSeriesEpisodes(payload);
                  t = applySyntheticTmdbToTorrent(t, payload);
                } else if (!cancelled) {
                  setSeriesEpisodes(null);
                }
              } catch (_e) {
                if (!cancelled) setSeriesEpisodes(null);
              }
            } else {
              setSeriesEpisodes(null);
            }
            if (!cancelled) setTorrent(t);
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
  // Depuis la page Téléchargements avec slug + infoHash : utiliser l'infoHash de l'URL pour le streaming
  // (le groupe chargé par slug peut avoir des variantes sans info_hash en DB).
  const urlInfoHash = getStreamInfoHashFromLocation();
  // Si l’URL fixe un infoHash explicite (téléchargements, dashboard, …), c’est le fichier à lire même si le groupe expose une autre « meilleure » variante.
  const displayTorrent = urlInfoHash ? { ...torrent, infoHash: urlInfoHash } : torrent;
  // Récupérer les stats client (progression, partage) dès qu'on a un info_hash, pour afficher
  // le statut de téléchargement et "en partage" que l'on ouvre la page depuis Téléchargements
  // (infoHash dans l'URL) ou depuis la Bibliothèque (slug dans l'URL, mais torrent.infoHash connu).
  const initialTorrentStats: ClientTorrentStats | null = displayTorrent.infoHash
    ? (getDownloadClientStats(displayTorrent.infoHash) as ClientTorrentStats | null)
    : null;

  // Enrichir les épisodes avec les variantes trouvées en recherche (id/info_hash/disponibilité)
  const enrichedSeriesEpisodes = useMemo(() => {
    if (!seriesEpisodes || !initialVariants?.length) return seriesEpisodes;

    const newSeasons = seriesEpisodes.seasons.map((season) => {
      const seasonNum = season.season;
      const newEpisodes = season.episodes.map((ep) => {
        // Ne pas écraser si l'épisode a déjà un info_hash valide (venant du backend)
        if (ep.info_hash && ep.info_hash.length >= 32) return ep;

        const epNum = ep.episode;
        
        // Trouver le meilleur variant pour cet épisode
        // Priorité 1: Match exact SxxEyy
        // Priorité 2: Season Pack (Sxx sans Eyy spécifique ou mention "Complete")
        let bestVariant: Torrent | null = null;
        
        for (const variant of initialVariants) {
          const name = (variant.name || variant.cleanTitle || '').toUpperCase();
          
          // Match SxxEyy
          const epRegex = new RegExp(`S${seasonNum.toString().padStart(2, '0')}[\\s._-]?E${epNum.toString().padStart(2, '0')}\\b`, 'i');
          if (epRegex.test(name)) {
            if (!bestVariant || (variant.seedCount || 0) > (bestVariant.seedCount || 0)) {
              bestVariant = variant;
            }
          }
          
          // Match Season Pack (si pas encore de variant précis trouvé)
          if (!bestVariant) {
            const seasonRegex = new RegExp(`S${seasonNum.toString().padStart(2, '0')}\\b`, 'i');
            const isPack = seasonRegex.test(name) && 
              (name.includes('COMPLETE') || name.includes('INTEGRALE') || !/\bE\d{1,2}\b/i.test(name));
            
            if (isPack) {
              if (!bestVariant || (variant.seedCount || 0) > (bestVariant.seedCount || 0)) {
                bestVariant = variant;
              }
            }
          }
        }

        if (bestVariant) {
          return {
            ...ep,
            info_hash: bestVariant.infoHash,
            id: bestVariant.id, // Permet de sélectionner cette variante lors du clic
            isAvailable: true,
          };
        }

        return ep;
      });

      return { ...season, episodes: newEpisodes };
    });

    return { ...seriesEpisodes, seasons: newSeasons };
  }, [seriesEpisodes, initialVariants]);

  const backHref = getBackHrefFromLocation();
  const streamBackendUrl = getStreamBackendUrlFromLocation();
  return (
    <MediaDetailPage
      torrent={displayTorrent}
      initialVariants={initialVariants.length > 0 ? initialVariants : undefined}
      seriesEpisodes={enrichedSeriesEpisodes ?? undefined}
      initialTorrentStats={
        initialTorrentStats ? normalizeTorrentStats(initialTorrentStats as ClientTorrentStats) : undefined
      }
      backHref={backHref ?? undefined}
      streamBackendUrl={streamBackendUrl ?? undefined}
    />
  );
}

