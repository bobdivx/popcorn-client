import type { PlayStatus, DebugLog } from '../types';
import type { ClientTorrentStats } from '../../../../lib/client/types';
import { DebugConsole } from './DebugConsole';

interface EnhancedProgressOverlayProps {
  playStatus: PlayStatus;
  torrentStats: ClientTorrentStats | null;
  progressMessage: string;
  errorMessage: string | null;
  imageUrl: string | null;
  showDebug: boolean;
  debugLogs: DebugLog[];
  onCancel: () => void;
  onContinueInBackground?: () => void;
  onRetry: () => void;
  onToggleDebug: () => void;
  onCopyLogs: () => void;
  onClearLogs: () => void;
}

function formatTimeRemaining(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '--:--';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  } else if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  } else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}

export function EnhancedProgressOverlay({
  playStatus,
  torrentStats,
  progressMessage,
  errorMessage,
  imageUrl,
  showDebug,
  debugLogs,
  onCancel,
  onContinueInBackground,
  onRetry,
  onToggleDebug,
  onCopyLogs,
  onClearLogs,
}: EnhancedProgressOverlayProps) {
  const progressPercentage = torrentStats?.progress ? torrentStats.progress * 100 : 0;
  const downloadSpeed = torrentStats?.download_speed ? (torrentStats.download_speed / (1024 * 1024)).toFixed(1) : '0.0';
  const isDownloading = playStatus === 'downloading' && torrentStats && torrentStats.download_speed > 0;
  
  const downloadedFormatted = torrentStats?.downloaded_bytes ? formatSize(torrentStats.downloaded_bytes) : '0 B';
  const totalFormatted = torrentStats?.total_bytes ? formatSize(torrentStats.total_bytes) : '0 B';
  const timeRemaining = torrentStats?.eta_seconds ? formatTimeRemaining(torrentStats.eta_seconds) : '--:--';

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center">
      {/* Fond avec l'image */}
      {imageUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-10 blur-2xl transition-opacity duration-500"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />
      )}

      {/* Overlay sombre */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/90 to-black" />

      {/* Contenu */}
      <div className="relative z-10 max-w-lg w-full mx-4">
        {/* Erreur */}
        {playStatus === 'error' && (
          <div className="flex flex-col items-center mb-8">
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 bg-primary-600/20 rounded-full animate-pulse"></div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="absolute inset-0 w-full h-full text-primary-600 p-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-white text-3xl font-bold mb-3 text-center tracking-tight">Erreur</h2>
            <p className="text-white/70 text-center text-lg mb-8 font-light max-w-md">
              {errorMessage || progressMessage || 'Une erreur est survenue'}
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <button
                onClick={onCancel}
                className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 border border-white/20 hover:border-white/30 font-medium"
              >
                Retour
              </button>
              <button
                onClick={onRetry}
                className="px-8 py-3 bg-primary hover:bg-primary-700 text-white rounded-lg transition-all duration-200 font-medium focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 shadow-primary hover:shadow-primary-lg"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}

        {/* Spinner amélioré */}
        {playStatus !== 'error' && (
          <div className="flex flex-col items-center">
            <div className="relative w-28 h-28 mb-8">
              <div className="absolute inset-0 border-4 border-primary-600/20 rounded-full"></div>
              <div className="absolute inset-0 border-4 border-transparent border-t-primary-600 border-r-primary-600 rounded-full animate-spin" style={{ animationDuration: '1s' }}></div>
              {(playStatus === 'downloading' || playStatus === 'buffering' || playStatus === 'adding') && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-primary-600 text-3xl font-bold drop-shadow-lg">
                    {progressPercentage.toFixed(0)}%
                  </span>
                </div>
              )}
              {isDownloading && (
                <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2">
                  <div className="flex items-center gap-2 bg-green-500/20 backdrop-blur-sm px-3 py-1 rounded-full border border-green-500/30">
                    <div className="relative w-2 h-2">
                      <div className="absolute inset-0 bg-green-500 rounded-full animate-ping"></div>
                      <div className="absolute inset-0 bg-green-500 rounded-full"></div>
                    </div>
                    <span className="text-green-400 text-xs font-semibold">{downloadSpeed} MB/s</span>
                  </div>
                </div>
              )}
            </div>

            <h2 className="text-white text-3xl font-bold mb-4 text-center tracking-tight">
              {playStatus === 'adding' && 'Préparation en cours...'}
              {playStatus === 'downloading' && 'Téléchargement en cours'}
              {playStatus === 'buffering' && 'Mise en buffer...'}
              {playStatus === 'ready' && 'Téléchargement terminé'}
            </h2>

            {progressMessage && (
              <p className="text-white/60 text-center text-base mb-6 font-light max-w-md">
                {progressMessage}
              </p>
            )}

            {/* Stats améliorées */}
            {playStatus === 'downloading' && torrentStats && (
              <div className="mt-8 pt-6 border-t border-white/10 w-full">
                <div className="mb-6 text-center">
                  <div className="text-white/50 text-sm uppercase tracking-wider mb-2">Progression</div>
                  <div className="text-white text-2xl font-bold mb-1">
                    {downloadedFormatted} <span className="text-lg font-normal text-white/70">/ {totalFormatted}</span>
                  </div>
                  <div className="text-white/60 text-sm">
                    {progressPercentage.toFixed(1)}% complété
                  </div>
                </div>
                
                {/* Barre de progression */}
                <div className="mb-6 w-full bg-white/10 rounded-full h-3 overflow-hidden shadow-inner">
                  <div
                    className="bg-gradient-to-r from-primary-600 to-primary-500 h-full rounded-full transition-all duration-300 ease-out shadow-primary shadow-primary-600/50"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
                
                {/* Stats détaillées */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-white/50 text-xs uppercase tracking-wider mb-2">Vitesse</div>
                    <div className="text-white text-lg font-bold">
                      {downloadSpeed} <span className="text-sm font-normal text-white/70">MB/s</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-white/50 text-xs uppercase tracking-wider mb-2">Temps restant</div>
                    <div className="text-white text-lg font-bold">
                      {timeRemaining}
                    </div>
                  </div>
                  <div>
                    <div className="text-white/50 text-xs uppercase tracking-wider mb-2">Peers</div>
                    <div className="text-white text-lg font-bold">
                      {torrentStats.peers_connected}
                      <span className="text-sm font-normal text-white/70">/{torrentStats.peers_total}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-white/50 text-xs uppercase tracking-wider mb-2">Seeders</div>
                    <div className="text-white text-lg font-bold">
                      {torrentStats.seeders || 0}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Boutons */}
            <div className="mt-10 flex flex-col items-center gap-4">
              <div className="flex gap-4">
                {onContinueInBackground && (playStatus === 'downloading' || playStatus === 'buffering' || playStatus === 'adding') && (
                  <button
                    onClick={onContinueInBackground}
                    className="px-8 py-3 bg-green-600/80 hover:bg-green-600 text-white rounded-lg transition-all duration-200 font-medium shadow-lg shadow-green-600/30"
                  >
                    Continuer en arrière-plan
                  </button>
                )}
                <button
                  onClick={onCancel}
                  className="px-10 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-all duration-200 border border-white/20 hover:border-white/30 font-medium"
                >
                  Annuler
                </button>
              </div>

              <button
                onClick={onToggleDebug}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs rounded-lg transition-all duration-200 border border-white/10 hover:border-white/20"
              >
                {showDebug ? '▼ Masquer debug' : '▲ Afficher debug'}
              </button>
            </div>

            {/* Console de debug */}
            {showDebug && <DebugConsole debugLogs={debugLogs} onCopyLogs={onCopyLogs} onClearLogs={onClearLogs} />}
          </div>
        )}
      </div>
    </div>
  );
}
