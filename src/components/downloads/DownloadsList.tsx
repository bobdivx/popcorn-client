import { useEffect, useState, useCallback, useMemo, useRef } from 'preact/hooks';
import { Download, Upload, FileText as LogsIcon, Link2, HardDrive, Users, Clock, Pause, Play } from 'lucide-preact';
import { clientApi } from '../../lib/client/api';
import type { ClientTorrentStats, TorrentLogEntry } from '../../lib/client/types';
import { useI18n } from '../../lib/i18n/useI18n';
import { formatBytes, formatSpeed } from '../../lib/utils/formatBytes';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';
import { DownloadRow } from './DownloadRow';
import { DownloadDetailModal } from './DownloadDetailModal';
import { Modal } from '../ui/Modal';
import { ConfirmModal } from '../ui/ConfirmModal';

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
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'ready'>('all');
  const [actingHash, setActingHash] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

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

    const hashToGroupMap: Record<string, ClientTorrentStats[]> = {};
    for (const group of groups.values()) {
      for (const torrent of group.torrents) {
        hashToGroupMap[torrent.info_hash] = [...group.torrents];
      }
    }
    return { hashToGroupMap };
  }, [seriesTorrents, displayTitleMap]);
  const hashToGroupMap = groupedSeriesData.hashToGroupMap;

  const sortedTorrents = useMemo(() => sortTorrentsDeterministic(torrents), [torrents]);
  const filteredTorrents = useMemo(() => {
    if (filter === 'active') return sortedTorrents.filter(isInProgressTorrent);
    if (filter === 'paused') return sortedTorrents.filter((t) => t.state === 'paused' || t.state === 'error');
    if (filter === 'ready') return sortedTorrents.filter(isReadyTorrent);
    return sortedTorrents;
  }, [sortedTorrents, filter]);
  const pausableTorrents = useMemo(
    () => torrents.filter((t) => t.state === 'downloading' || t.state === 'seeding' || t.state === 'queued'),
    [torrents],
  );
  const resumableTorrents = useMemo(
    () => torrents.filter((t) => t.state === 'paused' || t.state === 'error'),
    [torrents],
  );

  const handleOpenDetail = (
    tor: ClientTorrentStats,
    p?: string | null,
    b?: string | null,
  ) => {
    const group = hashToGroupMap[tor.info_hash];
    setSelectedRelatedTorrents(group && group.length > 0 ? group : [tor]);
    setSelectedTorrent(tor);
    setSelectedTorrentPoster(p ?? null);
    setSelectedTorrentBackdrop(b ?? null);
  };
  const handleCloseDetail = () => {
    setSelectedTorrent(null);
    setSelectedRelatedTorrents([]);
  };

  const handlePauseOne = async (hash: string) => {
    setActingHash(hash);
    try {
      await clientApi.pauseTorrent(hash);
      await loadTorrents();
    } finally {
      setActingHash(null);
    }
  };
  const handleResumeOne = async (hash: string) => {
    setActingHash(hash);
    try {
      await clientApi.resumeTorrent(hash);
      await loadTorrents();
    } finally {
      setActingHash(null);
    }
  };
  const handlePauseAll = async () => {
    if (pausableTorrents.length === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(pausableTorrents.map((t) => clientApi.pauseTorrent(t.info_hash)));
      await loadTorrents();
    } finally {
      setBulkBusy(false);
    }
  };
  const handleResumeAll = async () => {
    if (resumableTorrents.length === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(resumableTorrents.map((t) => clientApi.resumeTorrent(t.info_hash)));
      await loadTorrents();
    } finally {
      setBulkBusy(false);
    }
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

  const filters = [
    { id: 'all' as const, label: t('downloads.filterAll'), count: torrents.length },
    { id: 'active' as const, label: t('downloads.filterActive'), count: torrents.filter(isInProgressTorrent).length },
    { id: 'paused' as const, label: t('downloads.filterPaused'), count: torrents.filter((x) => x.state === 'paused' || x.state === 'error').length },
    { id: 'ready' as const, label: t('downloads.filterReady'), count: torrents.filter(isReadyTorrent).length },
  ];

  if (loading && torrents.length === 0) return <div className="flex-1 flex items-center justify-center min-h-[400px]"><HLSLoadingSpinner size="lg" text={t('downloads.loadingDownloads')} /></div>;

  return (
    <div className="flex flex-col w-full min-w-0 max-w-full" data-page="downloads">
      <header className="px-4 sm:px-8 lg:px-12 pt-4 sm:pt-6 pb-3 border-b border-[var(--ds-border)]" data-tv-list-header>
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
          <div className="min-w-0 lg:mr-auto">
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--ds-text-primary)] tracking-tight">
              {t('downloads.title')}
            </h1>
            <p className="text-sm text-[var(--ds-text-tertiary)]">
              {t('downloads.activeDownloads', { count: torrents.length, plural: torrents.length > 1 ? 's' : '' })}
            </p>
          </div>

          <div
            className="flex flex-wrap items-center gap-1.5"
            aria-label={t('settingsPages.librqbit.sessionStats')}
          >
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] px-2.5 py-1 text-xs text-[var(--ds-text-secondary)]">
              <Download className="h-3.5 w-3.5 text-[var(--ds-accent-violet)]" size={14} />
              <span className="font-semibold tabular-nums text-[var(--ds-text-primary)]">{heroDownloadSpeed}</span>
              {heroFetchedBytes != null && (
                <span className="text-[var(--ds-text-tertiary)]">· {formatBytes(heroFetchedBytes)}</span>
              )}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] px-2.5 py-1 text-xs text-[var(--ds-text-secondary)]">
              <Upload className="h-3.5 w-3.5 text-[var(--ds-accent-green)]" size={14} />
              <span className="font-semibold tabular-nums text-[var(--ds-text-primary)]">{heroUploadSpeed}</span>
              {heroUploadedBytes != null && (
                <span className="text-[var(--ds-text-tertiary)]">· {formatBytes(heroUploadedBytes)}</span>
              )}
            </span>
            {heroPeersLive != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] px-2.5 py-1 text-xs text-[var(--ds-text-secondary)]">
                <Users className="h-3.5 w-3.5" size={14} />
                {heroPeersLive} {t('downloads.stats.peers')}
              </span>
            )}
            {heroUptimeSeconds != null && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] px-2.5 py-1 text-xs text-[var(--ds-text-secondary)]">
                <Clock className="h-3.5 w-3.5" size={14} />
                {formatUptime(heroUptimeSeconds)}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddMagnetModal(true)}
              data-focusable
              tabIndex={0}
              className="inline-flex items-center gap-2 rounded-full ds-btn-accent px-3.5 py-2 text-sm font-semibold"
            >
              <Link2 className="h-4 w-4" size={16} />
              {t('downloads.addMagnetLink')}
            </button>
            <button
              type="button"
              onClick={handlePauseAll}
              data-focusable
              tabIndex={0}
              disabled={bulkBusy || pausableTorrents.length === 0}
              className="inline-flex items-center gap-2 rounded-full ds-btn-secondary px-3.5 py-2 text-sm font-semibold disabled:opacity-40"
            >
              <Pause className="h-4 w-4" size={16} />
              {t('downloads.pauseAll')}
            </button>
            <button
              type="button"
              onClick={handleResumeAll}
              data-focusable
              tabIndex={0}
              disabled={bulkBusy || resumableTorrents.length === 0}
              className="inline-flex items-center gap-2 rounded-full ds-btn-secondary px-3.5 py-2 text-sm font-semibold disabled:opacity-40"
            >
              <Play className="h-4 w-4" size={16} />
              {t('downloads.resumeAll')}
            </button>
            <button
              type="button"
              onClick={() => setShowSessionLogsModal(true)}
              data-focusable
              tabIndex={0}
              className="inline-flex items-center gap-2 rounded-full ds-btn-secondary px-3.5 py-2 text-sm font-semibold"
            >
              <LogsIcon className="h-4 w-4" size={16} />
              {t('downloads.logs')}
            </button>
          </div>
        </div>

        {torrents.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label={t('downloads.title')} data-tv-page-action>
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={filter === item.id}
                data-focusable
                tabIndex={0}
                onClick={() => setFilter(item.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${
                  filter === item.id
                    ? 'bg-[var(--ds-accent-violet)] text-[var(--ds-text-on-accent)] border-transparent'
                    : 'bg-[var(--ds-surface-elevated)] text-[var(--ds-text-secondary)] border-[var(--ds-border)] hover:border-[var(--ds-border-strong)]'
                }`}
              >
                {item.label}
                <span className="tabular-nums opacity-80">{item.count}</span>
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="pt-4 sm:pt-6 pb-12 flex-1 safe-area-bottom w-full min-w-0 max-w-full px-4 sm:px-8 lg:px-12">
        {torrents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 sm:py-24 text-center rounded-2xl border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)]">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mb-4 border border-[var(--ds-border)] bg-[var(--ds-surface)]">
               <HardDrive size={28} className="text-[var(--ds-text-tertiary)]" />
            </div>
            <h2 className="text-xl font-bold text-[var(--ds-text-primary)] mb-1">{t('downloads.noActiveDownloads')}</h2>
            <p className="text-[var(--ds-text-tertiary)] text-sm max-w-md mb-5">{t('downloads.torrentsWillAppear')}</p>
            <button
              type="button"
              onClick={() => setShowAddMagnetModal(true)}
              data-focusable
              tabIndex={0}
              className="inline-flex items-center gap-2 rounded-full ds-btn-accent px-4 py-2.5 text-sm font-semibold"
            >
              <Link2 className="h-4 w-4" size={16} />
              {t('downloads.addMagnetLink')}
            </button>
          </div>
        ) : filteredTorrents.length === 0 ? (
          <p className="text-sm text-[var(--ds-text-tertiary)] py-10 text-center">{t('downloads.noActiveDownloads')}</p>
        ) : (
          <div className="flex flex-col gap-2.5" data-tv-list>
            {filteredTorrents.map((torrent, index) => (
              <div
                key={torrent.info_hash}
                data-tv-list-item
                data-tv-initial-focus={index === 0 ? true : undefined}
              >
                <DownloadRow
                  torrent={torrent}
                  posterUrl={imageMap[torrent.info_hash.toLowerCase()]?.posterUrl}
                  backdropUrl={imageMap[torrent.info_hash.toLowerCase()]?.backdropUrl}
                  displayTitle={displayTitleMap[torrent.info_hash.toLowerCase()]}
                  busy={actingHash === torrent.info_hash || bulkBusy}
                  onOpenDetail={handleOpenDetail}
                  onPause={handlePauseOne}
                  onResume={handleResumeOne}
                  onRemove={(hash) => setPendingRemove({ hash, deleteFiles: true })}
                />
              </div>
            ))}
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
            className="w-full h-48 bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-2xl p-6 text-[var(--ds-text-primary)] placeholder:text-[var(--ds-text-tertiary)] focus:outline-none focus:border-[var(--ds-accent-violet)] transition-colors" 
            placeholder="magnet:?xt=urn:btih:..." 
            autoFocus
          />
          <div className="flex justify-end gap-4">
            <button 
              onClick={() => setShowAddMagnetModal(false)} 
              className="px-10 py-4 rounded-2xl bg-[var(--ds-surface)] hover:bg-[var(--ds-surface-overlay)] text-[var(--ds-text-primary)] font-bold transition-colors border border-[var(--ds-border)]"
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
              className="px-10 py-4 rounded-2xl bg-[var(--ds-accent-violet)] text-[var(--ds-text-on-accent)] font-bold"
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
          <div className="flex-1 overflow-y-auto bg-[var(--ds-surface)] rounded-3xl p-6 font-mono text-sm text-[var(--ds-text-secondary)] custom-scrollbar border border-[var(--ds-border)]">
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
          <div className="flex-1 overflow-y-auto bg-[var(--ds-surface)] rounded-3xl p-6 font-mono text-sm text-[var(--ds-text-secondary)] custom-scrollbar border border-[var(--ds-border)] whitespace-pre-wrap">
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