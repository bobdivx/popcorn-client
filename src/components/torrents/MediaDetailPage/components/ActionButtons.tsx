import { Play, RotateCw, Download, FileDown, Link2, Check, Trash2, Pause, Loader2, Zap, Upload } from 'lucide-preact';
import type { MediaDetailPageProps } from '../types';
import type { ClientTorrentStats } from '../../../../lib/client/types';

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
  onPlay,
  onPlayFromBeginning,
  onDownload,
  onDownloadTorrent,
  onCopyMagnet,
  onDeleteMedia,
  onPlayTrailer,
}: ActionButtonsProps) {
  const hasSavedPosition = savedPlaybackPosition !== null && savedPlaybackPosition !== undefined && savedPlaybackPosition > 0;

  // Déterminer l'état du bouton de téléchargement
  const isDownloading = !!torrentStats && (torrentStats.state === 'downloading' || torrentStats.state === 'queued');
  const isCompleted = !!torrentStats && (torrentStats.state === 'completed' || torrentStats.state === 'seeding');
  const isSeeding = !!torrentStats && torrentStats.state === 'seeding';
  const progressPercent = torrentStats ? Math.round(torrentStats.progress * 100) : 0;

  // Afficher le bouton si :
  // - Le torrent n'est pas disponible localement (pas encore téléchargé) → bouton "Télécharger"
  // - OU le torrent est complété (selon torrentStats) → bouton "Lire"
  // - OU le torrent est disponible localement ET a un infoHash → bouton "Lire" (même sans stats)
  const shouldShowButton = !isAvailableLocally || isCompleted || (isAvailableLocally && hasInfoHash);
  
  // Déterminer si on doit afficher "Lire" ou "Télécharger"
  const shouldShowPlayButton = isCompleted || (isAvailableLocally && hasInfoHash);
  
  // Debug: Log pour comprendre pourquoi le bouton n'apparaît pas
  if (hasInfoHash) {
    console.log('[ActionButtons] État du bouton:', {
      isAvailableLocally,
      isCompleted,
      hasTorrentStats: !!torrentStats,
      torrentStatsState: torrentStats?.state,
      torrentStatsProgress: torrentStats?.progress,
      shouldShowButton,
      shouldShowPlayButton,
      isDownloading,
      progressPercent,
    });
  }

  return (
    <div className="mb-6">
      <div className="flex flex-wrap gap-3 items-center">
        {/* Bouton Télécharger / En cours / Lire */}
        {shouldShowButton && (
          <button
            onClick={shouldShowPlayButton ? onPlay : onDownload}
            disabled={!!downloadingToClient || (isDownloading && !shouldShowPlayButton)}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-700 text-white px-6 py-3 rounded-lg font-semibold text-lg transition-all duration-200 border border-primary-500/50 shadow-primary hover:shadow-primary-lg focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
          >
            {downloadingToClient ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                Ajout...
              </>
            ) : isDownloading ? (
              <>
                <span className="loading loading-spinner loading-sm"></span>
                En cours... {progressPercent > 0 && `${progressPercent}%`}
              </>
            ) : shouldShowPlayButton ? (
              <>
                <Play className="h-5 w-5" size={20} />
                Lire
              </>
            ) : (
              <>
                <Download className="h-5 w-5" size={20} />
                Télécharger
              </>
            )}
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
      <button
        onClick={onPlayTrailer}
        disabled={isLoadingTrailer || !trailerKey}
        className={`inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-lg transition-colors border focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[48px] ${
          isPlayingTrailer
            ? 'bg-primary hover:bg-primary-700 text-white border-primary-500/50 glass-panel shadow-primary'
            : 'bg-glass hover:bg-glass-hover text-white border-white/30 glass-panel'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title={
          isPlayingTrailer
            ? "Arrêter la bande-annonce"
            : trailerKey
            ? "Lire la bande-annonce"
            : isLoadingTrailer
            ? "Chargement..."
            : "Bande-annonce non disponible"
        }
      >
        {isLoadingTrailer ? (
          <>
            <Loader2 className="animate-spin h-5 w-5" size={20} />
            Chargement...
          </>
        ) : isPlayingTrailer ? (
          <>
            <Pause className="h-5 w-5" size={20} />
            Arrêter
          </>
        ) : (
          <>
            <Play className="h-5 w-5" size={20} />
            Bande-annonce
          </>
        )}
      </button>

      {/* Bouton Télécharger .torrent */}
      <button
        onClick={onDownloadTorrent}
        className="inline-flex items-center justify-center w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full transition-all duration-200 border border-white/20 hover:border-white/30 hover:scale-110"
        title="Télécharger le fichier .torrent"
      >
        <FileDown className="h-5 w-5" size={20} />
      </button>

      {/* Bouton Magnet */}
      {(torrent._externalMagnetUri || (torrent._externalLink && torrent._externalLink.startsWith('magnet:'))) && (
        <button
          onClick={onCopyMagnet}
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
          className="inline-flex items-center gap-2 bg-primary-800 hover:bg-primary-900 text-white px-6 py-3 rounded-lg font-semibold text-lg transition-all duration-200 border border-primary-700/50 focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px]"
          title="Supprimer le torrent"
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
      {/* Afficher le statut si le torrent est en cours de téléchargement, même si le bouton "Lire" est visible */}
      {isDownloading && torrentStats && (
        <div className="mt-4 p-4 bg-white/5 rounded-lg border border-white/10 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/90 font-medium">Téléchargement en cours</span>
            <span className="text-white/70 text-sm">{progressPercent}%</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2 mb-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {torrentStats.download_speed && (
            <div className="text-white/60 text-sm">
              Vitesse: {((torrentStats.download_speed / (1024 * 1024)).toFixed(1))} MB/s
              {torrentStats.eta_seconds && torrentStats.eta_seconds > 0 && (
                <> • Temps restant: {formatTimeRemaining(torrentStats.eta_seconds)}</>
              )}
            </div>
          )}
        </div>
      )}

      {/* Affichage du statut de partage (seeding) */}
      {isSeeding && torrentStats && (
        <div className="mt-4 p-4 bg-green-900/20 rounded-lg border border-green-500/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-2">
            <Upload className="h-5 w-5 text-green-400" size={20} />
            <span className="text-green-400 font-medium">Partage actif</span>
          </div>
          {torrentStats.upload_speed && torrentStats.upload_speed > 0 && (
            <div className="text-green-300 text-sm">
              Vitesse d'upload: {((torrentStats.upload_speed / (1024 * 1024)).toFixed(2))} MB/s
              {torrentStats.peers_connected && (
                <> • Partage avec {torrentStats.peers_connected} peer{torrentStats.peers_connected > 1 ? 's' : ''}</>
              )}
            </div>
          )}
          {(!torrentStats.upload_speed || torrentStats.upload_speed === 0) && (
            <div className="text-green-300 text-sm">
              En attente de connexions peers pour partager
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatTimeRemaining(seconds: number): string {
  if (!seconds || seconds <= 0) return '--:--';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}
