import type { PlayStatus, DebugLog } from '../types';
import type { ClientTorrentStats } from '../../../../lib/torrent/webtorrent-client';
import { DebugConsole } from './DebugConsole';

interface ProgressOverlayProps {
  playStatus: PlayStatus;
  torrentStats: ClientTorrentStats | null;
  progressMessage: string;
  errorMessage: string | null;
  imageUrl: string | null;
  showDebug: boolean;
  debugLogs: DebugLog[];
  onCancel: () => void;
  onRetry: () => void;
  onToggleDebug: () => void;
  onCopyLogs: () => void;
  onClearLogs: () => void;
}

export function ProgressOverlay({
  playStatus,
  torrentStats,
  progressMessage,
  errorMessage,
  imageUrl,
  showDebug,
  debugLogs,
  onCancel,
  onRetry,
  onToggleDebug,
  onCopyLogs,
  onClearLogs,
}: ProgressOverlayProps) {
  const progressPercentage = torrentStats?.progress ? torrentStats.progress * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
      {/* Fond avec l'image du torrent en arrière-plan si disponible */}
      {imageUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-20"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />
      )}

      {/* Overlay sombre */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/80 to-black/90" />

      {/* Contenu centré - style Netflix */}
      <div className="relative z-10 max-w-lg w-full mx-4">
        {/* Icône d'erreur */}
        {playStatus === 'error' && (
          <div className="flex flex-col items-center mb-8">
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 bg-red-600/20 rounded-full"></div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="absolute inset-0 w-full h-full text-red-600 p-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-white text-3xl font-bold mb-3 text-center tracking-tight">Erreur</h2>
            <p className="text-white/70 text-center text-lg mb-8 font-light">
              {errorMessage || progressMessage || 'Une erreur est survenue'}
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <button
                onClick={onCancel}
                className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-md transition-all duration-200 border border-white/20 hover:border-white/30 font-medium"
              >
                Retour
              </button>
              <button
                onClick={onRetry}
                className="px-8 py-3 bg-red-600 hover:bg-red-700 text-white rounded-md transition-all duration-200 font-medium"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}

        {/* Spinner Netflix avec pourcentage - pour tous les autres états */}
        {playStatus !== 'error' && (
          <div className="flex flex-col items-center">
            {/* Spinner rouge Netflix */}
            <div className="relative w-24 h-24 mb-6">
              {/* Cercle de fond */}
              <div className="absolute inset-0 border-4 border-red-600/20 rounded-full"></div>
              {/* Cercle animé */}
              <div className="absolute inset-0 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
              {/* Pourcentage au centre */}
              {(playStatus === 'downloading' || playStatus === 'buffering' || playStatus === 'adding') && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-red-600 text-2xl font-bold">{progressPercentage.toFixed(1)}%</span>
                </div>
              )}
            </div>

            {/* Titre principal */}
            <h2 className="text-white text-2xl font-semibold mb-2 text-center tracking-tight">
              {playStatus === 'adding' && 'Préparation'}
              {(playStatus === 'downloading' || playStatus === 'buffering') && 'Chargement en cours'}
            </h2>

            {/* Indicateur de progression active */}
            {playStatus === 'downloading' && torrentStats && (
              <div className="flex items-center gap-2 mb-4">
                {torrentStats.download_speed > 0 ? (
                  <>
                    <div className="relative w-3 h-3">
                      <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-75"></div>
                      <div className="absolute inset-0 bg-green-500 rounded-full"></div>
                    </div>
                    <span className="text-green-400 text-sm font-medium">Actif</span>
                  </>
                ) : (
                  <>
                    <div className="relative w-3 h-3">
                      <div className="absolute inset-0 bg-yellow-500 rounded-full animate-pulse"></div>
                    </div>
                    <span className="text-yellow-400 text-sm font-medium">En attente de connexion...</span>
                  </>
                )}
              </div>
            )}

            {/* Message secondaire */}
            {progressMessage && !progressMessage.toLowerCase().includes('chargement en cours') && (
              <p className="text-white/60 text-center text-sm mb-8 font-light max-w-md">{progressMessage}</p>
            )}

            {/* Stats discrètes en bas */}
            {playStatus === 'downloading' && torrentStats && (
              <div className="mt-6 pt-6 border-t border-white/10 w-full">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-white/50 text-xs uppercase tracking-wider mb-1">Vitesse</div>
                    <div className="text-white text-sm font-medium">
                      {(torrentStats.download_speed / (1024 * 1024)).toFixed(1)} MB/s
                    </div>
                  </div>
                  <div>
                    <div className="text-white/50 text-xs uppercase tracking-wider mb-1">Peers</div>
                    <div className="text-white text-sm font-medium">{torrentStats.peers_connected}</div>
                  </div>
                  {torrentStats.eta_seconds && torrentStats.eta_seconds > 0 && (
                    <div>
                      <div className="text-white/50 text-xs uppercase tracking-wider mb-1">Temps</div>
                      <div className="text-white text-sm font-medium">
                        {Math.floor(torrentStats.eta_seconds / 60)}:
                        {(torrentStats.eta_seconds % 60).toString().padStart(2, '0')}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Bouton d'annulation */}
            <div className="mt-8 flex flex-col items-center gap-4">
              <button
                onClick={onCancel}
                className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-md transition-all duration-200 border border-white/20 hover:border-white/30 font-medium"
              >
                Annuler
              </button>

              {/* Bouton pour afficher/masquer la console de debug */}
              <button
                onClick={onToggleDebug}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs rounded transition-all duration-200 border border-white/10 hover:border-white/20"
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
