import { useEffect, useState, useCallback, useMemo, useRef } from 'preact/hooks';
import { Download, Upload, FileText as LogsIcon, Link2, HardDrive, Users, Clock } from 'lucide-preact';
import { clientApi } from '../../lib/client/api';
import type { ClientTorrentStats, TorrentLogEntry } from '../../lib/client/types';
import { useI18n } from '../../lib/i18n/useI18n';
import { getDownloadMeta } from '../../lib/utils/download-meta-storage';
import { formatBytes, formatSpeed } from '../../lib/utils/formatBytes';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';
import { DownloadCard } from './DownloadCard';
import { DownloadDetailModal } from './DownloadDetailModal';
import { Modal } from '../ui/Modal';
import { ConfirmModal } from '../ui/ConfirmModal';
import CarouselRow from '../torrents/CarouselRow';

const REFRESH_INTERVAL = 4000;

type SpeedStat = { human_readable?: string; mbps?: number };
type PeersStat = { live?: number; seen?: number; connecting?: number };

function readSpeedLabel(stat: unknown, fallbackBps: number): string {
  const human = (stat as SpeedStat | undefined)?.human_readable;
  if (typeof human === 'string' && human.trim()) return human;
  return formatSpeed(fallbackBps);
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`;
  return `${m}m`;
}

function buildImageMapFromList(data: { data?: Array<Record<string, any>> }) {
  const map: Record<string, any> = {};
  if (!data?.data) return map;
  for (const t of data.data) {
    const key = ((t.infoHash ?? t.info_hash) || '').toLowerCase();
    if (!key) continue;
    map[key] = {
       posterUrl: t.imageUrl ?? t.poster_url ?? t.poster ?? null,
       backdropUrl: t.heroImageUrl ?? t.hero_image_url ?? t.backdrop ?? null,
       title: t.tmdb_title ?? t.title ?? t.name ?? null,
       tmdbType: t.tmdb_type ?? t.type ?? null
    };
  }
  return map;
}

function buildImageMapFromLibrary(data: { data?: Array<Record<string, any>> }) {
  const images: Record<string, any> = {}, titles: Record<string, string> = {}, types: Record<string, any> = {};
  if (!data?.data) return { images, titles, types };
  for (const item of data.data) {
    const key = ((item.info_hash ?? item.infoHash) || '').toLowerCase();
    if (!key) continue;
    images[key] = { posterUrl: item.poster_url ?? item.poster ?? null, backdropUrl: item.hero_image_url ?? item.backdrop ?? null };
    if (item.tmdb_title ?? item.title) titles[key] = (item.tmdb_title ?? item.title).trim();
    if (item.tmdb_type ?? item.type) types[key] = item.tmdb_type ?? item.type;
  }
  return { images, titles, types };
}

function filterLogs(logs: TorrentLogEntry[]): TorrentLogEntry[] {
  return [...logs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 500);
}

function normalizeSeriesTitle(title: string): string {
  return title
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\d{4}\b/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\b(?:x264|x265|HEVC|HDR|DTS|AC3|BluRay|WEB-DL|REMUX|4K|1080p|720p|480p|BDRip|WEBRip|DVDRip|FRENCH|VOSTFR|VF)\b/gi, '')
    .replace(/S\d{1,2}E\d{1,3}/gi, '')
    .replace(/\bSaison\s+\d+\b/gi, '')
    .replace(/\bSeason\s+\d+\b/gi, '')
    .replace(/\bEpisode\s+\d+\b/gi, '')
    .trim()
    .toLowerCase();
}

/** Nettoie un titre TMDB brut (parsé depuis le nom de torrent) pour optimiser la recherche TMDB */
function cleanTitleForTmdb(title: string): string {
  return title
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\b(?:x264|x265|HEVC|HDR10?|DTS|AC3|DD5\.?1|BluRay|BDRip|WEB-DL|WEBRip|REMUX|4K|2160p|1080p|720p|480p|DVDRip|FRENCH|VOSTFR|VF|VO|MULTI|TRUEFRENCH|AAC|H\.?265|H\.?264|AVC|MKV|MP4|AVI)\b/gi, '')
    .replace(/S\d{1,2}E\d{1,3}/gi, '')
    .replace(/\bSaison\s+\d+\b/gi, '')
    .replace(/\bSeason\s+\d+\b/gi, '')
    .replace(/\b(COMPLETE|PACK|BOXSET|EXTENDED|THEATRICAL|REMASTERED|DIRECTORS?.?CUT|UNRATED)\b/gi, '')
    // "First" isolé en fin de titre (ex. "Fantastic Four First" → nom torrent) 
    .replace(/\bFirst\b$/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function getTorrentPriority(torrent: ClientTorrentStats): number {
  if (torrent.state === 'downloading') return 5;
  if (torrent.state === 'seeding') return 4;
  if (torrent.state === 'queued') return 3;
  if (torrent.state === 'paused') return 2;
  if (torrent.state === 'completed') return 1;
  return 0;
}

function isInProgressTorrent(t: ClientTorrentStats): boolean {
  return t.state === 'downloading' || t.state === 'queued';
}

function isReadyTorrent(t: ClientTorrentStats): boolean {
  return t.state === 'completed' || t.state === 'seeding';
}

function sortTorrentsDeterministic(items: ClientTorrentStats[]): ClientTorrentStats[] {
  return [...items].sort((a, b) => {
    const prioDiff = getTorrentPriority(b) - getTorrentPriority(a);
    if (prioDiff !== 0) return prioDiff;

    const progressDiff = (b.progress ?? 0) - (a.progress ?? 0);
    if (progressDiff !== 0) return progressDiff;

    const seedDiff = (b.seeders ?? 0) - (a.seeders ?? 0);
    if (seedDiff !== 0) return seedDiff;

    return (a.name ?? '').localeCompare(b.name ?? '', 'fr', { sensitivity: 'base' });
  });
}

export default function DownloadsList() {
  const { t } = useI18n();
  const [torrents, setTorrents] = useState<ClientTorrentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddMagnetModal, setShowAddMagnetModal] = useState(false);
  const [magnetLink, setMagnetLink] = useState('');
  const [addingTorrent, setAddingTorrent] = useState(false);
  
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [selectedTorrentHash, setSelectedTorrentHash] = useState<string | null>(null);
  const [logs, setLogs] = useState<TorrentLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [imageMap, setImageMap] = useState<Record<string, any>>({});
  const [displayTitleMap, setDisplayTitleMap] = useState<Record<string, string>>({});
  const [tmdbTypeMap, setTmdbTypeMap] = useState<Record<string, any>>({});
  const [tmdbIdMap, setTmdbIdMap] = useState<Record<string, number>>({});

  const [selectedTorrent, setSelectedTorrent] = useState<ClientTorrentStats | null>(null);
  const [selectedRelatedTorrents, setSelectedRelatedTorrents] = useState<ClientTorrentStats[]>([]);
  const [selectedTorrentPoster, setSelectedTorrentPoster] = useState<string | null>(null);
  const [selectedTorrentBackdrop, setSelectedTorrentBackdrop] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<{
    hash: string;
    deleteFiles: boolean;
  } | null>(null);
  const pendingRemoveResolveRef = useRef<((ok: boolean) => void) | null>(null);
  const [initialHydrated, setInitialHydrated] = useState(false);

  const [showSessionLogsModal, setShowSessionLogsModal] = useState(false);
  const [sessionLogsLines, setSessionLogsLines] = useState<string[]>([]);
  const sessionLogsAbortRef = useRef<AbortController | null>(null);
  const [sessionStats, setSessionStats] = useState<Record<string, unknown> | null>(null);

  const hasEnrichedRef = useRef(false);

  const aggregateSpeeds = useMemo(() => {
    let download = 0;
    let upload = 0;
    for (const tor of torrents) {
      download += tor.download_speed || 0;
      upload += tor.upload_speed || 0;
    }
    return { download, upload };
  }, [torrents]);

  const heroDownloadSpeed = readSpeedLabel(sessionStats?.download_speed, aggregateSpeeds.download);
  const heroUploadSpeed = readSpeedLabel(sessionStats?.upload_speed, aggregateSpeeds.upload);
  const heroPeersLive = (sessionStats?.peers as PeersStat | undefined)?.live;
  const heroUptimeSeconds =
    typeof sessionStats?.uptime_seconds === 'number' ? sessionStats.uptime_seconds : null;
  const heroFetchedBytes =
    typeof sessionStats?.fetched_bytes === 'number' ? sessionStats.fetched_bytes : null;
  const heroUploadedBytes =
    typeof sessionStats?.uploaded_bytes === 'number' ? sessionStats.uploaded_bytes : null;

  const loadTorrents = useCallback(async () => {
    try {
      // 1) Toujours récupérer la liste torrents
      const list = await clientApi.listTorrents();

      // 2) Hydratation initiale: enrichir avant premier rendu complet
      if (!hasEnrichedRef.current) {
        try {
          const [enriched, libraryResponse] = await Promise.all([
            clientApi.listTorrentsEnriched(),
            (async () => {
              const { serverApi } = await import('../../lib/client/server-api');
              return serverApi.getLibrary().catch(() => null);
            })(),
          ]);

          const images: Record<string, { posterUrl: string | null; backdropUrl: string | null }> = {};
          const titles: Record<string, string> = {};
          const types: Record<string, string> = {};
          const ids: Record<string, number> = {};

          const needsTmdb: Array<{ key: string; title: string; type: string }> = [];
          for (const t of enriched) {
            const key = t.info_hash.toLowerCase();
            images[key] = { posterUrl: t.poster_url ?? null, backdropUrl: t.hero_image_url ?? null };
            if (t.tmdb_title) titles[key] = t.tmdb_title;
            if (t.tmdb_type) types[key] = t.tmdb_type;
            if (t.tmdb_id != null && Number.isFinite(Number(t.tmdb_id))) ids[key] = Number(t.tmdb_id);
            if (!t.poster_url && !t.hero_image_url && t.tmdb_title) {
              needsTmdb.push({ key, title: t.tmdb_title, type: t.tmdb_type ?? 'movie' });
            }
          }

          if (libraryResponse?.success) {
            const lib = buildImageMapFromLibrary(libraryResponse as any);
            Object.assign(images, lib.images);
            Object.assign(titles, lib.titles);
            Object.assign(types, lib.types);
          }

          setImageMap(images);
          setDisplayTitleMap(titles);
          setTmdbTypeMap(types);
          setTmdbIdMap(ids);

          // Fallback TMDB optionnel (non bloquant pour le premier rendu)
          if (needsTmdb.length > 0) {
            const { serverApi } = await import('../../lib/client/server-api');
            const baseUrl = serverApi.getServerUrl().trim().replace(/\/$/, '');
            const token = serverApi.getAccessToken();
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            };

            void Promise.allSettled(
              needsTmdb.map(async ({ key, title, type }) => {
                try {
                  const params = new URLSearchParams({ q: title, type });
                  const res = await fetch(`${baseUrl}/api/discover/search?${params}`, { headers });
                  if (!res.ok) return;
                  const data = await res.json();
                  const hits: any[] = data.results ?? data.data ?? [];
                  const hit = hits[0];
                  if (!hit) return;
                  const posterPath = hit.poster_path ?? hit.poster ?? null;
                  const backdropPath = hit.backdrop_path ?? hit.backdrop ?? null;
                  const posterUrl = posterPath
                    ? (posterPath.startsWith('http') ? posterPath : `https://image.tmdb.org/t/p/w780${posterPath}`)
                    : null;
                  const backdropUrl = backdropPath
                    ? (backdropPath.startsWith('http') ? backdropPath : `https://image.tmdb.org/t/p/w1280${backdropPath}`)
                    : null;
                  const tmdbNumeric =
                    typeof hit.tmdbId === 'number'
                      ? hit.tmdbId
                      : typeof hit.tmdb_id === 'number'
                        ? hit.tmdb_id
                        : null;
                  const hitMediaType =
                    hit.type === 'tv' ? 'tv' : hit.type === 'movie' ? 'movie' : null;
                  if (tmdbNumeric != null && Number.isFinite(tmdbNumeric)) {
                    setTmdbIdMap((prev) => ({ ...prev, [key]: tmdbNumeric }));
                  }
                  if (hitMediaType) {
                    setTmdbTypeMap((prev) => ({ ...prev, [key]: hitMediaType }));
                  }
                  if (posterUrl || backdropUrl) {
                    setImageMap(prev => ({
                      ...prev,
                      [key]: { posterUrl: posterUrl ?? prev[key]?.posterUrl ?? null, backdropUrl: backdropUrl ?? prev[key]?.backdropUrl ?? null },
                    }));
                  }
                } catch {
                  // optionnel
                }
              }),
            );
          }

          hasEnrichedRef.current = true;
        } catch {
          // En cas d'échec, on continue avec la liste brute.
        }
      }

      setTorrents(list);
      if (!initialHydrated) {
        setInitialHydrated(true);
      }

      // Mettre à jour le torrent sélectionné s'il existe
      setSelectedTorrent(prev => {
        if (!prev) return null;
        return list.find(t => t.info_hash === prev.info_hash) || prev;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [initialHydrated]);

  useEffect(() => {
    loadTorrents();
    const interval = setInterval(loadTorrents, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadTorrents]);

  useEffect(() => {
    let cancelled = false;
    const loadStats = async () => {
      try {
        const stats = await clientApi.getLibrqbitSessionStats();
        if (!cancelled && stats) setSessionStats(stats);
      } catch {
        // fallback agrégé depuis la liste torrents
      }
    };
    loadStats();
    const interval = setInterval(loadStats, REFRESH_INTERVAL);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!initialHydrated) return;
    if (torrents.length === 0) return;
    (async () => {
      try {
        const { serverApi } = await import('../../lib/client/server-api');
        const response = await serverApi.getLibrary();
        if (response?.success) {
          const { images, titles, types } = buildImageMapFromLibrary(response as any);
          setImageMap(prev => ({...prev, ...images}));
          setDisplayTitleMap(prev => ({...prev, ...titles}));
          setTmdbTypeMap(prev => ({...prev, ...types}));
        }
      } catch {}
    })();
  }, [initialHydrated, torrents.length]);

  const moviesTorrents = useMemo(
    () => sortTorrentsDeterministic(torrents.filter(t => tmdbTypeMap[t.info_hash.toLowerCase()] === 'movie')),
    [torrents, tmdbTypeMap],
  );
  const seriesTorrents = useMemo(
    () => sortTorrentsDeterministic(torrents.filter(t => tmdbTypeMap[t.info_hash.toLowerCase()] === 'tv')),
    [torrents, tmdbTypeMap],
  );
  const groupedSeriesData = useMemo(() => {
    const groups = new Map<string, { representative: ClientTorrentStats; index: number; torrents: ClientTorrentStats[] }>();
    seriesTorrents.forEach((torrent, index) => {
      const key = torrent.info_hash.toLowerCase();
      const displayTitle = (displayTitleMap[key] || torrent.tmdb_title || torrent.name || '').trim();
      const normalizedTitle = normalizeSeriesTitle(displayTitle);
      const groupKey = normalizedTitle || key;
      const current = groups.get(groupKey);
      if (!current) {
        groups.set(groupKey, { representative: torrent, index, torrents: [torrent] });
        return;
      }

      current.torrents.push(torrent);

      const currentPriority = getTorrentPriority(current.representative);
      const candidatePriority = getTorrentPriority(torrent);
      const shouldReplace =
        candidatePriority > currentPriority ||
        (candidatePriority === currentPriority && torrent.progress > current.representative.progress);

      if (shouldReplace) {
        current.representative = torrent;
      }
    });

    const orderedGroups = Array.from(groups.values()).sort((a, b) => {
      const prioDiff = getTorrentPriority(b.representative) - getTorrentPriority(a.representative);
      if (prioDiff !== 0) return prioDiff;
      const progressDiff = (b.representative.progress ?? 0) - (a.representative.progress ?? 0);
      if (progressDiff !== 0) return progressDiff;
      return a.index - b.index;
    });
    const groupedSeriesTorrents = orderedGroups.map(group => group.representative);
    const representativeToGroupMap: Record<string, ClientTorrentStats[]> = {};
    orderedGroups.forEach((group) => {
      representativeToGroupMap[group.representative.info_hash] = [...group.torrents];
    });
    return { groupedSeriesTorrents, representativeToGroupMap };
  }, [seriesTorrents, displayTitleMap]);
  const groupedSeriesTorrents = groupedSeriesData.groupedSeriesTorrents;
  const representativeToGroupMap = groupedSeriesData.representativeToGroupMap;
  const otherTorrents = useMemo(
    () =>
      sortTorrentsDeterministic(
        torrents.filter(t => {
          const type = tmdbTypeMap[t.info_hash.toLowerCase()];
          return type !== 'movie' && type !== 'tv';
        }),
      ),
    [torrents, tmdbTypeMap],
  );

  const downloadingNow = useMemo(
    () => sortTorrentsDeterministic(torrents.filter(isInProgressTorrent)),
    [torrents],
  );
  const readyMovies = useMemo(
    () => moviesTorrents.filter(isReadyTorrent),
    [moviesTorrents],
  );
  const readySeries = useMemo(
    () => groupedSeriesTorrents.filter(isReadyTorrent),
    [groupedSeriesTorrents],
  );
  const readyOthers = useMemo(
    () => otherTorrents.filter(isReadyTorrent),
    [otherTorrents],
  );

  const handleOpenDetail = (
    tor: ClientTorrentStats,
    p?: string | null,
    b?: string | null,
  ) => {
    const group = representativeToGroupMap[tor.info_hash];
    setSelectedRelatedTorrents(group && group.length > 0 ? group : [tor]);
    setSelectedTorrent(tor);
    setSelectedTorrentPoster(p ?? null);
    setSelectedTorrentBackdrop(b ?? null);
  };
  const handleCloseDetail = () => {
    setSelectedTorrent(null);
    setSelectedRelatedTorrents([]);
  };

  const handleTmdbMetadataChanged = useCallback(
    async (infoHash: string) => {
      hasEnrichedRef.current = false;
      await loadTorrents();
      try {
        const enriched = await clientApi.listTorrentsEnriched();
        const hit = enriched.find((e) => e.info_hash.toLowerCase() === infoHash.toLowerCase());
        if (!hit) return;
        const key = infoHash.toLowerCase();
        setDisplayTitleMap((prev) => {
          const nextTitle = (hit.tmdb_title || prev[key] || '').trim();
          return nextTitle ? { ...prev, [key]: nextTitle } : prev;
        });
        setTmdbTypeMap((prev) => ({
          ...prev,
          ...(hit.tmdb_type ? { [key]: hit.tmdb_type } : {}),
        }));
        setImageMap((prev) => ({
          ...prev,
          [key]: {
            posterUrl: hit.poster_url ?? prev[key]?.posterUrl ?? null,
            backdropUrl: hit.hero_image_url ?? prev[key]?.backdropUrl ?? null,
          },
        }));
        setSelectedTorrentPoster((prev) => hit.poster_url ?? prev);
        setSelectedTorrentBackdrop((prev) => hit.hero_image_url ?? prev);
        if (hit.tmdb_id != null && Number.isFinite(Number(hit.tmdb_id))) {
          setTmdbIdMap((prev) => ({ ...prev, [key]: Number(hit.tmdb_id) }));
        }
        setSelectedTorrent((prev) => {
          if (!prev || prev.info_hash.toLowerCase() !== key) return prev;
          return {
            ...prev,
            tmdb_id: hit.tmdb_id ?? prev.tmdb_id,
            tmdb_title: hit.tmdb_title ?? prev.tmdb_title,
            tmdb_type: (hit.tmdb_type as ClientTorrentStats['tmdb_type']) ?? prev.tmdb_type,
            poster_url: hit.poster_url ?? prev.poster_url,
            hero_image_url: hit.hero_image_url ?? prev.hero_image_url,
          };
        });
      } catch {
        /* ignore */
      }
    },
    [loadTorrents],
  );

  const handleShowLogs = async (h: string) => { 
    setSelectedTorrentHash(h); setShowLogsModal(true); setLogsLoading(true);
    try { setLogs(filterLogs(await clientApi.getTorrentLogs(h))); } catch { } finally { setLogsLoading(false); }
  };

  const renderCarousel = (title: string, items: ClientTorrentStats[], initialFocus = false) => {
    if (items.length === 0) return null;
    return (
      <CarouselRow title={`${title} (${items.length})`} autoScroll={false}>
        {items.map((torrent, index) => (
          <div
            key={torrent.info_hash}
            className="flex-shrink-0 w-[240px] sm:w-[320px] lg:w-[360px] tv:w-[400px]"
            data-tv-initial-focus={initialFocus && index === 0 ? true : undefined}
          >
            <DownloadCard
              torrent={torrent}
              posterUrl={imageMap[torrent.info_hash.toLowerCase()]?.posterUrl}
              backdropUrl={imageMap[torrent.info_hash.toLowerCase()]?.backdropUrl}
              displayTitle={displayTitleMap[torrent.info_hash.toLowerCase()]}
              onOpenDetail={handleOpenDetail}
            />
          </div>
        ))}
      </CarouselRow>
    );
  };

  if (loading && torrents.length === 0) return <div className="flex-1 flex items-center justify-center min-h-[400px]"><HLSLoadingSpinner size="lg" text={t('downloads.loadingDownloads')} /></div>;

  return (
    <div className="flex flex-col w-full min-w-0 max-w-full" data-page="downloads">
      <section
        className="relative w-full overflow-hidden border-b border-white/10"
        aria-label={t('settingsPages.librqbit.sessionStats')}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--ds-accent-violet)]/20 via-black to-[var(--ds-accent-green)]/10" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.08),transparent_55%)]" />
        <div className="relative px-4 sm:px-12 pt-8 sm:pt-12 pb-8 sm:pb-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-10 max-w-4xl">
            <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-black/30 backdrop-blur-md p-5 sm:p-7">
              <div className="flex items-center gap-2 text-[var(--ds-accent-violet)] mb-3">
                <Download className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.5} size={24} />
                <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider">
                  {t('downloads.stats.downloadSpeed')}
                </span>
              </div>
              <p className="text-3xl sm:text-5xl font-bold text-white tracking-tight tabular-nums">
                {heroDownloadSpeed}
              </p>
              {heroFetchedBytes != null && (
                <p className="mt-2 text-sm text-white/40">
                  {formatBytes(heroFetchedBytes)} {t('downloads.stats.totalDownloaded')}
                </p>
              )}
            </div>
            <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-black/30 backdrop-blur-md p-5 sm:p-7">
              <div className="flex items-center gap-2 text-[var(--ds-accent-green)] mb-3">
                <Upload className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={2.5} size={24} />
                <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider">
                  {t('downloads.stats.uploadSpeed')}
                </span>
              </div>
              <p className="text-3xl sm:text-5xl font-bold text-white tracking-tight tabular-nums">
                {heroUploadSpeed}
              </p>
              {heroUploadedBytes != null && (
                <p className="mt-2 text-sm text-white/40">
                  {formatBytes(heroUploadedBytes)} {t('downloads.stats.totalUploaded')}
                </p>
              )}
            </div>
          </div>
          {(heroPeersLive != null || heroUptimeSeconds != null) && (
            <div className="mt-5 flex flex-wrap items-center gap-3 sm:gap-4 text-sm text-white/50">
              {heroPeersLive != null && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  <Users className="w-4 h-4 text-white/40" size={16} />
                  {heroPeersLive} {t('downloads.stats.peers')}
                </span>
              )}
              {heroUptimeSeconds != null && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  <Clock className="w-4 h-4 text-white/40" size={16} />
                  {t('downloads.sessionUptime')}: {formatUptime(heroUptimeSeconds)}
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="pt-4 sm:pt-8 pb-12 flex-1 safe-area-bottom w-full min-w-0 max-w-full">
        <div className="px-4 sm:px-12 mb-6 sm:mb-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div>
            <h1 className="text-3xl sm:text-5xl font-bold text-white mb-1 sm:mb-2 tracking-tight">{t('downloads.title')}</h1>
            <p className="text-white/40 text-base sm:text-lg font-medium">{t('downloads.activeDownloads', { count: torrents.length, plural: torrents.length > 1 ? 's' : '' })}</p>
          </div>
          <div className="flex items-center gap-2 p-1.5 sm:p-2 bg-white/5 border border-white/10 rounded-2xl sm:rounded-3xl backdrop-blur-xl shrink-0">
             <button
               type="button"
               onClick={() => setShowAddMagnetModal(true)}
               data-focusable
               tabIndex={0}
               aria-label={t('downloads.addMagnetLink')}
               title={t('downloads.addMagnetLink')}
               className="min-w-11 min-h-11 w-11 h-11 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
             >
               <Link2 size={24} />
             </button>
             <button
               type="button"
               onClick={() => setShowSessionLogsModal(true)}
               data-focusable
               tabIndex={0}
               aria-label={t('downloads.logs') || 'Logs'}
               title={t('downloads.logs') || 'Logs'}
               className="min-w-11 min-h-11 w-11 h-11 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
             >
               <LogsIcon size={24} />
             </button>
          </div>
        </div>

        {torrents.length === 0 ? (
          <div className="px-6 sm:px-12 mt-8 sm:mt-12 flex flex-col items-center justify-center py-20 sm:py-32 text-center bg-white/[0.02] border border-white/5 rounded-3xl sm:rounded-[3rem] mx-4 sm:mx-12 backdrop-blur-sm">
            <div className="w-20 h-20 sm:w-24 sm:h-24 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10 shadow-inner">
               <HardDrive size={32} className="text-white/20 sm:hidden" />
               <HardDrive size={40} className="text-white/20 hidden sm:block" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">{t('downloads.noActiveDownloads')}</h2>
            <p className="text-white/30 text-base sm:text-lg max-w-md">{t('downloads.torrentsWillAppear')}</p>
          </div>
        ) : (
          <div className="w-full min-w-0 max-w-full">
            {renderCarousel(t('downloads.downloadingNow'), downloadingNow, downloadingNow.length > 0)}
            {renderCarousel(t('downloads.readyToWatch'), [...readyMovies, ...readySeries, ...readyOthers], downloadingNow.length === 0)}
            {renderCarousel(t('nav.films'), moviesTorrents.filter((t) => !isInProgressTorrent(t) && !isReadyTorrent(t)))}
            {renderCarousel(t('nav.series'), groupedSeriesTorrents.filter((t) => !isInProgressTorrent(t) && !isReadyTorrent(t)))}
            {renderCarousel(t('library.others'), otherTorrents.filter((t) => !isInProgressTorrent(t) && !isReadyTorrent(t)))}
          </div>
        )}
      </div>

      <Modal
        isOpen={showAddMagnetModal}
        onClose={() => setShowAddMagnetModal(false)}
        title={t('downloads.addMagnetLink')}
        size="lg"
      >
        <div className="flex flex-col gap-6">
          <textarea 
            value={magnetLink} 
            onChange={(e: any) => setMagnetLink(e.target.value)} 
            className="w-full h-48 bg-black/40 border border-white/10 rounded-2xl p-6 text-white placeholder-white/10 focus:outline-none focus:border-[var(--ds-accent-violet)] transition-colors" 
            placeholder="magnet:?xt=urn:btih:..." 
            autoFocus
          />
          <div className="flex justify-end gap-4">
            <button 
              onClick={() => setShowAddMagnetModal(false)} 
              className="px-10 py-4 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-bold transition-colors"
              data-focusable
            >
              Annuler
            </button>
            <button 
              onClick={async () => {
                setAddingTorrent(true);
                try {
                  const name = magnetLink.match(/dn=([^&]+)/) ? decodeURIComponent(magnetLink.match(/dn=([^&]+)/)![1]) : 'Torrent';
                  await clientApi.addMagnetLink(magnetLink, name, false);
                  setShowAddMagnetModal(false); setMagnetLink(''); loadTorrents();
                } catch(e) { } finally { setAddingTorrent(false); }
              }} 
              className="px-10 py-4 rounded-2xl bg-[var(--ds-accent-violet)] text-white font-bold shadow-lg shadow-purple-500/20"
              disabled={addingTorrent}
              data-focusable
            >
              {addingTorrent ? 'Ajout...' : 'Ajouter'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showLogsModal}
        onClose={() => setShowLogsModal(false)}
        title="Logs du Torrent"
        size="xl"
      >
        <div className="flex flex-col h-[60vh]">
          <div className="flex-1 overflow-y-auto bg-black/40 rounded-3xl p-6 font-mono text-sm text-white/60 custom-scrollbar border border-white/5">
            {logsLoading ? <div className="flex items-center justify-center h-full"><HLSLoadingSpinner size="md" /></div> : (
              logs.length > 0 ? logs.map((l, i) => (
                <div key={i} className={`py-1 border-b border-white/5 last:border-0 ${l.level === 'ERROR' ? 'text-red-400' : l.level === 'WARN' ? 'text-amber-400' : ''}`}>
                  <span className="opacity-30">[{new Date(l.timestamp).toLocaleTimeString()}]</span> <span className="font-bold opacity-50">[{l.level}]</span> {l.message}
                </div>
              )) : "Aucun log disponible"
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showSessionLogsModal}
        onClose={() => setShowSessionLogsModal(false)}
        title="Logs Session"
        size="xl"
      >
        <div className="flex flex-col h-[60vh]">
          <div className="flex-1 overflow-y-auto bg-black/40 rounded-3xl p-6 font-mono text-sm text-white/40 custom-scrollbar border border-white/5 whitespace-pre-wrap">
            {sessionLogsLines.length > 0 ? sessionLogsLines.join('\n') : "En attente de logs..."}
          </div>
        </div>
      </Modal>

      {selectedTorrent && (
        <DownloadDetailModal 
          torrent={selectedTorrent} 
          relatedTorrents={selectedRelatedTorrents}
          onClose={handleCloseDetail} 
          onPause={async (h) => { await clientApi.pauseTorrent(h); await loadTorrents(); }} 
          onResume={async (h) => { await clientApi.resumeTorrent(h); await loadTorrents(); }} 
          onRemove={async (h, d) => {
            return new Promise<boolean>((resolve) => {
              pendingRemoveResolveRef.current = resolve;
              setPendingRemove({ hash: h, deleteFiles: d });
            });
          }}
          onShowLogs={handleShowLogs}
          posterUrl={selectedTorrentPoster}
          backdropUrl={selectedTorrentBackdrop}
          displayTitleByHash={displayTitleMap}
          tmdbIdByHash={tmdbIdMap}
          tmdbTypeByHash={tmdbTypeMap as Record<string, string>}
          onTmdbMetadataChanged={handleTmdbMetadataChanged}
        />
      )}

      <ConfirmModal
        isOpen={!!pendingRemove}
        title={t('downloads.confirmDeleteTorrentTitle') || 'Supprimer le torrent'}
        message={
          pendingRemove?.deleteFiles
            ? t('downloads.confirmDeleteTorrentMessage') ||
              'Supprimer ce torrent et les fichiers du disque ?'
            : t('downloads.confirmRemove')?.replace('{withFiles}', '') ||
              'Supprimer ce torrent du client ?'
        }
        danger
        confirmLabel={t('common.delete') || 'Supprimer'}
        onCancel={() => {
          pendingRemoveResolveRef.current?.(false);
          pendingRemoveResolveRef.current = null;
          setPendingRemove(null);
        }}
        onConfirm={async () => {
          const pending = pendingRemove;
          setPendingRemove(null);
          if (!pending) {
            pendingRemoveResolveRef.current?.(false);
            pendingRemoveResolveRef.current = null;
            return;
          }
          try {
            await clientApi.removeTorrent(pending.hash, pending.deleteFiles);
            await loadTorrents();
            pendingRemoveResolveRef.current?.(true);
          } catch {
            pendingRemoveResolveRef.current?.(false);
          }
          pendingRemoveResolveRef.current = null;
        }}
      />
    </div>
  );
}