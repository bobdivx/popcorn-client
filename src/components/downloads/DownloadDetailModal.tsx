import { useEffect, useState } from 'preact/hooks';
import {
  ArrowLeft,
  Download,
  Upload,
  Sprout,
  Users,
  Play,
  Pause,
  Trash2,
  Film,
  Clock,
  HardDrive,
  Copy,
  PlusCircle,
  Settings2,
  ChevronDown,
  ChevronUp,
  FileText as LogsIcon,
} from 'lucide-preact';
import type { ClientTorrentStats } from '../../lib/client/types';
import { useI18n } from '../../lib/i18n/useI18n';
import { clientApi } from '../../lib/client/api';
import { TorrentStatusBadge } from '../torrents/ui';
import { formatBytes, formatSpeed, formatETA } from '../../lib/utils/formatBytes';
import { isTorrentActivelySeeding } from '../../lib/utils/torrentSeeding';
import { parseTmdbUserInput } from '../../lib/utils/parseTmdbUserInput';
import { Modal } from '../ui/Modal';
import { buildStrictTmdbDetailUrl } from '../../lib/utils/media-detail-url';

interface DownloadDetailModalProps {
  torrent: ClientTorrentStats;
  relatedTorrents?: ClientTorrentStats[];
  onClose: () => void;
  onPause: (infoHash: string) => void;
  onResume: (infoHash: string) => void;
  onRemove: (infoHash: string, deleteFiles: boolean) => Promise<boolean>;
  onShowLogs: (infoHash: string) => void;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  displayTitleByHash?: Record<string, string>;
  tmdbIdByHash?: Record<string, number>;
  tmdbTypeByHash?: Record<string, string>;
  onTmdbMetadataChanged?: (infoHash: string) => Promise<void>;
}

const StatCard = ({
  icon: Icon,
  label,
  value,
  colorClass,
}: {
  icon: typeof Download;
  label: string;
  value: string | number;
  colorClass: string;
}) => (
  <div className="dl-detail-stat rounded-2xl tv:rounded-3xl border border-white/10 bg-black/30 backdrop-blur-md px-3 py-3 sm:px-4 sm:py-4 tv:px-5 tv:py-5 flex flex-col gap-1.5 min-w-0 overflow-hidden transition-colors hover:border-white/20 hover:bg-black/40">
    <div className="flex items-center gap-1.5 sm:gap-2 text-white/45 min-w-0">
      <Icon size={16} className={`${colorClass} shrink-0 tv:w-5 tv:h-5`} />
      <span className="text-[10px] sm:text-xs tv:text-sm font-semibold uppercase tracking-wider truncate">{label}</span>
    </div>
    <div className="text-base sm:text-xl tv:text-2xl font-bold text-white tracking-tight truncate tabular-nums">
      {value}
    </div>
  </div>
);

const ActionTile = ({
  icon: Icon,
  label,
  onClick,
  className = '',
  danger = false,
  primary = false,
  ...rest
}: {
  icon: typeof Play;
  label: string;
  onClick: () => void;
  className?: string;
  danger?: boolean;
  primary?: boolean;
  [key: string]: unknown;
}) => (
  <button
    type="button"
    data-focusable
    tabIndex={0}
    {...rest}
    onClick={onClick}
    className={`gtv-pill-btn ds-focus-glow group flex min-w-0 flex-col items-center justify-center p-4 sm:p-5 tv:p-6 min-h-[88px] tv:min-h-[112px] rounded-2xl tv:rounded-3xl border transition-[opacity,transform,background-color,border-color] duration-200 gap-2.5 sm:gap-3
      ${
        danger
          ? 'bg-red-500/10 border-red-500/25 hover:bg-red-500/20 hover:border-red-500/40'
          : primary
            ? 'bg-[var(--ds-accent-violet)]/20 border-[var(--ds-accent-violet)]/40 hover:bg-[var(--ds-accent-violet)]/30'
            : 'bg-white/[0.04] border-white/12 hover:border-white/25 hover:bg-white/[0.08]'
      } ${className}`}
  >
    <div
      className={`p-3 tv:p-4 rounded-full transition-transform group-hover:scale-110 ${
        danger
          ? 'bg-red-500/20 text-red-400'
          : primary
            ? 'bg-[var(--ds-accent-violet)] text-[var(--ds-text-on-accent)]'
            : 'bg-black/35 text-white border border-white/12'
      }`}
    >
      <Icon size={24} className="tv:w-7 tv:h-7" />
    </div>
    <span
      className={`text-sm tv:text-lg font-bold tracking-wide ${
        danger ? 'text-red-400' : 'text-white'
      }`}
    >
      {label}
    </span>
  </button>
);

export function DownloadDetailModal({
  torrent,
  relatedTorrents,
  onClose,
  onPause,
  onResume,
  onRemove,
  onShowLogs,
  posterUrl,
  backdropUrl,
  displayTitleByHash,
  tmdbIdByHash,
  tmdbTypeByHash,
  onTmdbMetadataChanged,
}: DownloadDetailModalProps) {
  const { t } = useI18n();
  const [activeInfoHash, setActiveInfoHash] = useState<string>(torrent.info_hash);

  const [statsV1, setStatsV1] = useState<Record<string, any> | null>(null);
  const [downloadPath, setDownloadPath] = useState<string | null>(null);
  const [trackers, setTrackers] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newTrackerUrl, setNewTrackerUrl] = useState('');
  const [addTrackerLoading, setAddTrackerLoading] = useState(false);
  const [tmdbIdInput, setTmdbIdInput] = useState('');
  const [tmdbTypeSel, setTmdbTypeSel] = useState<'movie' | 'tv'>('movie');
  const [tmdbBusy, setTmdbBusy] = useState(false);
  const [tmdbError, setTmdbError] = useState<string | null>(null);
  const modalTorrents = relatedTorrents && relatedTorrents.length > 0 ? relatedTorrents : [torrent];
  const activeTorrent = modalTorrents.find((x) => x.info_hash === activeInfoHash) || torrent;
  const keyLower = activeTorrent.info_hash.toLowerCase();
  const isLocalStub = activeTorrent.info_hash.startsWith('local_');
  const headerTitle =
    (displayTitleByHash?.[keyLower]?.trim() ||
      (typeof activeTorrent.tmdb_title === 'string' && activeTorrent.tmdb_title.trim()) ||
      activeTorrent.name) as string;

  const getTorrentDetailUrl = (item: ClientTorrentStats): string => {
    const key = item.info_hash.toLowerCase();
    const idFromMap = tmdbIdByHash?.[key];
    const tmdbId = item.tmdb_id ?? idFromMap ?? null;
    const tmdbTypeRaw = (item.tmdb_type || tmdbTypeByHash?.[key] || '').toString().toLowerCase();
    const tmdbType = tmdbTypeRaw === 'tv' || tmdbTypeRaw === 'movie' ? tmdbTypeRaw : null;
    const title = (displayTitleByHash?.[key] || item.tmdb_title || item.name || '').trim();
    return buildStrictTmdbDetailUrl({
      tmdbId: typeof tmdbId === 'number' && Number.isFinite(tmdbId) ? tmdbId : null,
      type: tmdbType,
      from: 'downloads',
      title: title || null,
      infoHash: item.info_hash || null,
    });
  };

  useEffect(() => {
    setActiveInfoHash(torrent.info_hash);
  }, [torrent.info_hash]);

  useEffect(() => {
    setTmdbError(null);
    if (isLocalStub) {
      setTmdbIdInput('');
      return;
    }
    const idFromMap = tmdbIdByHash?.[keyLower];
    const idSync = activeTorrent.tmdb_id ?? idFromMap;
    setTmdbIdInput(idSync != null && Number.isFinite(Number(idSync)) ? String(idSync) : '');
    setTmdbTypeSel(activeTorrent.tmdb_type === 'tv' ? 'tv' : 'movie');

    let cancelled = false;
    void (async () => {
      const full = await clientApi.getTorrent(activeTorrent.info_hash);
      if (cancelled || !full) return;
      const id = full.tmdb_id ?? idFromMap ?? activeTorrent.tmdb_id;
      if (id != null && Number.isFinite(Number(id))) {
        setTmdbIdInput(String(id));
      }
      if (full.tmdb_type === 'tv' || full.tmdb_type === 'movie') {
        setTmdbTypeSel(full.tmdb_type);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeTorrent.info_hash,
    activeTorrent.tmdb_id,
    activeTorrent.tmdb_type,
    keyLower,
    tmdbIdByHash,
    isLocalStub,
  ]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStatsV1(await clientApi.getTorrentStatsV1(activeTorrent.info_hash));
      } catch {
        /* ignore */
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => clearInterval(interval);
  }, [activeTorrent.info_hash]);

  useEffect(() => {
    (async () => {
      try {
        setDownloadPath(await clientApi.getTorrentDownloadPath(activeTorrent.info_hash));
        setTrackers(await clientApi.getTorrentTrackers(activeTorrent.info_hash));
      } catch {
        /* ignore */
      }
    })();
  }, [activeTorrent.info_hash]);

  const live = statsV1?.live;
  const downSpeed = live?.download_speed?.human_readable || formatSpeed(activeTorrent.download_speed);
  const upSpeed = live?.upload_speed?.human_readable || formatSpeed(activeTorrent.upload_speed);
  const eta = live?.time_remaining?.human_readable || formatETA(activeTorrent.eta_seconds);
  const peers = live?.snapshot?.peer_stats?.live ?? (activeTorrent.peers_connected || 0);
  const activeSeeding = isTorrentActivelySeeding(activeTorrent);
  const sharingStatusLabel =
    activeTorrent.state === 'seeding'
      ? activeSeeding
        ? 'Partage actif'
        : 'Partage (idle)'
      : 'Hors partage';
  const progressPercent = Math.round((activeTorrent.progress ?? 0) * 1000) / 10;
  const heroImage = backdropUrl || posterUrl;

  const handleAddTracker = async () => {
    if (!newTrackerUrl.trim()) return;
    setAddTrackerLoading(true);
    try {
      await clientApi.addTracker(activeTorrent.info_hash, newTrackerUrl.trim());
      setTrackers(await clientApi.getTorrentTrackers(activeTorrent.info_hash));
      setNewTrackerUrl('');
    } catch {
      /* ignore */
    } finally {
      setAddTrackerLoading(false);
    }
  };

  const runTmdbAction = async (fn: () => Promise<void>) => {
    if (isLocalStub) return;
    setTmdbBusy(true);
    setTmdbError(null);
    try {
      await fn();
      await onTmdbMetadataChanged?.(activeTorrent.info_hash);
    } catch (e) {
      setTmdbError(e instanceof Error ? e.message : t('downloads.tmdb.error'));
    } finally {
      setTmdbBusy(false);
    }
  };

  const normalizeTmdbInputField = (raw: string) => {
    const parsed = parseTmdbUserInput(raw);
    if (parsed.ok) {
      setTmdbIdInput(String(parsed.id));
      if (parsed.typeHint) setTmdbTypeSel(parsed.typeHint);
      setTmdbError(null);
      return true;
    }
    return false;
  };

  const handleTmdbApply = () => {
    const parsed = parseTmdbUserInput(tmdbIdInput);
    if (!parsed.ok) {
      setTmdbError(
        t(parsed.reason === 'empty' ? 'downloads.tmdb.emptyId' : 'downloads.tmdb.invalidInput'),
      );
      return;
    }
    const typ = parsed.typeHint ?? tmdbTypeSel;
    void runTmdbAction(() =>
      clientApi.setDownloadTmdbOverride(activeTorrent.info_hash, parsed.id, typ),
    );
  };

  const handleTmdbRematch = () => {
    void runTmdbAction(() => clientApi.rematchDownloadTmdb(activeTorrent.info_hash));
  };

  const handleTmdbReset = () => {
    void runTmdbAction(() => clientApi.clearDownloadTmdbOverride(activeTorrent.info_hash));
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      size="full"
      scrollable={true}
      noPadding={true}
      className="p-0 sm:p-0 dl-detail-modal"
    >
      <div
        className="relative flex min-h-0 min-w-0 flex-col overflow-x-hidden h-full max-sm:overflow-hidden sm:h-auto lg:h-full lg:overflow-hidden bg-[var(--ds-surface)]"
        data-dl-detail
      >
        {heroImage && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
            <div
              className="absolute inset-0 bg-cover bg-center scale-110 opacity-40 blur-2xl"
              style={{ backgroundImage: `url(${heroImage})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-[var(--ds-surface)]/85 to-[var(--ds-surface)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,106,225,0.18),transparent_50%)]" />
          </div>
        )}

        {/* Top bar */}
        <div className="relative z-20 flex min-w-0 items-center justify-between gap-3 px-4 sm:px-8 tv:px-12 py-3 sm:py-4 border-b border-white/10 bg-black/25 backdrop-blur-md flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="gtv-pill-btn ds-focus-glow inline-flex items-center gap-2 text-white/75 hover:text-white transition-colors px-3 py-2 tv:px-5 tv:py-3 rounded-full border border-white/12 bg-black/30"
            data-focusable
            aria-label="Fermer"
          >
            <ArrowLeft size={20} className="tv:w-6 tv:h-6" />
            <span className="font-semibold hidden sm:inline tv:text-lg">{t('common.back')}</span>
          </button>
          <TorrentStatusBadge
            state={activeTorrent.state}
            seedingActive={activeSeeding}
            className="px-3 py-1.5 tv:px-4 tv:py-2 rounded-full text-xs tv:text-sm font-bold tracking-wide bg-black/45 border border-white/15 text-white/90 backdrop-blur-md"
          />
        </div>

        <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto sm:overflow-visible lg:flex-row lg:overflow-hidden">
          {/* Left — hero media */}
          <aside className="w-full min-w-0 flex-shrink-0 border-b border-white/10 lg:w-[min(22rem,34vw)] tv:lg:w-[min(26rem,32vw)] lg:border-b-0 lg:border-r lg:overflow-y-auto custom-scrollbar">
            <div className="relative aspect-video lg:aspect-[2/3] w-full overflow-hidden bg-black/40">
              {posterUrl ? (
                <img
                  src={posterUrl}
                  className="absolute inset-0 w-full h-full object-cover"
                  alt={headerTitle}
                />
              ) : backdropUrl ? (
                <img
                  src={backdropUrl}
                  className="absolute inset-0 w-full h-full object-cover"
                  alt=""
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white/10 via-black/50 to-black/90">
                  <Film size={72} className="text-white/25" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent lg:from-black/80" />
              <div className="absolute left-4 right-4 bottom-4 lg:left-5 lg:right-5 lg:bottom-5 z-10">
                <div className="flex items-end justify-between gap-3 mb-2">
                  <span className="text-2xl tv:text-4xl font-bold tabular-nums text-white drop-shadow-md">
                    {progressPercent.toFixed(0)}%
                  </span>
                  <span className="text-xs tv:text-sm text-white/65 font-medium tabular-nums">
                    {formatBytes(activeTorrent.total_bytes)}
                  </span>
                </div>
                <div className="h-1.5 tv:h-2.5 w-full overflow-hidden rounded-full bg-white/15">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${
                      activeTorrent.state === 'downloading'
                        ? 'from-[var(--ds-accent-violet)] to-sky-400'
                        : 'from-[var(--ds-accent-green)] to-emerald-300'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6 tv:p-7 space-y-5">
              <h1 className="text-xl sm:text-2xl tv:text-3xl font-bold text-white leading-tight line-clamp-3">
                {headerTitle}
              </h1>

              {modalTorrents.length > 1 && (
                <div>
                  <label className="block text-[10px] tv:text-xs font-bold uppercase tracking-widest text-white/40 mb-2">
                    Épisode / Fichier ({modalTorrents.length})
                  </label>
                  <select
                    value={activeInfoHash}
                    onChange={(e) => setActiveInfoHash((e.target as HTMLSelectElement).value)}
                    data-focusable
                    className="w-full bg-black/35 border border-white/12 rounded-xl tv:rounded-2xl px-3 py-2.5 tv:py-3.5 text-sm tv:text-base text-white focus:outline-none focus:border-[var(--ds-accent-violet)]"
                  >
                    {modalTorrents.map((item) => (
                      <option key={item.info_hash} value={item.info_hash}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <p className="text-sm tv:text-base text-white/50 tabular-nums">
                {formatBytes(activeTorrent.downloaded_bytes)}
                {activeTorrent.total_bytes > 0
                  ? ` / ${formatBytes(activeTorrent.total_bytes)}`
                  : ''}
              </p>
            </div>
          </aside>

          {/* Right — stats & actions */}
          <div className="min-w-0 flex-1 overflow-x-hidden p-4 sm:p-8 tv:p-10 lg:overflow-y-auto custom-scrollbar">
            <div className="mb-7 grid grid-cols-2 gap-2.5 sm:gap-3 lg:mb-9 lg:grid-cols-5 tv:gap-4">
              <StatCard
                icon={Download}
                label="Téléchargement"
                value={downSpeed}
                colorClass="text-[var(--ds-accent-violet)]"
              />
              <StatCard
                icon={Upload}
                label="Envoi"
                value={upSpeed}
                colorClass="text-[var(--ds-accent-green)]"
              />
              <StatCard
                icon={Sprout}
                label="Partage"
                value={sharingStatusLabel}
                colorClass={
                  activeTorrent.state === 'seeding'
                    ? 'text-[var(--ds-accent-green)]'
                    : 'text-white/40'
                }
              />
              <StatCard
                icon={Users}
                label="Pairs"
                value={peers}
                colorClass="text-[var(--ds-accent-violet)]"
              />
              <StatCard
                icon={Clock}
                label="Temps restant"
                value={eta}
                colorClass="text-[var(--ds-accent-yellow)]"
              />
            </div>

            <div className="mb-7 lg:mb-9">
              <h2 className="text-xs tv:text-sm font-bold uppercase tracking-widest text-white/40 mb-3 tv:mb-4">
                Commandes
              </h2>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-4 tv:gap-4">
                <ActionTile
                  icon={Play}
                  label="Lire"
                  primary
                  data-focusable
                  data-autofocus
                  onClick={() => {
                    window.location.href = getTorrentDetailUrl(activeTorrent);
                  }}
                />
                {activeTorrent.state === 'paused' || activeTorrent.state === 'error' ? (
                  <ActionTile
                    icon={Play}
                    label="Reprendre"
                    onClick={() => onResume(activeTorrent.info_hash)}
                    className="bg-emerald-500/10 border-emerald-500/25"
                  />
                ) : (
                  <ActionTile
                    icon={Pause}
                    label="Pause"
                    onClick={() => onPause(activeTorrent.info_hash)}
                  />
                )}
                <ActionTile
                  icon={LogsIcon}
                  label="Logs"
                  onClick={() => onShowLogs(activeTorrent.info_hash)}
                />
                <ActionTile
                  icon={Trash2}
                  label="Supprimer"
                  onClick={() => onRemove(activeTorrent.info_hash, false)}
                  danger
                />
              </div>
            </div>

            <div className="rounded-2xl tv:rounded-3xl border border-white/10 bg-black/25 backdrop-blur-md overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between p-5 sm:p-6 tv:p-7 hover:bg-white/[0.04] transition-colors ds-focus-glow"
                data-focusable
              >
                <div className="flex items-center gap-3 tv:gap-4">
                  <div className="p-2.5 tv:p-3.5 bg-black/40 rounded-xl tv:rounded-2xl text-white/70 border border-white/12">
                    <Settings2 size={20} className="tv:w-6 tv:h-6" />
                  </div>
                  <span className="font-bold text-white tv:text-xl">Informations techniques</span>
                </div>
                {showAdvanced ? (
                  <ChevronUp className="text-white/40 tv:w-7 tv:h-7" />
                ) : (
                  <ChevronDown className="text-white/40 tv:w-7 tv:h-7" />
                )}
              </button>

              {showAdvanced && (
                <div className="px-5 sm:px-6 tv:px-7 pb-6 tv:pb-8 space-y-7 border-t border-white/8">
                  {!isLocalStub && (
                    <div className="pt-5 space-y-4">
                      <h3 className="text-xs tv:text-sm font-bold uppercase tracking-widest text-white/40">
                        {t('downloads.tmdb.sectionTitle')}
                      </h3>
                      <p className="text-sm tv:text-base text-white/60">{t('downloads.tmdb.hint')}</p>
                      <p className="text-xs tv:text-sm text-white/40">{t('downloads.tmdb.inputHelp')}</p>
                      {tmdbError && <p className="text-sm text-red-400">{tmdbError}</p>}
                      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                        <div className="flex-1 space-y-1.5">
                          <label className="text-[10px] tv:text-xs font-bold uppercase tracking-widest text-white/40">
                            {t('downloads.tmdb.idLabel')}
                          </label>
                          <input
                            type="text"
                            inputMode="text"
                            autoComplete="off"
                            value={tmdbIdInput}
                            onChange={(e) => setTmdbIdInput((e.target as HTMLInputElement).value)}
                            onBlur={() => {
                              if (tmdbIdInput.trim()) normalizeTmdbInputField(tmdbIdInput);
                            }}
                            className="w-full bg-black/35 border border-white/12 rounded-xl tv:rounded-2xl px-4 py-2.5 tv:py-3.5 text-sm tv:text-base text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--ds-accent-violet)]"
                            placeholder={t('downloads.tmdb.idPlaceholder')}
                            disabled={tmdbBusy}
                            data-focusable
                          />
                        </div>
                        <div className="sm:w-44 space-y-1.5">
                          <label className="text-[10px] tv:text-xs font-bold uppercase tracking-widest text-white/40">
                            {t('downloads.tmdb.typeLabel')}
                          </label>
                          <select
                            value={tmdbTypeSel}
                            onChange={(e) =>
                              setTmdbTypeSel(
                                (e.target as HTMLSelectElement).value === 'tv' ? 'tv' : 'movie',
                              )
                            }
                            className="w-full bg-black/35 border border-white/12 rounded-xl tv:rounded-2xl px-3 py-2.5 tv:py-3.5 text-sm tv:text-base text-white focus:outline-none focus:border-[var(--ds-accent-violet)]"
                            disabled={tmdbBusy}
                            data-focusable
                          >
                            <option value="movie">{t('downloads.tmdb.typeMovie')}</option>
                            <option value="tv">{t('downloads.tmdb.typeTv')}</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex min-w-0 flex-wrap gap-2.5 tv:gap-3">
                        <button
                          type="button"
                          onClick={handleTmdbApply}
                          disabled={tmdbBusy}
                          className="gtv-pill-btn ds-focus-glow px-4 py-2.5 tv:px-6 tv:py-3.5 rounded-full ds-btn-accent text-sm tv:text-base font-bold disabled:opacity-50"
                          data-focusable
                        >
                          {tmdbBusy ? t('downloads.tmdb.busy') : t('downloads.tmdb.apply')}
                        </button>
                        <button
                          type="button"
                          onClick={handleTmdbRematch}
                          disabled={tmdbBusy}
                          className="gtv-pill-btn ds-focus-glow px-4 py-2.5 tv:px-6 tv:py-3.5 rounded-full ds-btn-secondary text-sm tv:text-base font-semibold disabled:opacity-50"
                          data-focusable
                        >
                          {t('downloads.tmdb.rematch')}
                        </button>
                        <button
                          type="button"
                          onClick={handleTmdbReset}
                          disabled={tmdbBusy}
                          className="gtv-pill-btn ds-focus-glow px-4 py-2.5 tv:px-6 tv:py-3.5 rounded-full bg-red-500/10 border border-red-500/25 text-red-400 text-sm tv:text-base font-semibold disabled:opacity-50"
                          data-focusable
                        >
                          {t('downloads.tmdb.reset')}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className={`grid gap-5 ${isLocalStub ? 'pt-5' : ''}`}>
                    <div className="space-y-2">
                      <label className="text-[10px] tv:text-xs font-bold uppercase tracking-widest text-white/40">
                        Lien du torrent (info hash)
                      </label>
                      <div className="flex items-center gap-3 bg-black/35 p-3 tv:p-4 rounded-xl tv:rounded-2xl border border-white/12">
                        <span className="font-mono text-sm tv:text-base text-white/70 truncate flex-1">
                          {activeTorrent.info_hash}
                        </span>
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(activeTorrent.info_hash)}
                          className="p-2.5 tv:p-3.5 hover:bg-white/10 rounded-lg text-white/50 transition-colors ds-focus-glow"
                          data-focusable
                          aria-label="Copier"
                        >
                          <Copy size={16} className="tv:w-5 tv:h-5" />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] tv:text-xs font-bold uppercase tracking-widest text-white/40">
                        Chemin de téléchargement
                      </label>
                      <div className="flex items-center gap-3 bg-black/35 p-3 tv:p-4 rounded-xl tv:rounded-2xl border border-white/12 text-white/65 text-sm tv:text-base font-mono break-all">
                        <HardDrive size={16} className="shrink-0 tv:w-5 tv:h-5" />
                        {downloadPath || 'Chemin inconnu'}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-[10px] tv:text-xs font-bold uppercase tracking-widest text-white/40">
                        Trackers actifs
                      </label>
                      <span className="text-xs tv:text-sm bg-black/35 px-2.5 py-1 rounded-full text-white/45 border border-white/10">
                        {trackers.length} actifs
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTrackerUrl}
                        onChange={(e: any) => setNewTrackerUrl(e.target.value)}
                        placeholder="Ajouter un tracker (URL)..."
                        className="flex-1 bg-black/35 border border-white/12 rounded-xl tv:rounded-2xl px-4 py-2.5 tv:py-3.5 text-sm tv:text-base text-white placeholder:text-white/30 focus:outline-none focus:border-[var(--ds-accent-violet)]"
                        data-focusable
                      />
                      <button
                        type="button"
                        onClick={handleAddTracker}
                        disabled={addTrackerLoading}
                        className="p-2.5 tv:p-3.5 bg-[var(--ds-accent-violet)] rounded-xl tv:rounded-2xl text-[var(--ds-text-on-accent)] hover:opacity-90 disabled:opacity-50 ds-focus-glow"
                        data-focusable
                        aria-label="Ajouter tracker"
                      >
                        <PlusCircle size={20} className="tv:w-6 tv:h-6" />
                      </button>
                    </div>
                    <ul className="max-h-36 overflow-y-auto space-y-1 pr-2 custom-scrollbar">
                      {trackers.map((tracker, i) => (
                        <li
                          key={i}
                          className="text-[10px] tv:text-xs font-mono text-white/40 truncate py-1.5 border-b border-white/8 last:border-0"
                        >
                          {tracker}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
