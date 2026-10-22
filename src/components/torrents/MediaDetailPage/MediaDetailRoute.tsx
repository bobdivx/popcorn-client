import { useEffect, useMemo, useState } from 'preact/hooks';
import type { ClientTorrentStats } from '../../../lib/client/types';
import { getDownloadClientStats } from '../../../lib/utils/download-meta-storage';
import { normalizeTorrentStats } from '../../../lib/utils/torrentStatsUtils';
import MediaDetailPage from './index';
import type { MediaDetailPageProps } from './types';
import { clientApi } from '../../../lib/client/api';
import { serverApi } from '../../../lib/client/server-api';
import type {
  SeriesEpisodesResponse,
  SeriesEpisodeInfo,
  SeriesSeasonInfo,
} from '../../../lib/client/server-api/media';
import {
  episodeReleaseMatchesTmdbEpisode,
  episodeReleaseMatchesVariantName,
} from '../../../lib/utils/episodeReleaseMatch';
import {
  inferCourStartsFromAirDates,
  inferCourStartsFromSceneVariants,
  isContinuousTmdbSeasonLayout,
  scenePackMatchesTmdbEpisode,
  splitContinuousSeasonsIntoSceneCours,
} from '../../../lib/utils/tmdbSceneSeasonMap';
import { getLibraryDisplayConfig } from '../../../lib/utils/library-display-config';
import { candidatesExcluding3DUnlessAllowed } from '../../../lib/torrents/is3dTorrent';
import {
  absoluteEpisodeNumber,
  compareSeasonNumbers,
  seasonEpisodeCountsFromSeasons,
} from '../../../lib/utils/seasonOrder';
import { DsLoader } from '../../ui/DsLoader';
import { IS_STORE_BUILD } from '../../../lib/distribution';

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
  ].sort(compareSeasonNumbers);

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
      const e = ep as { episode_number?: number; name?: string; air_date?: string | null };
      if (typeof e.episode_number !== 'number') continue;
      if (e.episode_number < 0) continue;
      if (seasonNum > 0 && e.episode_number === 0) continue;
      const epNum = e.episode_number;
      const epName = (typeof e.name === 'string' && e.name.trim()) || `Épisode ${epNum}`;
      const airDate =
        typeof e.air_date === 'string' && e.air_date.trim() ? e.air_date.trim() : null;
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
        air_date: airDate,
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

/**
 * Le backend `by-tmdb/.../episodes` renvoie d’abord les variantes **indexées** en base ; la bibliothèque
 * locale n’est qu’un dernier recours côté serveur. On construit la grille TMDB complète puis on y colle
 * les `info_hash` / stats renvoyés par ce premier appel (et le détail local quand présent).
 */
function mergeLibraryEpisodesIntoTmdbPayload(
  tmdbFull: SeriesEpisodesResponse,
  library: SeriesEpisodesResponse | null,
): SeriesEpisodesResponse {
  if (!library?.seasons?.length) return tmdbFull;

  const byKey = new Map<string, SeriesEpisodeInfo>();
  for (const season of library.seasons) {
    for (const ep of season.episodes ?? []) {
      byKey.set(`${ep.season}:${ep.episode}`, ep);
    }
  }

  // Source fiable = grille TMDB (ex. S1 a N eps). Un fichier tagué S01E{N+1}
  // peut alors coller sur S2E01 — uniquement en fallback si le couple exact manque.
  const seasonCounts = seasonEpisodeCountsFromSeasons(tmdbFull.seasons);

  const lookupLibrary = (season: number, episode: number): SeriesEpisodeInfo | undefined => {
    const direct = byKey.get(`${season}:${episode}`);
    if (direct) return direct;
    if (season > 1 && episode > 0) {
      const abs = absoluteEpisodeNumber(season, episode, seasonCounts);
      if (abs === episode) return undefined;
      return byKey.get(`1:${abs}`);
    }
    return undefined;
  };

  const seasons = tmdbFull.seasons.map((season: SeriesSeasonInfo) => ({
    ...season,
    episodes: (season.episodes ?? []).map((ep) => {
      const lib = lookupLibrary(ep.season, ep.episode);
      if (!lib) return ep;
      const hasLocal =
        (lib.info_hash && lib.info_hash.length >= 32) ||
        (typeof lib.id === 'string' &&
          lib.id.length > 0 &&
          !lib.id.startsWith('popcorn_tmdb_'));
      if (!hasLocal) return ep;
      return {
        ...ep,
        name: ep.name || lib.name,
        id:
          typeof lib.id === 'string' && lib.id.length > 0 && !lib.id.startsWith('popcorn_tmdb_')
            ? lib.id
            : ep.id,
        info_hash: lib.info_hash ?? ep.info_hash,
        file_size: lib.file_size > 0 ? lib.file_size : ep.file_size,
        // Ne pas écraser les stats indexeur par des 0 bibliothèque
        seed_count: lib.seed_count > 0 ? lib.seed_count : ep.seed_count,
        leech_count: lib.leech_count > 0 ? lib.leech_count : ep.leech_count,
        file_path: lib.file_path ?? ep.file_path,
        is_from_multi_torrent: lib.is_from_multi_torrent || ep.is_from_multi_torrent,
      };
    }),
  }));

  return {
    ...tmdbFull,
    main_title: tmdbFull.main_title?.trim() ? tmdbFull.main_title : library.main_title,
    seasons,
  };
}

/** Variante indexeur utilisable sans hash 40c (magnet / lien seulement en base). */
function indexerEpisodeHasTorrentSource(ep: SeriesEpisodeInfo): boolean {
  const h = ep.info_hash && String(ep.info_hash).length >= 32;
  const vid =
    typeof ep.id === 'string' &&
    ep.id.trim().length > 0 &&
    !ep.id.startsWith('popcorn_tmdb_');
  return Boolean(h || vid);
}

/** Fusionne les épisodes issus de GET /series/{slug}/episodes (variantes + table série en DB) dans la grille TMDB. */
function mergeIndexerSlugEpisodesIntoTmdbPayload(
  base: SeriesEpisodesResponse,
  indexer: SeriesEpisodesResponse,
): SeriesEpisodesResponse {
  const byKey = new Map<string, SeriesEpisodeInfo>();
  for (const season of indexer.seasons ?? []) {
    for (const ep of season.episodes ?? []) {
      byKey.set(`${ep.season}:${ep.episode}`, ep);
    }
  }

  const seasons = base.seasons.map((season: SeriesSeasonInfo) => ({
    ...season,
    episodes: (season.episodes ?? []).map((ep) => {
      const idx = byKey.get(`${ep.season}:${ep.episode}`);
      if (!idx || !indexerEpisodeHasTorrentSource(idx)) return ep;
      const hasCur = indexerEpisodeHasTorrentSource(ep);
      if (hasCur) return ep;
      return {
        ...ep,
        name: ep.name?.trim() ? ep.name : idx.name,
        id: idx.id || ep.id,
        info_hash:
          idx.info_hash && String(idx.info_hash).length >= 32 ? idx.info_hash : ep.info_hash ?? null,
        file_size: idx.file_size > 0 ? idx.file_size : ep.file_size,
        seed_count: idx.seed_count,
        leech_count: idx.leech_count,
        is_from_multi_torrent: idx.is_from_multi_torrent || ep.is_from_multi_torrent,
      };
    }),
  }));

  return { ...base, seasons };
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

/** Rafraîchit les épisodes depuis les indexeurs puis met à jour variantes + grille épisodes. */
async function runBackgroundSeriesIndexerRefresh(args: {
  cancelled: boolean;
  tmdbId: number;
  titleHint?: string | null;
  mediaType?: string | null;
  contentId: string;
  groupSlug?: string | null;
  libraryVariants?: Torrent[];
  onVariants: (variants: Torrent[]) => void;
  onSeriesEpisodes?: (payload: SeriesEpisodesResponse) => void;
}): Promise<void> {
  const indexerLang =
    typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('fr')
      ? 'fr-FR'
      : 'en-US';
  const qRaw = (args.titleHint ?? '').trim();
  await serverApi.refreshSeriesEpisodesFromIndexers(args.tmdbId, {
    lang: indexerLang,
    q: qRaw.length >= 2 ? qRaw : undefined,
  });
  if (args.cancelled) return;
  const groupAgain = await serverApi.getTorrentGroupByTmdbId(
    args.tmdbId,
    args.titleHint ?? undefined,
    (args.mediaType as 'movie' | 'tv' | undefined) ?? undefined,
  );
  if (!groupAgain.success || !groupAgain.data || args.cancelled) return;
  const gd = groupAgain.data as { variants?: unknown[]; main_title?: string; slug?: string };
  const mt = gd?.main_title ?? undefined;
  const rv = Array.isArray(gd?.variants) ? gd.variants : [];
  if (rv.length > 0) {
    const incoming = rv.map((v: unknown) => ({
      ...convertVariantToTorrent(v),
      mainTitle: mt,
    })) as Torrent[];
    const base =
      args.libraryVariants && args.libraryVariants.length > 0
        ? args.libraryVariants
        : incoming;
    args.onVariants(mergeTorrentVariantsByInfoHash(base, incoming));
  }
  const payload = await resolveSeriesEpisodesPayload(args.cancelled, {
    contentId: args.contentId,
    groupSlug: args.groupSlug ?? gd?.slug ?? null,
    tmdbId: args.tmdbId,
    tmdbTitleSearchHint: args.titleHint ?? mt,
  });
  if (payload?.seasons?.length && !args.cancelled) {
    args.onSeriesEpisodes?.(payload);
  }
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

  const hint = (tmdbTitleSearchHint ?? '').trim();

  if (typeof tmdbId === 'number' && !Number.isNaN(tmdbId)) {
    const r = await serverApi.getSeriesEpisodesByTmdbId(tmdbId, {
      title: hint.length >= 2 ? hint : undefined,
      mediaType: 'tv',
    });
    if (cancelled) return null;
    const libraryOnly = r.success && r.data?.seasons?.length ? r.data : null;
    const tmdbFull = await buildSeriesEpisodesFromTmdbDiscover(cancelled, tmdbId, slugOk || contentId);
    if (cancelled) return null;
    if (tmdbFull?.seasons?.length) {
      let merged = mergeLibraryEpisodesIntoTmdbPayload(tmdbFull, libraryOnly);
      if (slugOk) {
        const idxRes = await serverApi.getSeriesEpisodes(slugOk);
        if (!cancelled && idxRes.success && idxRes.data?.seasons?.length) {
          merged = mergeIndexerSlugEpisodesIntoTmdbPayload(merged, idxRes.data);
        }
      }
      return merged;
    }
    if (libraryOnly) return libraryOnly;
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
        const r2 = await serverApi.getSeriesEpisodesByTmdbId(sid, {
          title: hint.length >= 2 ? hint : undefined,
          mediaType: 'tv',
        });
        if (cancelled) return null;
        const libraryOnly2 = r2.success && r2.data?.seasons?.length ? r2.data : null;
        const synth2 = await buildSeriesEpisodesFromTmdbDiscover(cancelled, sid, slugOk || contentId);
        if (cancelled) return null;
        if (synth2?.seasons?.length) {
          return mergeLibraryEpisodesIntoTmdbPayload(synth2, libraryOnly2);
        }
        if (libraryOnly2) return libraryOnly2;
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

function getMediaTypeFromLocation(): 'movie' | 'tv' | null {
  if (typeof window === 'undefined') return null;
  const t = new URLSearchParams(window.location.search).get('type');
  return t === 'movie' || t === 'tv' ? t : null;
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
    films: '/films',
    series: '/series',
    demandes: '/demandes',
    discover: '/discover',
    downloads: '/downloads',
    search: '/search',
    torrents: '/torrents',
    plateformes: '/plateformes/',
  };
  if (from === 'plateformes') {
    // Retour vers la page de la plateforme d'origine (fallback si pas d'historique).
    const p = new URLSearchParams(window.location.search).get('fromP');
    if (p && /^[a-z0-9-]{1,40}$/.test(p)) return `/plateformes/?p=${p}`;
  }
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

/** Entrée bibliothèque (GET /library) rattachée à une série TV. */
function isLibrarySeriesItem(item: any): boolean {
  const typ = String(item?.tmdb_type ?? item?.tmdbType ?? '').toLowerCase();
  const cat = String(item?.category ?? '').toUpperCase();
  return typ === 'tv' || typ === 'series' || cat === 'SERIES';
}

/** Saison / épisode depuis le nom de fichier d'une entrée bibliothèque (S01E02, 1x02…). */
function parseSeasonEpisodeFromLibraryItem(item: any): { season: number; episode: number } | null {
  const rawPath = String(item?.download_path ?? item?.downloadPath ?? '').replace(/\\/g, '/');
  const base = rawPath.split('/').filter(Boolean).pop() ?? '';
  const candidates = [base, String(item?.file_name ?? ''), String(item?.name ?? ''), rawPath];
  for (const text of candidates) {
    if (!text) continue;
    const m =
      text.match(/s(\d{1,2})[\s._-]*e(\d{1,3})/i) ||
      text.match(/(?:^|[^a-z0-9])(\d{1,2})x(\d{2,3})(?:[^0-9]|$)/i);
    if (m) {
      const season = parseInt(m[1], 10);
      const episode = parseInt(m[2], 10);
      if (!Number.isNaN(season) && !Number.isNaN(episode)) return { season, episode };
    }
  }
  return null;
}

/**
 * Construit une grille saisons/épisodes uniquement depuis la bibliothèque locale (GET /library).
 * Utilisé quand les endpoints `/api/torrents/series/...` ne sont pas disponibles (build store)
 * ou en complément de la grille TMDB pour que chaque carte pointe vers le bon fichier local.
 */
function buildSeriesEpisodesFromLibraryItems(
  items: any[],
  tmdbTvId: number | null,
  mainTitle: string,
): SeriesEpisodesResponse | null {
  const byKey = new Map<string, { item: any; season: number; episode: number }>();
  for (const item of items) {
    const se = parseSeasonEpisodeFromLibraryItem(item);
    if (!se || se.episode <= 0) continue;
    const key = `${se.season}:${se.episode}`;
    const prev = byKey.get(key);
    // Préférer une entrée fichier (pas un dossier) quand plusieurs entrées visent le même épisode.
    if (
      !prev ||
      (!pathLooksLikeFile(prev.item?.download_path) && pathLooksLikeFile(item?.download_path))
    ) {
      byKey.set(key, { item, season: se.season, episode: se.episode });
    }
  }
  if (!byKey.size) return null;
  const seasonsMap = new Map<number, SeriesEpisodeInfo[]>();
  byKey.forEach(({ item, season, episode }) => {
    const variant = libraryItemToTorrent(item);
    const list = seasonsMap.get(season) ?? [];
    list.push({
      season,
      episode,
      name: `Épisode ${episode}`,
      id: variant.id || `library_s${season}_e${episode}`,
      info_hash: item?.info_hash || null,
      quality: item?.quality ?? null,
      language: item?.language ?? null,
      format: item?.source_format ?? null,
      codec: item?.video_codec ?? null,
      file_size: Number(item?.file_size) || 0,
      seed_count: 0,
      leech_count: 0,
      file_path: item?.download_path || null,
      is_from_multi_torrent: false,
    });
    seasonsMap.set(season, list);
  });
  const seasons: SeriesSeasonInfo[] = [...seasonsMap.keys()]
    .sort(compareSeasonNumbers)
    .map((season) => ({
      season,
      episodes: (seasonsMap.get(season) ?? []).sort((a, b) => a.episode - b.episode),
    }));
  return {
    slug: tmdbTvId ? `tmdb_${tmdbTvId}` : 'library',
    main_title: mainTitle || 'Série',
    seasons,
  };
}

/** Choisit l'épisode « de départ » d'une série en bibliothèque : le plus petit SxxEyy (fichier de préférence). */
function pickFirstLibraryEpisodeItem(items: any[]): any | undefined {
  let best: { item: any; season: number; episode: number; isFile: boolean } | undefined;
  for (const item of items) {
    const se = parseSeasonEpisodeFromLibraryItem(item);
    if (!se) continue;
    // Les spéciaux (S00) passent après les saisons régulières.
    const season = se.season === 0 ? Number.MAX_SAFE_INTEGER : se.season;
    const isFile = pathLooksLikeFile(item?.download_path);
    if (
      !best ||
      season < best.season ||
      (season === best.season && se.episode < best.episode) ||
      (season === best.season && se.episode === best.episode && isFile && !best.isFile)
    ) {
      best = { item, season, episode: se.episode, isFile };
    }
  }
  return best?.item;
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

  // Stubs bibliothèque (local_*) : le groupe by-tmdb peut renvoyer info_hash null.
  // Sans fallback sur l'id, hasInfoHash reste faux et la lecture est bloquée.
  const rawInfoHash = variant.info_hash || variant.infoHash || null;
  const localId =
    typeof variant.id === 'string' && variant.id.startsWith('local_') ? variant.id : null;
  const infoHash = rawInfoHash || localId || null;
  const tmdbTitleRaw = (variant as any).tmdb_title ?? (variant as any).tmdbTitle;
  const tmdbTitle =
    typeof tmdbTitleRaw === 'string' && tmdbTitleRaw.trim().length > 0 ? tmdbTitleRaw.trim() : null;
  const downloadPathRaw =
    variant.download_path ||
    variant.downloadPath ||
    variant.file_path ||
    variant.filePath ||
    null;
  return {
    id: variant.id || '',
    slug: variant.slug || variant.id || null,
    infoHash: infoHash,
    downloadPath: typeof downloadPathRaw === 'string' && downloadPathRaw.trim() ? downloadPathRaw : null,
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
    tmdbMatchSource: (variant as any).tmdb_match_source ?? (variant as any).tmdbMatchSource ?? null,
    tmdbMatchConfidence: (variant as any).tmdb_match_confidence ?? (variant as any).tmdbMatchConfidence ?? null,
  } as unknown as Torrent;
}

/** Score bas = préféré pour l’ancre page (S01 / E01 avant S03E02 par seeders). */
function seriesAnchorRank(name: string): number {
  const upper = (name || '').toUpperCase();
  const se = upper.match(/\bS\.?(\d{1,2})[\s._-]*E\.?(\d{1,3})\b/);
  if (se) {
    const s = parseInt(se[1], 10);
    const e = parseInt(se[2], 10);
    return s * 1000 + e;
  }
  const pack = upper.match(/\bS\.?(\d{1,2})\b/);
  if (pack) return parseInt(pack[1], 10) * 1000;
  return 50_000;
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
    const allow3d = getLibraryDisplayConfig().allow3dTorrents === true;
    const pool = candidatesExcluding3DUnlessAllowed(torrents, allow3d);
    // Si aucun 2D : ne pas forcer un 3D comme « meilleur » (évite FSBS en lecture classique).
    const selectable = pool.length > 0 ? pool : allow3d ? torrents : [];
    if (selectable.length === 0) return null;

    const looksLikeTvGroup = selectable.some((t: any) => {
      const typ = String(t.tmdb_type ?? t.tmdbType ?? '').toLowerCase();
      return typ === 'tv' || typ === 'series' || /\bS\.?\d{1,2}/i.test(String(t.name || ''));
    });

    let best: any;
    if (titleHint && titleHint.trim().length > 0) {
      const matching = selectable.filter((t: any) => variantMatchesTitle(t, titleHint));
      if (matching.length > 0) {
        best = matching
          .slice()
          .sort((a: any, b: any) => {
            if (looksLikeTvGroup) {
              const ra = seriesAnchorRank(String(a.name || ''));
              const rb = seriesAnchorRank(String(b.name || ''));
              if (ra !== rb) return ra - rb;
            }
            return normalizeSeedCount(b) - normalizeSeedCount(a);
          })[0];
      }
    }
    if (!best) {
      best = selectable
        .slice()
        .sort((a: any, b: any) => {
          if (looksLikeTvGroup) {
            const ra = seriesAnchorRank(String(a.name || ''));
            const rb = seriesAnchorRank(String(b.name || ''));
            if (ra !== rb) return ra - rb;
          }
          return normalizeSeedCount(b) - normalizeSeedCount(a);
        })[0];
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
    tmdbMatchSource: localMedia.tmdb_match_source ?? null,
    tmdbMatchConfidence: localMedia.tmdb_match_confidence ?? null,
    downloadPath: localMedia.download_path ?? null,
  } as unknown as Torrent;
}

/**
 * Rattache un info_hash client et/ou un chemin fichier quand la fiche TMDB ne renvoie
 * que des stubs local_* (info_hash null) — cas typique depuis /downloads.
 */
async function enrichTorrentForPlayback(
  t: Torrent,
  opts: {
    urlInfoHash?: string | null;
    fromParam?: string | null;
    tmdbId?: number | null;
    titleHint?: string | null;
    mediaType?: string | null;
  },
): Promise<Torrent> {
  let result: Torrent = { ...t };
  const urlHash = (opts.urlInfoHash || '').trim();
  if (
    urlHash &&
    (urlHash.startsWith('local_') ||
      ((urlHash.length === 40 || urlHash.length === 32) && /^[a-fA-F0-9]+$/.test(urlHash)))
  ) {
    result = { ...result, infoHash: urlHash };
  }

  const currentHash = (result.infoHash || '').trim();
  const hasRealHash =
    (currentHash.length === 40 || currentHash.length === 32) && /^[a-fA-F0-9]+$/.test(currentHash);
  const needsClientMatch =
    opts.fromParam === 'downloads' || !hasRealHash || !(result as { downloadPath?: string }).downloadPath;

  if (needsClientMatch) {
    try {
      const list = await clientApi.listTorrents();
      // Priorité : match TMDB (fiable après reboot / depuis dashboard).
      const tmdbTarget = opts.tmdbId != null ? Number(opts.tmdbId) : null;
      const byTmdb =
        tmdbTarget != null && Number.isFinite(tmdbTarget)
          ? list.find((item) => {
              const id = Number((item as { tmdb_id?: number; tmdbId?: number }).tmdb_id ?? (item as { tmdbId?: number }).tmdbId);
              return Number.isFinite(id) && id === tmdbTarget;
            })
          : undefined;

      if (byTmdb?.info_hash) {
        result = {
          ...result,
          infoHash: byTmdb.info_hash,
          name: result.name || byTmdb.name,
          clientState: byTmdb.state,
          clientProgress: typeof byTmdb.progress === 'number' ? byTmdb.progress : undefined,
        } as Torrent;
      } else if (hasRealHash) {
        const byHash = list.find(
          (item) => (item.info_hash || '').toLowerCase() === currentHash.toLowerCase(),
        );
        if (byHash?.info_hash) {
          result = {
            ...result,
            infoHash: byHash.info_hash,
            name: result.name || byHash.name,
            clientState: byHash.state,
            clientProgress: typeof byHash.progress === 'number' ? byHash.progress : undefined,
          } as Torrent;
        }
      } else {
        const hintNorm = normalizeTitleForMatch(opts.titleHint || result.name || '');
        const nameNorm = normalizeTitleForMatch(result.name || '');
        const scoreName = (candidate: string): number => {
          const n = normalizeTitleForMatch(candidate);
          if (!n) return 0;
          if (nameNorm && (n === nameNorm || n.includes(nameNorm) || nameNorm.includes(n))) return 100;
          const hintFirst = hintNorm.split(/[.\s\-_]+/).filter((w) => w.length >= 3);
          const nameFirst = nameNorm.split(/[.\s\-_]+/).filter((w) => w.length >= 3);
          const tokens = [...new Set([...hintFirst, ...nameFirst])];
          if (!tokens.length) return 0;
          let matched = 0;
          for (const tok of tokens) {
            if (n.includes(tok)) matched += 1;
          }
          return matched / tokens.length;
        };
        const ranked = list
          .map((item) => ({ item, s: scoreName(item.name || '') }))
          .filter((x) => x.s >= 0.55)
          .sort((a, b) => b.s - a.s);
        const bestClient = ranked[0]?.item;
        if (bestClient?.info_hash) {
          result = {
            ...result,
            infoHash: bestClient.info_hash,
            name: result.name || bestClient.name,
            clientState: bestClient.state,
            clientProgress: typeof bestClient.progress === 'number' ? bestClient.progress : undefined,
          } as Torrent;
        }
      }
    } catch {
      /* ignore */
    }
  }

  // Stub local_* sans hash réel : garder l'id comme infoHash pour useVideoFiles.
  if (
    !result.infoHash &&
    typeof result.id === 'string' &&
    result.id.startsWith('local_')
  ) {
    result = { ...result, infoHash: result.id };
  }

  if (!(result as { downloadPath?: string }).downloadPath && opts.tmdbId) {
    try {
      const localMedias = await clientApi.findLocalMediaByTmdb(
        opts.tmdbId,
        opts.mediaType || (result.tmdbType as string | undefined) || undefined,
      );
      if (Array.isArray(localMedias) && localMedias.length > 0) {
        const nameNorm = normalizeTitleForMatch(result.name || opts.titleHint || '');
        const seFromName =
          (result.name || opts.titleHint || '').match(/s([0-9]{1,2})[.\s-]*e([0-9]{1,3})/i) ||
          (result.name || opts.titleHint || '').match(/([0-9]{1,2})x([0-9]{1,3})/i);
        const scored = localMedias
          .map((m) => {
            const path = (m.file_path || '').trim();
            const n = normalizeTitleForMatch(m.file_name || '');
            const fileBlob = `${m.file_name || ''} ${path}`;
            let s = 0;
            if (pathLooksLikeFile(path)) s += 2;
            // Priorité absolue au matching SxxExx (évite de coller S03E03 sur une fiche S03E04).
            if (seFromName) {
              const season = parseInt(seFromName[1], 10);
              const episode = parseInt(seFromName[2], 10);
              if (
                new RegExp(`s0?${season}[.\\s-]*e0?${episode}\\b`, 'i').test(fileBlob) ||
                new RegExp(`${season}x0?${episode}\\b`, 'i').test(fileBlob)
              ) {
                s += 10;
              }
            }
            if (nameNorm && n) {
              const tokens = nameNorm.split(/[.\s\-_]+/).filter((t) => t.length > 3);
              const hits = tokens.filter((t) => n.includes(t)).length;
              if (hits >= 2) s += 3;
              else if (hits === 1) s += 1;
            }
            if (/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('/')) s += 1;
            // Préférer les chemins absolus Docker (/app/downloads/...) aux relatifs dupliqués.
            if (path.startsWith('/app/') || path.includes('/downloads/')) s += 1;
            return { m, path, s };
          })
          .filter((x) => x.path && pathLooksLikeFile(x.path))
          .sort((a, b) => b.s - a.s);
        const bestLocal = scored[0];
        if (bestLocal && bestLocal.s >= 2) {
          const realHash =
            bestLocal.m.info_hash && /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$/.test(String(bestLocal.m.info_hash))
              ? String(bestLocal.m.info_hash)
              : null;
          result = {
            ...result,
            downloadPath: bestLocal.path,
            infoHash:
              (result.infoHash &&
              /^[a-fA-F0-9]{32}$|^[a-fA-F0-9]{40}$/.test(String(result.infoHash))
                ? result.infoHash
                : null) ||
              realHash ||
              result.infoHash ||
              `local_${bestLocal.m.id}`,
          } as Torrent;
        }
      }
    } catch {
      /* ignore */
    }
  }

  return result;
}

/** Fusionne bibliothèque + variantes indexeurs (DB), dédoublonnage par info_hash / id. */
function mergeTorrentVariantsByInfoHash(primary: Torrent[], extra: Torrent[]): Torrent[] {
  const keyOf = (t: Torrent): string | null => {
    const h = String((t as { infoHash?: string; info_hash?: string }).infoHash ?? (t as { info_hash?: string }).info_hash ?? '')
      .toLowerCase()
      .trim();
    if (h.length >= 32) return `h:${h}`;
    const id = String(t.id ?? '').trim();
    if (id.length > 0) return `id:${id}`;
    return null;
  };
  const seen = new Set<string>();
  const out: Torrent[] = [];
  for (const t of [...primary, ...extra]) {
    const k = keyOf(t);
    if (k) {
      if (seen.has(k)) continue;
      seen.add(k);
    }
    out.push(t);
  }
  return out;
}

export default function MediaDetailRoute() {
  const contentId = useMemo(() => getContentIdFromLocation(), []);
  const tmdbId = useMemo(() => getTmdbIdFromLocation(), []);
  const titleFromQuery = useMemo(() => getTitleFromLocation(), []);
  const mediaTypeFromQuery = useMemo(() => getMediaTypeFromLocation(), []);
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
        // Version store (PUBLIC_DISTRIBUTION=play) : toute fiche vient de la bibliothèque du serveur.
        const isLocalMedia = contentId.startsWith('local_') || (IS_STORE_BUILD && !!(contentId || tmdbId));
        
        // Si c'est un média local, récupérer depuis la bibliothèque
        if (isLocalMedia) {
          console.log('[MediaDetailRoute] Détection d\'un média local, récupération depuis la bibliothèque:', contentId);
          const libraryResponse = await serverApi.getLibrary();
          if (libraryResponse.success && libraryResponse.data) {
            const libraryItems: any[] = Array.isArray(libraryResponse.data) ? libraryResponse.data : [];
            // Trouver le média correspondant au slug
            const exactLocalMedia = libraryItems.find((item: any) =>
              !!contentId && (item.info_hash === contentId || item.slug === contentId)
            );
            const sameTmdbItems =
              tmdbId != null
                ? libraryItems.filter((item: any) => Number(item.tmdb_id) === tmdbId)
                : [];
            const localMedia =
              exactLocalMedia ||
              (IS_STORE_BUILD && tmdbId != null
                ? (sameTmdbItems.some(isLibrarySeriesItem)
                    ? pickFirstLibraryEpisodeItem(sameTmdbItems.filter(isLibrarySeriesItem))
                    : undefined) ?? sameTmdbItems[0]
                : undefined);
            
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

              // Série : charger toutes les entrées bibliothèque de la même série + la grille
              // saisons/épisodes. Sans ça la fiche n'a ni carrousels d'épisodes ni épisode
              // suivant/précédent dans le lecteur (build store Android : PUBLIC_DISTRIBUTION=play).
              const localTmdbIdRaw = Number(localMedia.tmdb_id ?? tmdbId);
              const localTmdbId =
                Number.isFinite(localTmdbIdRaw) && localTmdbIdRaw > 0 ? Math.floor(localTmdbIdRaw) : null;
              const typeHint = new URLSearchParams(
                typeof window !== 'undefined' ? window.location.search : '',
              ).get('type');
              const looksLikeSeries =
                isLibrarySeriesItem(localMedia) ||
                typeHint === 'tv' ||
                torrentNameLooksLikeSeriesEpisode(String(localMedia.name ?? '')) ||
                torrentNameLooksLikeSeriesEpisode(String(localMedia.download_path ?? ''));
              if (looksLikeSeries) {
                try {
                  const seriesItems = (
                    localTmdbId != null
                      ? libraryItems.filter(
                          (item: any) =>
                            Number(item.tmdb_id) === localTmdbId &&
                            (isLibrarySeriesItem(item) || item === localMedia),
                        )
                      : [localMedia]
                  ).filter((item: any) => item === localMedia || item.exists !== false);
                  if (seriesItems.length > 0 && !cancelled) {
                    const variants = seriesItems.map((item: any) => libraryItemToTorrent(item));
                    // La variante courante garde l'objet construit ci-dessus (infoHash local_*, démo…).
                    setInitialVariants([
                      t,
                      ...variants.filter((v) => v.id !== t.id),
                    ]);
                  }
                  const showTitle = String(
                    localMedia.tmdb_title || titleFromQuery || localMedia.name || '',
                  ).trim();
                  const libraryPayload = buildSeriesEpisodesFromLibraryItems(
                    seriesItems,
                    localTmdbId,
                    showTitle,
                  );
                  let payload: SeriesEpisodesResponse | null = null;
                  if (localTmdbId != null) {
                    // Hors store : même pipeline que la fiche web (backend + TMDB).
                    // Store : les endpoints /api/torrents/series/* sont bloqués → grille TMDB (/api/discover).
                    const base = !IS_STORE_BUILD
                      ? await resolveSeriesEpisodesPayload(false, {
                          contentId,
                          tmdbId: localTmdbId,
                          tmdbTitleSearchHint: showTitle || null,
                          groupSlug: localMedia.slug || null,
                        })
                      : await buildSeriesEpisodesFromTmdbDiscover(
                          false,
                          localTmdbId,
                          localMedia.slug || `tmdb_${localTmdbId}`,
                        );
                    if (cancelled) return;
                    if (base?.seasons?.length) {
                      payload = mergeLibraryEpisodesIntoTmdbPayload(base, libraryPayload);
                    }
                  }
                  if (!payload && libraryPayload?.seasons?.length) payload = libraryPayload;
                  if (payload?.seasons?.length && !cancelled) setSeriesEpisodes(payload);
                } catch (seriesErr) {
                  console.warn('[MediaDetailRoute] Épisodes série (bibliothèque) indisponibles:', seriesErr);
                }
              }

              if (!cancelled) setLoading(false);
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
        const typeParam = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '').get('type') || 'movie';
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
                  const libraryVariants = seriesInLibrary.map((i: any) => libraryItemToTorrent(i));
                  let mergedVariants = libraryVariants;
                  let groupSlugForEpisodes: string | null = null;
                  try {
                    const groupResponse = await serverApi.getTorrentGroupByTmdbId(
                      tmdbId,
                      titleFromQuery ?? undefined,
                      mediaTypeFromQuery ?? undefined,
                    );
                    if (groupResponse.success && groupResponse.data && !cancelled) {
                      const data = groupResponse.data as {
                        slug?: string;
                        variants?: unknown[];
                        main_title?: string;
                      };
                      if (typeof data.slug === 'string' && data.slug.trim()) {
                        groupSlugForEpisodes = data.slug.trim();
                      }
                      const mainTitle = data?.main_title ?? undefined;
                      const rawVariants = Array.isArray(data?.variants) ? data.variants : [];
                      if (rawVariants.length > 0) {
                        const indexerTorrents = rawVariants.map((v: unknown) => ({
                          ...convertVariantToTorrent(v),
                          mainTitle,
                        })) as Torrent[];
                        mergedVariants = mergeTorrentVariantsByInfoHash(libraryVariants, indexerTorrents);
                      }
                    }
                  } catch {
                    /* ignore */
                  }

                  setTorrent(libraryItemToTorrent(toUse));
                  setInitialVariants(mergedVariants);

                  try {
                    const payload = await resolveSeriesEpisodesPayload(cancelled, {
                      contentId,
                      tmdbId,
                      tmdbTitleSearchHint: titleFromQuery,
                      groupSlug: groupSlugForEpisodes,
                    });
                    if (payload?.seasons?.length && !cancelled) setSeriesEpisodes(payload);
                  } catch {
                    setSeriesEpisodes(null);
                  }

                  // Évite un flood C411 (429) si les packs scène S02+ sont déjà en base.
                  const hasScenePacks = mergedVariants.some((v) =>
                    /\bS\.?0?[2-9]\b/i.test(v.name || v.cleanTitle || ''),
                  );
                  if (!hasScenePacks) {
                    void runBackgroundSeriesIndexerRefresh({
                      cancelled,
                      tmdbId,
                      titleHint: titleFromQuery ?? undefined,
                      mediaType: mediaTypeFromQuery ?? 'tv',
                      contentId,
                      groupSlug: groupSlugForEpisodes,
                      libraryVariants: mergedVariants,
                      onVariants: (variants) => setInitialVariants(variants),
                      onSeriesEpisodes: (payload) => setSeriesEpisodes(payload),
                    }).catch(() => {
                      /* ignore */
                    });
                  }

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

          const groupResponse = await serverApi.getTorrentGroupByTmdbId(
            tmdbId,
            titleFromQuery ?? undefined,
            mediaTypeFromQuery ?? undefined,
          );
          let best = groupResponse.success && groupResponse.data
            ? pickBestTorrentFromGroupPayload(groupResponse, titleFromQuery ?? undefined)
            : null;
          const data = groupResponse?.data as any;
          const emptyGroupTitle = data?.main_title || titleFromQuery || '';

          if (best && !cancelled) {
            const mainTitle = data?.main_title ?? undefined;
            const torrentPayload = await enrichTorrentForPlayback(
              { ...best, mainTitle } as Torrent,
              {
                urlInfoHash: streamInfoHash,
                fromParam,
                tmdbId,
                titleHint: titleFromQuery || mainTitle || best.name,
                mediaType: mediaTypeFromQuery || typeParam,
              },
            );
            if (cancelled) return;
            const typeParamInner = new URLSearchParams(
              typeof window !== 'undefined' ? window.location.search : '',
            ).get('type');
            const bestTmdbType = String(
              best.tmdbType ?? (best as { tmdb_type?: string }).tmdb_type ?? '',
            ).toLowerCase();
            const isTvDetail =
              typeParamInner === 'tv' || bestTmdbType === 'tv' || bestTmdbType === 'series';

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
              // Film : exposer la variante enrichie (hash client / chemin) pour la lecture
              setInitialVariants([torrentPayload]);
            }

            setTorrent(torrentPayload);
            if (isTvDetail) {
              const tvVariants = (data?.variants ?? []) as Array<{ name?: string; cleanTitle?: string }>;
              const hasScenePacks = tvVariants.some((v) =>
                /\bS\.?0?[2-9]\b/i.test(v.name || v.cleanTitle || ''),
              );
              if (!hasScenePacks) {
                void runBackgroundSeriesIndexerRefresh({
                  cancelled,
                  tmdbId,
                  titleHint: data?.main_title || titleFromQuery,
                  mediaType: 'tv',
                  contentId: best.id,
                  groupSlug: data?.slug,
                  onVariants: (variants) => setInitialVariants(variants),
                  onSeriesEpisodes: (payload) => setSeriesEpisodes(payload),
                }).catch(() => {
                  /* ignore */
                });
              }
            }
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
                let groupSlugLib: string | null = null;
                try {
                  const grpLib = await serverApi.getTorrentGroupByTmdbId(
                    tmdbId,
                    (main.name || titleFromQuery) ?? undefined,
                    'tv',
                  );
                  const gdl = grpLib?.data as { slug?: string } | undefined;
                  if (
                    grpLib.success &&
                    typeof gdl?.slug === 'string' &&
                    gdl.slug.trim().length > 0
                  ) {
                    groupSlugLib = gdl.slug.trim();
                  }
                } catch {
                  /* ignore */
                }
                const payload = await resolveSeriesEpisodesPayload(cancelled, {
                  contentId: main.info_hash || main.slug || contentId,
                  tmdbId,
                  tmdbTitleSearchHint: main.name || titleFromQuery,
                  groupSlug: groupSlugLib,
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
              const enrichedMain = await enrichTorrentForPlayback(libraryItemToTorrent(main), {
                urlInfoHash: streamInfoHash,
                fromParam,
                tmdbId,
                titleHint: titleFromQuery || main.name,
                mediaType: mediaTypeFromQuery || 'movie',
              });
              if (cancelled) return;
              setTorrent(enrichedMain);
              setInitialVariants(variants);
              setLoading(false);
              return;
            }
          }

          // Dernier recours downloads : rattacher le torrent client même sans groupe / bibliothèque
          if (!cancelled && (fromParam === 'downloads' || streamInfoHash)) {
            const stub = {
              id: streamInfoHash || `tmdb_${tmdbId}`,
              slug: null,
              infoHash: streamInfoHash || null,
              name: titleFromQuery || emptyGroupTitle || 'Film',
              cleanTitle: titleFromQuery || emptyGroupTitle || null,
              tmdbId,
              tmdbType: mediaTypeFromQuery || typeParam || 'movie',
            } as Torrent;
            const recovered = await enrichTorrentForPlayback(stub, {
              urlInfoHash: streamInfoHash,
              fromParam,
              tmdbId,
              titleHint: titleFromQuery || emptyGroupTitle,
              mediaType: mediaTypeFromQuery || typeParam || 'movie',
            });
            const recoveredHash = (recovered.infoHash || '').trim();
            const recoveredPath = (recovered as { downloadPath?: string }).downloadPath;
            if (
              recoveredHash &&
              (recoveredHash.length >= 32 || recoveredHash.startsWith('local_') || recoveredPath)
            ) {
              setTorrent(recovered);
              setInitialVariants([recovered]);
              setLoading(false);
              return;
            }
          }

          if (!cancelled) {
            // Si on a un tmdbId mais aucun torrent trouvé (variants vide ou absent), rediriger vers Discover
            const hasNoVariants = !data || !data.variants || (Array.isArray(data.variants) && data.variants.length === 0);
            if (hasNoVariants && tmdbId && typeof window !== 'undefined') {
              console.log('[MediaDetailRoute] Aucun torrent trouvé pour tmdbId, redirection vers Discover:', tmdbId);
              const titleQ =
                titleFromQuery && titleFromQuery.trim()
                  ? `&title=${encodeURIComponent(titleFromQuery.trim())}`
                  : emptyGroupTitle && emptyGroupTitle.trim()
                    ? `&title=${encodeURIComponent(emptyGroupTitle.trim())}`
                    : '';
              window.location.href = `/discover?tmdbId=${tmdbId}&type=${typeParam}&from=not_found${titleQ}`;
              return;
            }
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
            /** Même hors page Téléchargements : un nom du type S01E04 doit charger saisons/episodes pour les pastilles. */
            const inferTvFromEpisodeFilename =
              torrentNameLooksLikeSeriesEpisode(t.name) && ttype !== 'movie';
            const shouldLoadEpisodesByTmdb =
              tid != null && (explicitTv || inferTvFromDownloads || inferTvFromEpisodeFilename);

            /** Rempli seulement si l’API a renvoyé au moins une saison avec épisodes. */
            let episodesPayloadOk: SeriesEpisodesResponse | null = null;

            if (shouldLoadEpisodesByTmdb) {
              try {
                const titleHint =
                  (typeof byIdData?.main_title === 'string' && byIdData.main_title.trim()) ||
                  (typeof t.cleanTitle === 'string' && t.cleanTitle.trim()) ||
                  (typeof (t as any).clean_title === 'string' && (t as any).clean_title.trim()) ||
                  null;
                let groupSlugForIndexerMerge: string | null = null;
                try {
                  const grpTmdb = await serverApi.getTorrentGroupByTmdbId(
                    tid,
                    titleHint ?? undefined,
                    'tv',
                  );
                  const gdt = grpTmdb?.data as { slug?: string } | undefined;
                  if (
                    grpTmdb.success &&
                    typeof gdt?.slug === 'string' &&
                    gdt.slug.trim().length > 0
                  ) {
                    groupSlugForIndexerMerge = gdt.slug.trim();
                  }
                } catch {
                  /* ignore */
                }
                const payload = await resolveSeriesEpisodesPayload(cancelled, {
                  contentId,
                  groupSlug: groupSlugForIndexerMerge,
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
                let enrichmentVariants: Torrent[] | undefined;

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
                    enrichmentVariants = seriesInLibrary.map((i: any) => libraryItemToTorrent(i));
                  }
                }

                const mainTitleById =
                  typeof byIdData?.main_title === 'string' && byIdData.main_title.trim()
                    ? byIdData.main_title.trim()
                    : undefined;

                if (!enrichmentVariants?.length) {
                  const raw = Array.isArray(byIdData?.variants) ? byIdData.variants : [];
                  if (raw.length > 0) {
                    enrichmentVariants = raw.map((v: any) => ({
                      ...convertVariantToTorrent(v),
                      mainTitle: mainTitleById,
                    }));
                  } else if (best) {
                    enrichmentVariants = [{ ...best, mainTitle: mainTitleById }];
                  }
                }

                if (enrichmentVariants?.length && !cancelled) {
                  setInitialVariants(enrichmentVariants);
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
  }, [contentId, tmdbId, titleFromQuery, mediaTypeFromQuery, retryKey]);

  // Quand le backend redevient disponible, relancer le chargement pour mettre à jour la page
  useEffect(() => {
    const onReconnected = () => setRetryKey((k) => k + 1);
    window.addEventListener('backendReconnected', onReconnected);
    return () => window.removeEventListener('backendReconnected', onReconnected);
  }, []);

  // Depuis la page Téléchargements avec slug + infoHash : utiliser l'infoHash de l'URL pour le streaming
  // (le groupe chargé par slug peut avoir des variantes sans info_hash en DB).
  const urlInfoHash = useMemo(() => getStreamInfoHashFromLocation(), []);

  // Hooks avant tout early return (Rules of Hooks) — sinon crash TDZ au premier rendu post-chargement.
  const enrichedSeriesEpisodes = useMemo(() => {
    if (!seriesEpisodes || !initialVariants?.length) return seriesEpisodes;

    const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const fromLibrary = params?.get('from') === 'library';
    const titleHint = params?.get('title')?.trim() || null;
    const anchorHash =
      torrent?.infoHash != null ? String(torrent.infoHash).toLowerCase().trim() : '';

    /** Même seed count : sans ce score, le 1er variant listé gagne — cas bibliothèque (tous à 0) mélange les séries. */
    const rankVariant = (v: Torrent): number => {
      const vh = (v.infoHash || (v as { info_hash?: string }).info_hash || '').toString().toLowerCase();
      let s = (v.seedCount || 0) * 1e6;
      if (anchorHash.length >= 32 && vh === anchorHash) s += 1e12;
      if (fromLibrary && titleHint && variantMatchesTitle(v, titleHint)) s += 1e9;
      return s;
    };

    const pickBest = (candidates: Torrent[]): Torrent | null => {
      if (!candidates.length) return null;
      return candidates.slice().sort((a, b) => rankVariant(b) - rankVariant(a))[0] ?? null;
    };

    const seasonNums = seriesEpisodes.seasons.map((s) => s.season);
    const continuous = isContinuousTmdbSeasonLayout(seasonNums);
    const s1 = seriesEpisodes.seasons.find((s) => s.season === 1);
    const variantNames = initialVariants.map((v) => v.name || v.cleanTitle || '');
    let courStarts =
      continuous && s1
        ? inferCourStartsFromAirDates(
            (s1.episodes ?? []).map((e) => ({ episode: e.episode, airDate: e.air_date })),
          )
        : null;
    if (continuous && (!courStarts || courStarts.length <= 1)) {
      courStarts =
        inferCourStartsFromSceneVariants(s1?.episodes?.length ?? 0, variantNames) ?? courStarts;
    }
    const seasonCounts = seasonEpisodeCountsFromSeasons(seriesEpisodes.seasons);
    const matchOpts = { continuous, courStarts, seasonEpisodeCounts: seasonCounts };

    const newSeasons = seriesEpisodes.seasons.map((season) => {
      const seasonNum = season.season;
      const newEpisodes = season.episodes.map((ep) => {
        // Ne pas écraser si l'épisode a déjà un info_hash valide (venant du backend)
        if (ep.info_hash && ep.info_hash.length >= 32) return ep;

        const epNum = ep.episode;

        const epMatches: Torrent[] = [];
        const packMatches: Torrent[] = [];

        for (const variant of initialVariants) {
          const name = variant.name || variant.cleanTitle || '';
          if (episodeReleaseMatchesTmdbEpisode(seasonNum, epNum, name, matchOpts)) {
            epMatches.push(variant);
            continue;
          }
          if (scenePackMatchesTmdbEpisode(seasonNum, epNum, name, matchOpts)) {
            packMatches.push(variant);
            continue;
          }
          // Fallback historique : pack Sxx sans remap (séries TMDB multi-saisons classiques)
          if (!continuous) {
            const nameUp = name.toUpperCase();
            const seasonRegex = new RegExp(`S${seasonNum.toString().padStart(2, '0')}\\b`, 'i');
            const isPack =
              seasonRegex.test(nameUp) &&
              (nameUp.includes('COMPLETE') ||
                nameUp.includes('INTEGRALE') ||
                !/\bE\d{1,2}\b/i.test(nameUp));
            if (isPack) packMatches.push(variant);
          }
        }

        const bestVariant = pickBest(epMatches) ?? pickBest(packMatches);

        if (bestVariant) {
          // Garder l'id épisode TMDB unique — écraser par l'id pack faisait que
          // E1–E24 partageaient le même id → clic E25 / sélection ambiguë.
          return {
            ...ep,
            info_hash: bestVariant.infoHash,
            isAvailable: true,
          };
        }

        return ep;
      });

      return { ...season, episodes: newEpisodes };
    });

    // Affichage Netflix/scène : S1 E1–24, S2 E1–… (plus une seule saison TMDB à 60 eps).
    let displaySeasons = newSeasons;
    if (continuous && courStarts && courStarts.length > 1) {
      displaySeasons = splitContinuousSeasonsIntoSceneCours(newSeasons, courStarts);
    }

    return { ...seriesEpisodes, seasons: displaySeasons };
  }, [seriesEpisodes, initialVariants, torrent]);

  /**
   * Torrent affiché sur la page détail : `pickBestTorrentFromGroupPayload` peut choisir un autre épisode
   * (ex. S01E02 par seeders) alors que le carrousel sélectionne par défaut le premier épisode (S01E01).
   * Sans alignement, selectedTorrent / useVideoFiles oscillent entre deux info_hash. On aligne donc sur le
   * premier épisode enrichi sauf deep-link explicite (infoHash / variantId / season+episode dans l’URL).
   */
  const pageTorrent = useMemo((): Torrent | null => {
    if (!torrent) return null;
    const base: Torrent = urlInfoHash ? { ...torrent, infoHash: urlInfoHash } : torrent;
    if (typeof window === 'undefined') return base;

    const params = new URLSearchParams(window.location.search);
    const typeParam = (params.get('type') || '').toLowerCase();
    const tmdbTy = String(base.tmdbType ?? (base as { tmdb_type?: string }).tmdb_type ?? '').toLowerCase();
    const isTv = typeParam === 'tv' || tmdbTy === 'tv' || tmdbTy === 'series';
    if (!isTv) return base;

    // Deep-links épisode : ne pas forcer le premier épisode du carrousel
    if (params.get('variantId') || (params.get('season') && params.get('episode'))) {
      return base;
    }
    if (urlInfoHash) return base;

    if (!enrichedSeriesEpisodes?.seasons?.length || !initialVariants?.length) return base;

    const firstSeason =
      enrichedSeriesEpisodes.seasons.find((s) => s.season > 0 && (s.episodes?.length ?? 0) > 0) ??
      enrichedSeriesEpisodes.seasons.find((s) => (s.episodes?.length ?? 0) > 0);
    const firstEp = firstSeason?.episodes?.[0];
    if (!firstEp) return base;

    const ihRaw = (firstEp.info_hash || '').toString().trim();
    let match: Torrent | undefined =
      initialVariants.find((v) => v.id === firstEp.id) ??
      (ihRaw.length >= 32
        ? initialVariants.find((v) => {
            const vh = (v.infoHash || (v as { info_hash?: string }).info_hash || '').toString().toLowerCase();
            return vh === ihRaw.toLowerCase();
          })
        : undefined);

    // Bibliothèque : les noms TMDB / titres dossier n’ont souvent pas de SxxEyy dans `firstEp` avant enrichissement ;
    // les lignes `libraryItemToTorrent` portent en revanche le nom de fichier release (ex. …S01E01…).
    if (
      !match &&
      params.get('from') === 'library' &&
      typeof firstEp.season === 'number' &&
      typeof firstEp.episode === 'number'
    ) {
      match = initialVariants.find((v) =>
        episodeReleaseMatchesVariantName(
          firstEp.season,
          firstEp.episode,
          String(v.name || (v as { cleanTitle?: string }).cleanTitle || ''),
        ),
      );
    }

    if (!match) return base;

    const mainTitle = (base as { mainTitle?: string }).mainTitle ?? (torrent as { mainTitle?: string }).mainTitle;
    return {
      ...match,
      mainTitle: mainTitle ?? (match as { mainTitle?: string }).mainTitle,
      tmdbId: base.tmdbId ?? match.tmdbId,
      tmdbType: base.tmdbType ?? match.tmdbType,
    } as Torrent;
  }, [torrent, urlInfoHash, enrichedSeriesEpisodes, initialVariants]);

  const initialTorrentStats: ClientTorrentStats | null = pageTorrent?.infoHash
    ? (getDownloadClientStats(pageTorrent.infoHash) as ClientTorrentStats | null)
    : null;

  // Stats live (post-reboot checking) : préférer clientState de l'enrichissement à un cache localStorage stale.
  const liveInitialStats: ClientTorrentStats | null | undefined = useMemo(() => {
    const ih = pageTorrent?.infoHash;
    if (!ih) return initialTorrentStats ?? undefined;
    const state = pageTorrent?.clientState;
    if (state === 'checking' || state === 'initializing' || state === 'seeding' || state === 'completed' || state === 'downloading') {
      return {
        info_hash: ih,
        name: pageTorrent?.name || '',
        state: state as ClientTorrentStats['state'],
        progress: typeof pageTorrent?.clientProgress === 'number' ? pageTorrent.clientProgress : 0,
        downloaded_bytes: 0,
        uploaded_bytes: 0,
        total_bytes: pageTorrent?.fileSize || 0,
        download_speed: 0,
        upload_speed: 0,
        peers_connected: 0,
        peers_total: 0,
        seeders: 0,
        leechers: 0,
        eta_seconds: null,
        files_available: state === 'seeding' || state === 'completed',
        download_started: true,
      };
    }
    return initialTorrentStats ?? undefined;
  }, [pageTorrent, initialTorrentStats]);

  const backHref = useMemo(() => getBackHrefFromLocation(), []);
  const streamBackendUrl = useMemo(() => getStreamBackendUrlFromLocation(), []);
  const seriesIndexerRefreshTmdbId =
    typeof tmdbId === 'number' && !Number.isNaN(tmdbId)
      ? tmdbId
      : typeof pageTorrent?.tmdbId === 'number'
        ? pageTorrent.tmdbId
        : null;

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center bg-[var(--ed-bg,#0c0d10)]">
        <DsLoader size="lg" text="Chargement" />
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

  if (!pageTorrent) return null;

  return (
    <MediaDetailPage
      torrent={pageTorrent}
      initialVariants={initialVariants.length > 0 ? initialVariants : undefined}
      seriesEpisodes={enrichedSeriesEpisodes ?? undefined}
      initialTorrentStats={
        liveInitialStats ? normalizeTorrentStats(liveInitialStats as ClientTorrentStats) : undefined
      }
      backHref={backHref ?? undefined}
      streamBackendUrl={streamBackendUrl ?? undefined}
      seriesIndexerRefreshTmdbId={seriesIndexerRefreshTmdbId}
      reloadMediaDetail={() => setRetryKey((k) => k + 1)}
    />
  );
}
