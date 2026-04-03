import { useEffect, useRef, useState, useCallback } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { ArrowLeft, Download, Upload, Sprout, Users, Play, Pause, Trash2, Info, LogsIcon, Film, Clock, HardDrive, Copy, X, Pencil, PlusCircle, ExternalLink } from 'lucide-preact';
import type { ClientTorrentStats } from '../../lib/client/types';
import { useI18n } from '../../lib/i18n/useI18n';
import { clientApi } from '../../lib/client/api';
import { TorrentProgressBar, TorrentStatusBadge } from '../torrents/ui';
import { formatBytes, formatSpeed, formatETA } from '../../lib/utils/formatBytes';
import { saveDownloadClientStats } from '../../lib/utils/download-meta-storage';

interface DownloadDetailModalProps {
  torrent: ClientTorrentStats;
  onClose: () => void;
  onPause: (infoHash: string) => void;
  onResume: (infoHash: string) => void;
  onRemove: (infoHash: string, deleteFiles: boolean) => Promise<boolean>;
  onShowLogs: (infoHash: string) => void;
  posterUrl?: string | null;
  backdropUrl?: string | null;
}

export function DownloadDetailModal({ 
  torrent, 
  onClose, 
  onPause, 
  onResume, 
  onRemove, 
  onShowLogs,
  posterUrl,
  backdropUrl 
}: DownloadDetailModalProps) {
  const { t } = useI18n();
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const isRemovingRef = useRef(false);
  const [statsV1, setStatsV1] = useState<Record<string, unknown> | null>(null);
  const [downloadPath, setDownloadPath] = useState<string | null>(null);
  const [downloadPathError, setDownloadPathError] = useState<string | null>(null);
  const [trackers, setTrackers] = useState<string[]>([]);
  const [trackersLoading, setTrackersLoading] = useState(false);
  const [editTrackersOpen, setEditTrackersOpen] = useState(false);
  const [newTrackerUrl, setNewTrackerUrl] = useState('');
  const [addTrackerLoading, setAddTrackerLoading] = useState(false);
  const [trackerMessage, setTrackerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editPanelOpen, setEditPanelOpen] = useState(false);

  useEffect(() => {
    const fetchStatsV1 = async () => {
      const v = await clientApi.getTorrentStatsV1(torrent.info_hash);
      setStatsV1(v);
    };
    fetchStatsV1();
    const interval = setInterval(fetchStatsV1, 4000);
    return () => clearInterval(interval);
  }, [torrent.info_hash]);

  useEffect(() => {
    let cancelled = false;
    const fetchPath = async () => {
      try {
        const path = await clientApi.getTorrentDownloadPath(torrent.info_hash);
        if (cancelled) return;
        setDownloadPath(path || '');
        setDownloadPathError(null);
      } catch (err) {
        if (cancelled) return;
        console.error('Erreur lors de la récupération du chemin de téléchargement:', err);
        setDownloadPath(null);
        setDownloadPathError(err instanceof Error ? err.message : null);
      }
    };
    fetchPath();
    return () => {
      cancelled = true;
    };
  }, [torrent.info_hash]);

  const loadTrackers = useCallback(async () => {
    setTrackersLoading(true);
    try {
      const list = await clientApi.getTorrentTrackers(torrent.info_hash);
      setTrackers(Array.isArray(list) ? list : []);
    } catch {
      setTrackers([]);
    } finally {
      setTrackersLoading(false);
    }
  }, [torrent.info_hash]);

  useEffect(() => {
    loadTrackers();
  }, [loadTrackers]);

  const handleAddTracker = async () => {
    const url = newTrackerUrl.trim();
    if (!url) return;
    setAddTrackerLoading(true);
    setTrackerMessage(null);
    try {
      await clientApi.addTracker(torrent.info_hash, url);
      setTrackerMessage({ type: 'success', text: t('downloads.trackerAdded') });
      setNewTrackerUrl('');
      await loadTrackers();
    } catch (err) {
      setTrackerMessage({ type: 'error', text: err instanceof Error ? err.message : t('downloads.trackerAddError') });
    } finally {
      setAddTrackerLoading(false);
    }
  };

  const live = statsV1?.live as Record<string, unknown> | undefined;
  const snapshot = live?.snapshot as Record<string, unknown> | undefined;
  const ps = snapshot?.peer_stats as Record<string, unknown> | undefined;
  const downSpeed = (live?.download_speed as { human_readable?: string } | undefined)?.human_readable;
  const upSpeed = (live?.upload_speed as { human_readable?: string } | undefined)?.human_readable;
  const timeRem = live?.time_remaining as { human_readable?: string } | null | undefined;
  const etaStr = timeRem?.human_readable ?? null;
  const peersLive = typeof ps?.live === 'number' ? (ps.live as number) : null;

  // Focus sur le bouton retour à l'ouverture
  useEffect(() => {
    if (closeButtonRef.current) {
      closeButtonRef.current.focus();
    }
  }, []);

  // Gestion du bouton retour TV et Escape (pas Backspace dans un champ de saisie)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === 'Backspace' && inInput) return; // Laisser supprimer le texte
      if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'BrowserBack' || e.key === 'GoBack') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    // Écouter l'événement webOS back
    const handleWebOSBack = () => {
      onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    if (window.webOS) {
      window.addEventListener('webosback', handleWebOSBack);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (window.webOS) {
        window.removeEventListener('webosback', handleWebOSBack);
      }
    };
  }, [onClose]);

  const progressColor = torrent.state === 'downloading' ? 'blue' as const :
                        torrent.state === 'seeding' ? 'green' as const :
                        torrent.state === 'completed' ? 'green' as const :
                        'gray' as const;

  const handleRemoveAndClose = async (deleteFiles: boolean) => {
    if (isRemovingRef.current) return;
    isRemovingRef.current = true;
    try {
      const removed = await onRemove(torrent.info_hash, deleteFiles);
      if (removed) {
        onClose();
      }
    } finally {
      isRemovingRef.current = false;
    }
  };

  return createPortal(
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="download-detail-title"
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 tv:p-8 overflow-y-auto overflow-x-hidden min-h-dvh"
      onClick={(e) => {
        if (e.target === modalRef.current) {
          onClose();
        }
      }}
      onKeyDown={(e) => {
        const target = e.target as HTMLElement;
        const inInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
        if (e.key === 'Backspace' && inInput) return; // Laisser supprimer le texte
        if (e.key === 'Escape' || e.key === 'Backspace') {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-[calc(100vw-1.5rem)] sm:max-w-6xl tv:max-w-7xl max-h-[calc(100dvh-1.5rem)] ds-modal-glass overflow-hidden flex flex-col min-w-0">
        {/* Barre gradient en tête (design C411) */}
        <div className="ds-card-bar flex-shrink-0" aria-hidden />

        {/* Image backdrop optionnelle en arrière-plan */}
        {backdropUrl && (
          <>
            <div
              className="absolute inset-0 opacity-20 z-0"
              style={{
                backgroundImage: `url(${backdropUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(40px)',
                transform: 'scale(1.1)',
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/50 z-0" />
          </>
        )}

        <div className="relative z-10 flex flex-col min-h-0 flex-1 overflow-hidden">
          {/* En-tête : bordure ds, boutons avec tokens design system */}
          <div className="flex items-center justify-between gap-2 ds-card-section border-b border-[var(--ds-border)] flex-shrink-0 min-h-[48px] sm:min-h-0">
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="flex items-center gap-2 px-3 py-2 sm:px-4 tv:px-6 tv:py-3 rounded-[var(--ds-radius-sm)] text-[var(--ds-text-primary)] bg-[var(--ds-surface-overlay)] hover:bg-[var(--ds-surface-elevated)] text-sm tv:text-base font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] min-h-[var(--ds-touch-target)] min-w-[var(--ds-touch-target)] sm:min-w-0 justify-center tv:justify-start"
              tabIndex={0}
              data-focusable
              aria-label={t('common.back')}
            >
              <ArrowLeft className="w-5 h-5 tv:w-5 tv:h-5 shrink-0" size={20} />
              <span className="hidden sm:inline">{t('common.back')}</span>
            </button>

            <TorrentStatusBadge state={torrent.state} className="shrink-0 px-3 py-1.5 sm:px-4 sm:py-2 tv:px-6 tv:py-3 text-xs sm:text-sm tv:text-base" />

            <button
              onClick={onClose}
              className="flex items-center justify-center gap-1.5 px-3 py-2 sm:px-4 tv:px-6 tv:py-3 rounded-[var(--ds-radius-sm)] text-[var(--ds-text-primary)] bg-[var(--ds-surface-overlay)] hover:bg-[var(--ds-surface-elevated)] text-sm tv:text-base font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] min-h-[var(--ds-touch-target)] min-w-[var(--ds-touch-target)] sm:min-w-0"
              tabIndex={0}
              data-focusable
              aria-label={t('common.close')}
            >
              <X className="w-5 h-5 sm:w-4 sm:h-4 tv:w-5 tv:h-5 shrink-0" size={20} />
              <span className="hidden sm:inline">{t('common.close')}</span>
            </button>
          </div>

          {/* Contenu principal */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 tv:gap-8 ds-card-section overflow-y-auto overscroll-contain min-h-0 flex-1 pt-0">
            {/* Colonne gauche : sur mobile = bandeau compact (poster petit + titre + progression) */}
            <div className="lg:col-span-1 flex flex-col">
              <div className="flex gap-3 sm:flex-col mb-0 sm:mb-4 lg:mb-6 tv:mb-8">
                {/* Poster : petite vignette sur mobile, pleine largeur à partir de sm */}
                <div className="w-20 h-[7.5rem] flex-shrink-0 sm:w-full sm:max-w-[200px] lg:max-w-none sm:aspect-[2/3] rounded-lg sm:rounded-xl tv:rounded-2xl overflow-hidden shadow-lg sm:shadow-2xl">
                  {posterUrl ? (
                    <img
                      src={posterUrl}
                      alt={torrent.name}
                      className="w-full h-full object-cover"
                      loading="eager"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                      <Film className="w-8 h-8 sm:w-16 sm:h-16 tv:w-20 tv:h-20 text-gray-400" />
                    </div>
                  )}
                </div>
                {/* Titre + progression : à droite du poster sur mobile, en dessous sur sm+ */}
                <div className="min-w-0 flex-1 flex flex-col justify-center sm:justify-start">
                  <h2 id="download-detail-title" className="text-base sm:text-xl tv:text-3xl font-bold text-[var(--ds-text-primary)] line-clamp-3 mb-2 sm:mb-4">
                    {torrent.name}
                  </h2>
                  <TorrentProgressBar
                    progress={torrent.progress}
                    downloadedBytes={torrent.downloaded_bytes}
                    totalBytes={torrent.total_bytes}
                    statusLabel={t('downloads.progress')}
                    variant="compact"
                    progressColor={progressColor}
                  />
                </div>
              </div>
            </div>

            {/* Colonne droite : Détails et actions */}
            <div className="lg:col-span-2 space-y-4 sm:space-y-6 tv:space-y-8">
              {/* Statistiques : grille 2x2 sur mobile, padding réduit */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 tv:gap-6">
                {/* Download speed */}
                <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-overlay)] p-3 sm:p-4 tv:p-6">
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                    <Download className="w-4 h-4 sm:w-5 sm:h-5 tv:w-6 tv:h-6 text-blue-400 shrink-0" size={24} />
                    <span className="text-xs tv:text-sm text-[var(--ds-text-secondary)] truncate">{t('downloads.stats.downloadSpeed')}</span>
                  </div>
                  <p className="text-sm sm:text-lg tv:text-xl font-bold text-[var(--ds-text-primary)] truncate">
                    {downSpeed ?? (torrent.download_speed > 0 ? formatSpeed(torrent.download_speed) : '0 B/s')}
                  </p>
                </div>

                {/* Upload speed */}
                <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-overlay)] p-3 sm:p-4 tv:p-6">
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                    <Upload className="w-4 h-4 sm:w-5 sm:h-5 tv:w-6 tv:h-6 text-green-400 shrink-0" size={24} />
                    <span className="text-xs tv:text-sm text-[var(--ds-text-secondary)] truncate">{t('downloads.stats.uploadSpeed')}</span>
                  </div>
                  <p className="text-sm sm:text-lg tv:text-xl font-bold text-[var(--ds-text-primary)] truncate">
                    {upSpeed ?? (torrent.upload_speed > 0 ? formatSpeed(torrent.upload_speed) : '0 B/s')}
                  </p>
                </div>

                {/* Seeds */}
                <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-overlay)] p-3 sm:p-4 tv:p-6">
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                    <Sprout className="w-4 h-4 sm:w-5 sm:h-5 tv:w-6 tv:h-6 text-green-400 shrink-0" size={24} />
                    <span className="text-xs tv:text-sm text-[var(--ds-text-secondary)] truncate">{t('downloads.stats.seeds') || t('downloads.stats.seeders') || 'Graines'}</span>
                  </div>
                  <p className="text-sm sm:text-lg tv:text-xl font-bold text-[var(--ds-text-primary)]">{torrent.seeders ?? 0}</p>
                </div>

                {/* Peers */}
                <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-overlay)] p-3 sm:p-4 tv:p-6">
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 tv:w-6 tv:h-6 text-blue-400 shrink-0" size={24} />
                    <span className="text-xs tv:text-sm text-[var(--ds-text-secondary)] truncate">{t('downloads.stats.peers')}</span>
                  </div>
                  <p className="text-sm sm:text-lg tv:text-xl font-bold text-[var(--ds-text-primary)]">
                    {peersLive ?? torrent.peers_connected ?? torrent.peers_total ?? 0}
                  </p>
                </div>
              </div>

              {/* ETA + Taille : une ligne sur mobile */}
              <div className="grid grid-cols-2 gap-2 sm:gap-4 tv:gap-6">
                <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-overlay)] p-3 sm:p-4 tv:p-6">
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                    <Clock className="w-4 h-4 sm:w-5 sm:h-5 tv:w-6 tv:h-6 text-yellow-400 shrink-0" size={24} />
                    <span className="text-xs sm:text-sm tv:text-base text-[var(--ds-text-secondary)] truncate">{t('downloads.stats.eta')}</span>
                  </div>
                  <p className="text-sm sm:text-lg tv:text-xl font-semibold text-[var(--ds-text-primary)] truncate">{etaStr ?? formatETA(torrent.eta_seconds)}</p>
                </div>

                <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-overlay)] p-3 sm:p-4 tv:p-6">
                  <div className="flex items-center gap-1.5 sm:gap-2 mb-1 sm:mb-2">
                    <HardDrive className="w-4 h-4 sm:w-5 sm:h-5 tv:w-6 tv:h-6 text-purple-400 shrink-0" size={24} />
                    <span className="text-xs sm:text-sm tv:text-base text-[var(--ds-text-secondary)] truncate">{t('downloads.stats.totalSize') || t('downloads.stats.size') || 'Taille totale'}</span>
                  </div>
                  <p className="text-sm sm:text-lg tv:text-xl font-semibold text-[var(--ds-text-primary)] truncate">{formatBytes(torrent.total_bytes)}</p>
                </div>
              </div>

              {/* Panneau Éditer (ouvert au clic sur le bouton Éditer dans les actions) : Chemin + Info hash + Trackers */}
              {editPanelOpen && (
                <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-overlay)] overflow-hidden">
                  <div className="flex items-center justify-between gap-2 p-3 sm:p-4 border-b border-[var(--ds-border)]">
                    <span className="text-sm font-medium text-[var(--ds-text-primary)]">{t('common.edit')}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEditPanelOpen(false);
                        setEditTrackersOpen(false);
                        setTrackerMessage(null);
                      }}
                      className="p-2 rounded-[var(--ds-radius-sm)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-surface-elevated)] transition-colors"
                      aria-label={t('common.close')}
                    >
                      <X className="w-4 h-4" size={16} />
                    </button>
                  </div>
                  <div className="p-3 sm:p-4 space-y-4">
                    {/* Chemin de téléchargement */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs sm:text-sm text-[var(--ds-text-secondary)]">
                          {t('downloads.stats.downloadPath') || 'Chemin de téléchargement'}
                        </span>
                        {downloadPath && (
                          <button
                            type="button"
                            onClick={() => {
                              try {
                                navigator.clipboard?.writeText(downloadPath);
                              } catch (_) {}
                            }}
                            className="p-2 rounded-[var(--ds-radius-sm)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-surface-elevated)] transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                            title={t('common.copy') || 'Copier'}
                            aria-label={t('common.copy') || 'Copier'}
                          >
                            <Copy className="w-4 h-4" size={20} />
                          </button>
                        )}
                      </div>
                      {downloadPath ? (
                        <p className="text-xs sm:text-sm font-mono text-[var(--ds-text-secondary)] break-all select-all">{downloadPath}</p>
                      ) : (
                        <p className="text-xs sm:text-sm text-[var(--ds-text-tertiary)]">
                          {downloadPathError
                            ? t('downloads.stats.downloadPathError') || downloadPathError
                            : t('common.loading') || 'Chargement...'}
                        </p>
                      )}
                    </div>

                    {/* Info hash */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-xs sm:text-sm text-[var(--ds-text-secondary)]">{t('downloads.stats.infoHash') || 'Info hash'}</span>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              navigator.clipboard?.writeText(torrent.info_hash);
                            } catch (_) {}
                          }}
                          className="p-2 rounded-[var(--ds-radius-sm)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-surface-elevated)] transition-colors shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                          title={t('common.copy') || 'Copier'}
                          aria-label={t('common.copy') || 'Copier'}
                        >
                          <Copy className="w-4 h-4" size={20} />
                        </button>
                      </div>
                      <p className="text-xs sm:text-sm font-mono text-[var(--ds-text-secondary)] break-all select-all">{torrent.info_hash}</p>
                    </div>

                    {/* Trackers */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-xs sm:text-sm text-[var(--ds-text-secondary)]">{t('downloads.trackers')}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditTrackersOpen((v) => !v);
                            setTrackerMessage(null);
                            if (!editTrackersOpen) void loadTrackers();
                          }}
                          className="flex items-center gap-1.5 px-2 py-1.5 rounded-[var(--ds-radius-sm)] text-[var(--ds-text-secondary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-surface-elevated)] transition-colors shrink-0 text-sm font-medium"
                          title={t('downloads.addTrackerUrl')}
                          aria-label={t('downloads.editTrackers')}
                        >
                          <Pencil className="w-4 h-4" size={20} />
                          <span>{t('downloads.addTracker')}</span>
                        </button>
                      </div>
                      {trackersLoading ? (
                        <p className="text-xs sm:text-sm text-[var(--ds-text-tertiary)]">{t('common.loading')}</p>
                      ) : editTrackersOpen ? (
                        <div className="space-y-3">
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="url"
                              value={newTrackerUrl}
                              onInput={(e) => setNewTrackerUrl((e.target as HTMLInputElement).value)}
                              placeholder="https://…/announce/…"
                              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[var(--ds-surface-elevated)] border border-[var(--ds-border)] text-[var(--ds-text-primary)] text-sm font-mono placeholder-[var(--ds-text-tertiary)] focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:border-transparent"
                              aria-label={t('downloads.addTrackerUrl')}
                            />
                            <button
                              type="button"
                              onClick={() => void handleAddTracker()}
                              disabled={!newTrackerUrl.trim() || addTrackerLoading}
                              className="flex items-center justify-center gap-2 px-4 py-2 bg-primary hover:bg-primary-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:pointer-events-none min-h-[44px] sm:min-h-0 focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)]"
                            >
                              {addTrackerLoading ? (
                                <span className="loading loading-spinner loading-sm" />
                              ) : (
                                <PlusCircle className="w-4 h-4" size={20} />
                              )}
                              {t('downloads.addTracker')}
                            </button>
                          </div>
                          {trackerMessage && (
                            <p className={`text-sm ${trackerMessage.type === 'success' ? 'text-green-400' : 'text-amber-400'}`}>
                              {trackerMessage.text}
                            </p>
                          )}
                          {trackers.length > 0 && (
                            <ul className="text-xs sm:text-sm font-mono text-[var(--ds-text-secondary)] break-all space-y-1">
                              {trackers.map((url, i) => (
                                <li key={i}>{url}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : trackers.length > 0 ? (
                        <ul className="text-xs sm:text-sm font-mono text-[var(--ds-text-secondary)] break-all space-y-1 line-clamp-3">
                          {trackers.map((url, i) => (
                            <li key={i}>{url}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs sm:text-sm text-[var(--ds-text-tertiary)]">{t('downloads.noTrackers')}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Raison de statut détaillée */}
              {torrent.status_reason && (
                <div className="rounded-[var(--ds-radius-md)] border border-[var(--ds-border)] bg-[var(--ds-surface-overlay)] p-3 sm:p-4 tv:p-6">
                  <div className="flex items-center gap-2 mb-1">
                    <Info className="w-4 h-4 tv:w-5 tv:h-5 text-yellow-300 shrink-0" size={20} />
                    <span className="text-xs sm:text-sm tv:text-base text-[var(--ds-text-secondary)]">
                      {t('downloads.statusReason') || 'Statut détaillé'}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm tv:text-base text-yellow-200">
                    {torrent.status_reason}
                  </p>
                </div>
              )}

              {/* Actions : icônes explicites, title/aria-label pour accessibilité */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap gap-2 sm:gap-3 tv:gap-4 pt-3 sm:pt-4 border-t border-[var(--ds-border)]">
                {torrent.state === 'paused' ? (
                  <button
                    onClick={() => onResume(torrent.info_hash)}
                    className="min-h-[48px] min-w-[48px] px-4 py-3 tv:px-6 tv:py-4 bg-green-600 hover:bg-green-700 text-white rounded-lg tv:rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] flex items-center justify-center"
                    tabIndex={0}
                    data-focusable
                    title={t('common.resume')}
                    aria-label={t('common.resume')}
                  >
                    <Play className="w-6 h-6 tv:w-7 tv:h-7 shrink-0" size={28} />
                  </button>
                ) : torrent.state !== 'completed' && torrent.state !== 'seeding' && torrent.state !== 'paused' ? (
                  <button
                    onClick={() => onPause(torrent.info_hash)}
                    className="min-h-[48px] min-w-[48px] px-4 py-3 tv:px-6 tv:py-4 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg tv:rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] flex items-center justify-center"
                    tabIndex={0}
                    data-focusable
                    title={t('common.pause')}
                    aria-label={t('common.pause')}
                  >
                    <Pause className="w-6 h-6 tv:w-7 tv:h-7 shrink-0" size={28} />
                  </button>
                ) : null}

                <button
                  onClick={() => void handleRemoveAndClose(false)}
                  className="min-h-[48px] min-w-[48px] px-4 py-3 tv:px-6 tv:py-4 bg-primary hover:bg-primary-700 text-white rounded-lg tv:rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] flex items-center justify-center"
                  tabIndex={0}
                  data-focusable
                  title={t('common.delete')}
                  aria-label={t('common.delete')}
                >
                  <Trash2 className="w-6 h-6 tv:w-7 tv:h-7 shrink-0" size={28} />
                </button>

                {(torrent.state === 'completed' || torrent.state === 'seeding') && (
                  <button
                    onClick={() => void handleRemoveAndClose(true)}
                    className="min-h-[48px] min-w-[48px] px-4 py-3 tv:px-6 tv:py-4 bg-primary-800 hover:bg-primary-900 text-white rounded-lg tv:rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] border border-primary-700 flex items-center justify-center"
                    tabIndex={0}
                    data-focusable
                    title={t('downloads.removeWithFiles')}
                    aria-label={t('downloads.removeWithFiles')}
                  >
                    <Trash2 className="w-6 h-6 tv:w-7 tv:h-7 shrink-0" size={28} />
                  </button>
                )}

                <a
                  href={`/torrents?slug=${encodeURIComponent(torrent.slug && torrent.slug.trim() ? torrent.slug : torrent.info_hash)}&from=downloads&infoHash=${encodeURIComponent(torrent.info_hash)}`}
                  className="min-h-[48px] min-w-[48px] px-4 py-3 tv:px-6 tv:py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg tv:rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] flex items-center justify-center"
                  tabIndex={0}
                  data-focusable
                  title={t('common.open')}
                  aria-label={t('common.open')}
                  onClick={() => {
                    saveDownloadClientStats(torrent.info_hash, {
                      info_hash: torrent.info_hash,
                      name: torrent.name,
                      state: torrent.state,
                      progress: torrent.progress,
                      downloaded_bytes: torrent.downloaded_bytes,
                      total_bytes: torrent.total_bytes,
                      download_speed: torrent.download_speed,
                      upload_speed: torrent.upload_speed,
                      download_started: torrent.download_started,
                    });
                  }}
                >
                  <ExternalLink className="w-6 h-6 tv:w-7 tv:h-7 shrink-0" size={28} />
                </a>

                <button
                  type="button"
                  onClick={() => clientApi.torrents.downloadTorrentFile(torrent.info_hash, torrent.name)}
                  className="min-h-[48px] min-w-[48px] px-4 py-3 tv:px-6 tv:py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg tv:rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] flex items-center justify-center"
                  tabIndex={0}
                  data-focusable
                  title={t('downloads.downloadTorrentFile')}
                  aria-label={t('downloads.downloadTorrentFile')}
                >
                  <Download className="w-6 h-6 tv:w-7 tv:h-7 shrink-0" size={28} />
                </button>

                <button
                  onClick={() => onShowLogs(torrent.info_hash)}
                  className="min-h-[48px] min-w-[48px] px-4 py-3 tv:px-6 tv:py-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg tv:rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] flex items-center justify-center"
                  tabIndex={0}
                  data-focusable
                  title={t('downloads.logs')}
                  aria-label={t('downloads.logs')}
                >
                  <LogsIcon className="w-6 h-6 tv:w-7 tv:h-7 shrink-0" size={28} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditPanelOpen((v) => !v);
                    setTrackerMessage(null);
                    if (!editPanelOpen) void loadTrackers();
                  }}
                  className="min-h-[48px] min-w-[48px] px-4 py-3 tv:px-6 tv:py-4 rounded-lg tv:rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface-elevated)] flex items-center justify-center border border-[var(--ds-border)] bg-[var(--ds-surface-overlay)] text-[var(--ds-text-primary)] hover:bg-[var(--ds-surface-elevated)]"
                  tabIndex={0}
                  data-focusable
                  title={t('common.edit')}
                  aria-label={t('common.edit')}
                  aria-expanded={editPanelOpen}
                >
                  <Pencil className="w-6 h-6 tv:w-7 tv:h-7 shrink-0" size={28} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
