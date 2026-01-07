import { Play, RotateCw, Download, FileDown, Link2, Check, Trash2, Pause, Loader2 } from 'lucide-preact';
import type { MediaDetailPageProps } from '../types';

interface ActionButtonsProps {
  torrent: MediaDetailPageProps['torrent'];
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
  onPlay: () => void;
  onPlayFromBeginning?: () => void;
  onDownload: () => void;
  onDownloadTorrent: () => void;
  onCopyMagnet: () => void;
  onDeleteMedia: () => void;
  onPlayTrailer: () => void;
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
  onPlay,
  onPlayFromBeginning,
  onDownload,
  onDownloadTorrent,
  onCopyMagnet,
  onDeleteMedia,
  onPlayTrailer,
}: ActionButtonsProps) {
  const hasSavedPosition = savedPlaybackPosition !== null && savedPlaybackPosition !== undefined && savedPlaybackPosition > 0;

  return (
    <div className="flex flex-wrap gap-3 mb-6 items-center">
      {/* Boutons de lecture */}
      {canStream ? (
        hasSavedPosition && onPlayFromBeginning ? (
          <>
            <button
              onClick={onPlay}
              className="inline-flex items-center gap-2 bg-white hover:bg-white/90 text-black px-8 py-3 rounded font-semibold text-lg transition-colors"
              title="Reprendre la lecture à la position sauvegardée"
            >
              <Play className="h-6 w-6" size={24} />
              Reprendre
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
            className="inline-flex items-center gap-2 bg-white hover:bg-white/90 text-black px-8 py-3 rounded font-semibold text-lg transition-colors"
            title={isAvailableLocally ? "Lire depuis la bibliothèque locale" : "Lire en streaming"}
          >
            <Play className="h-6 w-6" size={24} />
            {isAvailableLocally ? 'Lire (local)' : 'Lire'}
          </button>
        )
      ) : (
        <button
          onClick={onPlay}
          className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-8 py-3 rounded font-semibold text-lg transition-colors border border-white/30"
          disabled
        >
          <Play className="h-6 w-6" size={24} />
          Streaming non disponible
        </button>
      )}

      {/* Bouton Bande-annonce */}
      <button
        onClick={onPlayTrailer}
        disabled={isLoadingTrailer || !trailerKey}
        className={`inline-flex items-center gap-2 px-6 py-3 rounded font-semibold text-lg transition-colors border ${
          isPlayingTrailer
            ? 'bg-red-600/80 hover:bg-red-700 text-white border-red-500/50'
            : 'bg-white/20 hover:bg-white/30 text-white border-white/30'
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

      {/* Bouton Télécharger */}
      {!isAvailableLocally && (
        <button
          onClick={onDownload}
          disabled={downloadingToClient}
          className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-6 py-3 rounded font-semibold text-lg transition-colors border border-white/30 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {downloadingToClient ? (
            <>
              <span className="loading loading-spinner loading-sm"></span>
              Ajout...
            </>
          ) : (
            <>
              <Download className="h-5 w-5" size={20} />
              Télécharger
            </>
          )}
        </button>
      )}

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
          className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white px-6 py-3 rounded font-semibold text-lg transition-colors border border-white/30"
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
          className="inline-flex items-center gap-2 bg-red-600/80 hover:bg-red-700 text-white px-6 py-3 rounded font-semibold text-lg transition-colors border border-red-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
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
  );
}
