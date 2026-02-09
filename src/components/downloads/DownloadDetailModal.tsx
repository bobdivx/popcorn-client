import { useEffect, useRef, useState } from 'preact/hooks';
import { ArrowLeft, Download, Upload, Sprout, Users, Play, Pause, Trash2, Info, LogsIcon, Film, Clock, HardDrive } from 'lucide-preact';
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

  useEffect(() => {
    const fetchStatsV1 = async () => {
      const v = await clientApi.getTorrentStatsV1(torrent.info_hash);
      setStatsV1(v);
    };
    fetchStatsV1();
    const interval = setInterval(fetchStatsV1, 4000);
    return () => clearInterval(interval);
  }, [torrent.info_hash]);

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

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="download-detail-title"
      className="fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center p-4 tv:p-8 overflow-y-auto"
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
      <div className="relative w-full max-w-6xl tv:max-w-7xl bg-gray-900 rounded-2xl tv:rounded-3xl overflow-hidden shadow-2xl">
        {/* Image backdrop en arrière-plan avec effet similaire à MediaDetail */}
        {backdropUrl && (
          <>
            {/* Image de fond avec blur */}
            <div
              className="absolute inset-0 opacity-30 z-0"
              style={{
                backgroundImage: `url(${backdropUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(40px)',
                transform: 'scale(1.1)',
              }}
            />
            {/* Overlay sombre pour améliorer la lisibilité */}
            <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/60 z-0" />
          </>
        )}

        <div className="relative z-10">
          {/* En-tête avec bouton retour */}
          <div className="flex items-center justify-between p-4 tv:p-6 border-b border-gray-800">
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 tv:px-6 tv:py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-lg tv:rounded-xl text-sm tv:text-base font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-900"
              tabIndex={0}
              data-focusable
              aria-label={t('common.back')}
            >
              <ArrowLeft className="w-4 h-4 tv:w-5 tv:h-5" size={20} />
              <span>{t('common.back')}</span>
            </button>

            <TorrentStatusBadge state={torrent.state} className="px-4 py-2 tv:px-6 tv:py-3 text-sm tv:text-base" />
          </div>

          {/* Contenu principal */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 tv:gap-8 p-6 tv:p-8">
            {/* Colonne gauche : Poster et infos principales */}
            <div className="lg:col-span-1">
              {posterUrl ? (
                <div className="relative aspect-[2/3] rounded-xl tv:rounded-2xl overflow-hidden mb-6 tv:mb-8 shadow-2xl">
                  <img
                    src={posterUrl}
                    alt={torrent.name}
                    className="w-full h-full object-cover"
                    loading="eager"
                    onError={(e) => {
                      // Si l'image échoue, masquer l'élément
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div className="relative aspect-[2/3] rounded-xl tv:rounded-2xl overflow-hidden mb-6 tv:mb-8 bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                  <div className="text-center p-4">
                    <Film className="w-16 h-16 tv:w-20 tv:h-20 mb-4 text-gray-400 mx-auto" size={80} />
                    <p className="text-sm tv:text-base text-gray-400 line-clamp-2">{torrent.name}</p>
                  </div>
                </div>
              )}

              {/* Titre */}
              <h2 id="download-detail-title" className="text-2xl tv:text-3xl font-bold text-white mb-4 tv:mb-6 line-clamp-3">
                {torrent.name}
              </h2>

              {/* Barre de progression */}
              <div className="mb-6 tv:mb-8">
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

            {/* Colonne droite : Détails et actions */}
            <div className="lg:col-span-2 space-y-6 tv:space-y-8">
              {/* Statistiques */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 tv:gap-6">
                {/* Download speed */}
                <div className="bg-gray-800/50 rounded-lg tv:rounded-xl p-4 tv:p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Download className="w-5 h-5 tv:w-6 tv:h-6 text-blue-400" size={24} />
                    <span className="text-xs tv:text-sm text-gray-400">{t('downloads.stats.downloadSpeed')}</span>
                  </div>
                  <p className="text-lg tv:text-xl font-bold text-white">
                    {downSpeed ?? (torrent.download_speed > 0 ? formatSpeed(torrent.download_speed) : '0 B/s')}
                  </p>
                </div>

                {/* Upload speed */}
                <div className="bg-gray-800/50 rounded-lg tv:rounded-xl p-4 tv:p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Upload className="w-5 h-5 tv:w-6 tv:h-6 text-green-400" size={24} />
                    <span className="text-xs tv:text-sm text-gray-400">{t('downloads.stats.uploadSpeed')}</span>
                  </div>
                  <p className="text-lg tv:text-xl font-bold text-white">
                    {upSpeed ?? (torrent.upload_speed > 0 ? formatSpeed(torrent.upload_speed) : '0 B/s')}
                  </p>
                </div>

                {/* Seeds */}
                <div className="bg-gray-800/50 rounded-lg tv:rounded-xl p-4 tv:p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Sprout className="w-5 h-5 tv:w-6 tv:h-6 text-green-400" size={24} />
                    <span className="text-xs tv:text-sm text-gray-400">{t('downloads.stats.seeds') || t('downloads.stats.seeders') || 'Graines'}</span>
                  </div>
                  <p className="text-lg tv:text-xl font-bold text-white">{torrent.seeders ?? 0}</p>
                </div>

                {/* Peers */}
                <div className="bg-gray-800/50 rounded-lg tv:rounded-xl p-4 tv:p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-5 h-5 tv:w-6 tv:h-6 text-blue-400" size={24} />
                    <span className="text-xs tv:text-sm text-gray-400">{t('downloads.stats.peers')}</span>
                  </div>
                  <p className="text-lg tv:text-xl font-bold text-white">
                    {peersLive ?? torrent.peers_connected ?? torrent.peers_total ?? 0}
                  </p>
                </div>
              </div>

              {/* Informations supplémentaires */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 tv:gap-6">
                <div className="bg-gray-800/50 rounded-lg tv:rounded-xl p-4 tv:p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-5 h-5 tv:w-6 tv:h-6 text-yellow-400" size={24} />
                    <span className="text-sm tv:text-base text-gray-400">{t('downloads.stats.eta')}</span>
                  </div>
                  <p className="text-lg tv:text-xl font-semibold text-white">{etaStr ?? formatETA(torrent.eta_seconds)}</p>
                </div>

                <div className="bg-gray-800/50 rounded-lg tv:rounded-xl p-4 tv:p-6">
                  <div className="flex items-center gap-2 mb-2">
                    <HardDrive className="w-5 h-5 tv:w-6 tv:h-6 text-purple-400" size={24} />
                    <span className="text-sm tv:text-base text-gray-400">{t('downloads.stats.totalSize') || t('downloads.stats.size') || 'Taille totale'}</span>
                  </div>
                  <p className="text-lg tv:text-xl font-semibold text-white">{formatBytes(torrent.total_bytes)}</p>
                </div>
              </div>

              {/* Raison de statut détaillée (attente de peers, trackers, corruption, etc.) */}
              {torrent.status_reason && (
                <div className="mt-4 tv:mt-6 bg-gray-800/60 rounded-lg tv:rounded-xl p-4 tv:p-6 border border-gray-700/80">
                  <div className="flex items-center gap-2 mb-1">
                    <Info className="w-4 h-4 tv:w-5 tv:h-5 text-yellow-300" size={20} />
                    <span className="text-sm tv:text-base text-gray-300">
                      {t('downloads.statusReason') || 'Statut détaillé'}
                    </span>
                  </div>
                  <p className="text-sm tv:text-base text-yellow-200">
                    {torrent.status_reason}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-wrap gap-3 tv:gap-4 pt-4 border-t border-gray-800">
                {torrent.state === 'paused' ? (
                  <button
                    onClick={() => onResume(torrent.info_hash)}
                    className="flex-1 min-w-[140px] px-6 py-3 tv:px-8 tv:py-4 bg-green-600 hover:bg-green-700 text-white rounded-lg tv:rounded-xl text-base tv:text-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 focus:ring-offset-gray-900 flex items-center justify-center gap-2"
                    tabIndex={0}
                    data-focusable
                  >
                    <Play className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                    <span>{t('common.resume')}</span>
                  </button>
                ) : torrent.state !== 'completed' && torrent.state !== 'seeding' && torrent.state !== 'paused' ? (
                  <button
                    onClick={() => onPause(torrent.info_hash)}
                    className="flex-1 min-w-[140px] px-6 py-3 tv:px-8 tv:py-4 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg tv:rounded-xl text-base tv:text-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:ring-offset-gray-900 flex items-center justify-center gap-2"
                    tabIndex={0}
                    data-focusable
                  >
                    <Pause className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                    <span>{t('common.pause')}</span>
                  </button>
                ) : null}

                <button
                  onClick={() => void handleRemoveAndClose(false)}
                  className="flex-1 min-w-[140px] px-6 py-3 tv:px-8 tv:py-4 bg-primary hover:bg-primary-700 text-white rounded-lg tv:rounded-xl text-base tv:text-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-900 flex items-center justify-center gap-2"
                  tabIndex={0}
                  data-focusable
                >
                  <Trash2 className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                  <span>{t('common.delete')}</span>
                </button>

                {(torrent.state === 'completed' || torrent.state === 'seeding') && (
                  <button
                    onClick={() => void handleRemoveAndClose(true)}
                    className="flex-1 min-w-[140px] px-6 py-3 tv:px-8 tv:py-4 bg-primary-800 hover:bg-primary-900 text-white rounded-lg tv:rounded-xl text-base tv:text-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 focus:ring-offset-gray-900 border border-primary-700 flex items-center justify-center gap-2"
                    tabIndex={0}
                    data-focusable
                  >
                    <Trash2 className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                    <span>{t('downloads.removeWithFiles')}</span>
                  </button>
                )}

                <a
                  href={`/torrents?slug=${encodeURIComponent(torrent.info_hash)}&from=downloads`}
                  className="flex-1 min-w-[140px] px-6 py-3 tv:px-8 tv:py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg tv:rounded-xl text-base tv:text-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 flex items-center justify-center gap-2"
                  tabIndex={0}
                  data-focusable
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
                  <Info className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                  <span>{t('common.open')}</span>
                </a>

                <button
                  onClick={() => onShowLogs(torrent.info_hash)}
                  className="flex-1 min-w-[140px] px-6 py-3 tv:px-8 tv:py-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg tv:rounded-xl text-base tv:text-lg font-medium transition-all focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900 flex items-center justify-center gap-2"
                  tabIndex={0}
                  data-focusable
                >
                  <LogsIcon className="w-5 h-5 tv:w-6 tv:h-6" size={24} />
                  <span>{t('downloads.logs')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
