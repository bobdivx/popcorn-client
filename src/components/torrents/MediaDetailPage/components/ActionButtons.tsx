import { Play, RotateCw, Download, Link2, Check, Trash2, Loader2, Zap, Upload, Film } from 'lucide-preact';
import type { MediaDetailPageProps } from '../types';
import type { ClientTorrentStats } from '../../../../lib/client/types';
import { TorrentProgressBar, TorrentSpeedDisplay, PeersIndicator } from '../../ui';
import RequestButton from '../../../requests/RequestButton';
import { useI18n } from '../../../../lib/i18n/useI18n';

interface ActionButtonsProps {
  torrent: MediaDetailPageProps['torrent'];
  allVariants?: MediaDetailPageProps['torrent'][];
  isAvailableLocally: boolean;
  canStream: boolean;
  isExternal: boolean;
  hasInfoHash: boolean;
  magnetCopied: boolean;
  downloadingToClient: boolean;
  deletingMedia: boolean;
  trailerKey: string | null;
  isLoadingTrailer: boolean;
  isPlayingTrailer?: boolean;
  savedPlaybackPosition?: number | null;
  torrentStats?: ClientTorrentStats | null;
  /** Compte à rebours (s) avant lancement auto à la fin du téléchargement (3, 2, 1). */
  countdownRemaining?: number | null;
  /** Pack saison (plusieurs fichiers) : afficher "Télécharger toute la saison" + option épisode */
  isPackWithMultipleFiles?: boolean;
  onPlay: () => void;
  onPlayAuto?: (bestTorrent: MediaDetailPageProps['torrent']) => void;
  onPlayFromBeginning?: () => void;
  onDownload: () => void;
  onDownloadTorrent: () => void;
  onCopyMagnet: () => void;
  onDeleteMedia: () => void;
  onPlayTrailer: () => void;
}

/**
 * Fonction pour sélectionner le meilleur torrent selon la qualité
 * Priorité : Remux 4K > 4K > 1080p > 720p
 */
function selectBestTorrent(variants: MediaDetailPageProps['torrent'][]): MediaDetailPageProps['torrent'] | null {
  if (!variants || variants.length === 0) return null;
  
  // Fonction de score pour chaque torrent
  const getQualityScore = (t: MediaDetailPageProps['torrent']): number => {
    let score = 0;
    const quality = t.quality;
    const full = quality?.full?.toUpperCase() || '';
    const resolution = quality?.resolution?.toUpperCase() || '';
    const source = quality?.source?.toUpperCase() || '';
    
    // Remux (priorité maximale)
    if (full.includes('REMUX') || source.includes('REMUX') || full.includes('BLURAY')) {
      score += 1000;
    }
    
    // 4K / 2160P / UHD
    if (resolution === '4K' || resolution === '2160P' || resolution === 'UHD' || resolution.includes('2160')) {
      score += 500;
    } else if (resolution === '1080P' || resolution.includes('1080')) {
      score += 300;
    } else if (resolution === '720P' || resolution.includes('720')) {
      score += 100;
    }
    
    // HDR
    if (full.includes('HDR') || full.includes('DOLBY')) {
      score += 50;
    }
    
    // Codec préféré (x265/HEVC > AV1 > x264)
    const codec = quality?.codec?.toUpperCase() || '';
    if (codec === 'X265' || codec === 'H265' || codec === 'HEVC') {
      score += 30;
    } else if (codec === 'AV1') {
      score += 25;
    } else if (codec === 'X264' || codec === 'H264') {
      score += 10;
    }
    
    // Plus de seeds = mieux
    score += (t.seedCount || 0) * 0.1;
    
    return score;
  };
  
  // Trier par score décroissant
  const sortedVariants = [...variants].sort((a, b) => {
    const scoreA = getQualityScore(a);
    const scoreB = getQualityScore(b);
    return scoreB - scoreA;
  });
  
  return sortedVariants[0] || null;
}

export function ActionButtons({
  torrent,
  isAvailableLocally,
  canStream,
  isExternal,
  hasInfoHash,
  magnetCopied,
  downloadingToClient,
  deletingMedia,
  trailerKey,
  isLoadingTrailer,
  isPlayingTrailer = false,
  savedPlaybackPosition,
  torrentStats,
  countdownRemaining = null,
  isPackWithMultipleFiles = false,
  onPlay,
  onPlayFromBeginning,
  onDownload,
  onDownloadTorrent,
  onCopyMagnet,
  onDeleteMedia,
  onPlayTrailer,
}: ActionButtonsProps) {
  const { t } = useI18n();
  const hasSavedPosition = savedPlaybackPosition !== null && savedPlaybackPosition !== undefined && savedPlaybackPosition > 0;

  // Déterminer l'état du bouton de téléchargement (hydraté par les stats du client torrent)
  const isDownloading = !!torrentStats && (torrentStats.state === 'downloading' || torrentStats.state === 'queued');
  const isCompleted = !!torrentStats && (torrentStats.state === 'completed' || torrentStats.state === 'seeding');
  const progressValue = typeof torrentStats?.progress === 'number' ? torrentStats.progress : 0;
  const progressPercent = torrentStats ? Math.round(progressValue * 100) : 0;
  const progressComplete = !!(torrentStats && torrentStats.progress >= 0.99);
  // Torrent téléchargé = état completed/seeding OU progression >= 99%
  const isDownloadComplete = isCompleted || progressComplete;
  const isSeeding = !!torrentStats && torrentStats.state === 'seeding';
  // Afficher l'état dès qu'on a des stats actives (même si download_started n'est pas exposé)
  const hasActiveDownloadStats = !!torrentStats && !isDownloadComplete && (
    isDownloading ||
    progressValue > 0 ||
    (torrentStats.download_speed ?? 0) > 0 ||
    (torrentStats.peers_connected ?? 0) > 0 ||
    (torrentStats.downloaded_bytes ?? 0) > 0
  );
  const showProgressInButton = hasActiveDownloadStats;
  const displayProgressPercent = hasActiveDownloadStats ? progressPercent : 0;

  // Détecter si c'est un média local (slug ou id commence par "local_") ou fichier de la bibliothèque (downloadPath)
  const isLocalTorrent =
    torrent.id?.startsWith('local_') ||
    torrent.slug?.startsWith('local_') ||
    torrent.infoHash?.startsWith('local_') ||
    !!(torrent as any).downloadPath;
  
  // Afficher le bouton si :
  // - Le torrent n'est pas disponible localement (pas encore téléchargé) → bouton "Télécharger"
  // - OU le torrent est complété (selon torrentStats) → bouton "Lire"
  // - OU le torrent est disponible localement ET a un infoHash → bouton "Lire" (même sans stats)
  // - OU c'est un média local → bouton "Lire"
  const shouldShowButton = !isAvailableLocally || isDownloadComplete || (isAvailableLocally && hasInfoHash) || isLocalTorrent;
  
  // Afficher "Lire" quand le torrent est téléchargé (hydraté par les stats du client torrent).
  // Dès que state=seeding/completed OU progress>=99%, les fichiers sont sur disque → on peut lire.
  // Pas besoin de peers_connected ou files_available : un torrent à 100% a ses fichiers.
  const shouldShowPlayButton =
    isLocalTorrent ||
    (isAvailableLocally && hasInfoHash) ||
    isDownloadComplete;

  // Debug: Log pour diagnostiquer l'affichage du bouton Lire/Télécharger
  if (hasInfoHash && import.meta.env.DEV) {
    console.log('[ActionButtons] État du bouton:', {
      isAvailableLocally,
      isDownloadComplete,
      hasTorrentStats: !!torrentStats,
      torrentStatsState: torrentStats?.state,
      torrentStatsProgress: torrentStats?.progress,
      progressPercent,
      shouldShowButton,
      shouldShowPlayButton,
      isDownloading,
    });
  }

  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-3 items-center">
        {/* Bouton Télécharger / En cours / Lire */}
        {shouldShowButton && (
          <button
            onClick={shouldShowPlayButton ? onPlay : onDownload}
            disabled={!!downloadingToClient || (isDownloading && !shouldShowPlayButton) || (countdownRemaining !== null && countdownRemaining > 0)}
            data-focusable
            data-media-detail-primary-action
            tabIndex={0}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-semibold text-lg transition-all duration-200 border border-primary-500/50 shadow-primary hover:shadow-primary-lg focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] tv-element-focused"
          >
            {downloadingToClient ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Ajout...
              </>
            ) : (isDownloading || hasActiveDownloadStats) ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                {showProgressInButton ? `En cours... ${displayProgressPercent}%` : 'En cours... 0%'}
              </>
            ) : countdownRemaining !== null && countdownRemaining > 0 ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Lancement dans {countdownRemaining} s…
              </>
            ) : shouldShowPlayButton ? (
              <>
                <Play className="h-5 w-5" size={20} />
                Lire
              </>
            ) : (
              <>
                <Download className="h-5 w-5" size={20} />
                {isPackWithMultipleFiles ? 'Télécharger toute la saison' : 'Télécharger'}
              </>
            )}
          </button>
        )}
        {/* Pack : téléchargement d'un seul épisode (prochainement via priorité fichiers librqbit) */}
        {isPackWithMultipleFiles && !shouldShowPlayButton && (
          <button
            type="button"
            disabled
            title="Prochainement : téléchargement sélectif d’un épisode (priorité des fichiers)"
            data-focusable
            tabIndex={0}
            className="inline-flex items-center gap-2 bg-white/10 text-white/60 px-6 py-3 rounded-lg font-semibold text-lg border border-white/20 cursor-not-allowed min-h-[48px]"
          >
            <Download className="h-5 w-5" size={20} />
            Télécharger l&apos;épisode sélectionné
          </button>
        )}

      {/* Boutons de lecture - Masqués pour l'instant (fonctionnalité à venir) */}
      {/* Le bouton "Télécharger" lance automatiquement la lecture après téléchargement */}
      {false && canStream && (
        hasSavedPosition && onPlayFromBeginning ? (
          <>
            <button
              onClick={onPlay}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary-700 text-white px-8 py-3 rounded-lg font-semibold text-lg transition-all duration-200 shadow-primary hover:shadow-primary-lg focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px]"
              title="Reprendre la lecture à la position sauvegardée"
            >
              <Play className="h-6 w-6" size={24} />
              Stream
            </button>
            <button
              onClick={onPlayFromBeginning}
              className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-6 py-3 rounded font-semibold text-lg transition-colors border border-white/30"
              title="Reprendre depuis le début"
            >
              <RotateCw className="h-5 w-5" size={20} />
              Depuis le début
            </button>
          </>
        ) : (
            <button
              onClick={onPlay}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary-700 text-white px-8 py-3 rounded-lg font-semibold text-lg transition-all duration-200 shadow-primary hover:shadow-primary-lg focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px]"
              title={isAvailableLocally ? "Lire depuis la bibliothèque locale" : "Lire en streaming"}
            >
              <Play className="h-6 w-6" size={24} />
              {isAvailableLocally ? 'Lire' : 'Streaming'}
            </button>
        )
      )}

      {/* Bouton Bande-annonce */}
      {trailerKey && !isPlayingTrailer && (
        <button
          onClick={onPlayTrailer}
          disabled={isLoadingTrailer}
          data-focusable
          tabIndex={0}
          className="inline-flex items-center gap-2 bg-glass hover:bg-glass-hover text-white px-6 py-3 rounded-lg font-semibold text-lg transition-all duration-200 border border-white/30 glass-panel focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
          title="Lire la bande-annonce"
        >
          {isLoadingTrailer ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              Chargement...
            </>
          ) : (
            <>
              <Film className="h-5 w-5" size={20} />
              Bande-annonce
            </>
          )}
        </button>
      )}

      {/* Bouton Demander (request) - masqué si déjà dispo localement */}
      {!isAvailableLocally && !isLocalTorrent && torrent.tmdbId && (torrent.tmdbType === 'movie' || torrent.tmdbType === 'tv') && (
        <RequestButton
          tmdbId={torrent.tmdbId}
          mediaType={torrent.tmdbType as 'movie' | 'tv'}
        />
      )}

      {/* Bouton Magnet */}
      {(torrent._externalMagnetUri || (torrent._externalLink && torrent._externalLink.startsWith('magnet:'))) && (
        <button
          onClick={onCopyMagnet}
          data-focusable
          tabIndex={0}
          className="inline-flex items-center gap-2 bg-glass hover:bg-glass-hover text-white px-6 py-3 rounded font-semibold text-lg transition-colors border border-white/30 glass-panel"
        >
          {magnetCopied ? (
            <>
              <Check className="h-5 w-5" size={20} />
              Copié !
            </>
          ) : (
            <>
              <Link2 className="h-5 w-5" size={20} />
              Magnet
            </>
          )}
        </button>
      )}

      {/* Bouton Supprimer */}
      {isAvailableLocally && hasInfoHash && !isExternal && (
        <button
          onClick={onDeleteMedia}
          disabled={deletingMedia}
          data-focusable
          tabIndex={0}
          className="inline-flex items-center gap-2 bg-primary-800 hover:bg-primary-900 text-white px-6 py-3 rounded-lg font-semibold text-lg transition-all duration-200 border border-primary-700/50 focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
          title={isLocalTorrent ? "Supprimer le fichier local" : "Supprimer le torrent"}
        >
          {deletingMedia ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              Suppression...
            </>
          ) : (
            <>
              <Trash2 className="h-5 w-5" size={20} />
              Supprimer
            </>
          )}
        </button>
      )}
      </div>

      {/* Affichage du statut de téléchargement directement sur la page détail */}
      {hasActiveDownloadStats && torrentStats && (
        <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/10 backdrop-blur-sm">
          <TorrentProgressBar
            progress={torrentStats.progress}
            downloadedBytes={torrentStats.downloaded_bytes}
            totalBytes={torrentStats.total_bytes}
            downloadSpeed={torrentStats.download_speed}
            etaSeconds={torrentStats.eta_seconds ?? null}
            statusLabel={torrentStats.state === 'queued' ? t('torrentStats.queued') : t('torrentStats.downloading')}
            variant="full"
            progressColor="blue"
          />
          {torrentStats.status_reason && (
            <div className="text-white/50 text-sm mt-1">
              {torrentStats.status_reason}
            </div>
          )}
        </div>
      )}

      {/* Affichage du statut de partage (seeding) */}
      {isSeeding && torrentStats && (
        <div className="mt-4 p-4 bg-green-900/20 rounded-lg border border-green-500/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-2">
            <Upload className="h-5 w-5 text-green-400" size={20} />
            <span className="text-green-400 font-medium">{t('torrentStats.seeding')}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-green-300 text-sm">
            <TorrentSpeedDisplay
              uploadSpeed={torrentStats.upload_speed}
              showEta={false}
              className="!text-green-300"
            />
            <PeersIndicator peersConnected={torrentStats.peers_connected} className="text-green-300" />
          </div>
          {(!torrentStats.upload_speed || torrentStats.upload_speed === 0) && !torrentStats.peers_connected && (
            <div className="text-green-300 text-sm mt-1">
              En attente de connexions peers pour partager
            </div>
          )}
        </div>
      )}
    </div>
  );
}
