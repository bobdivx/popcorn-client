import type { PlayStatus, DebugLog } from '../types';
import type { ClientTorrentStats } from '../../../../lib/client/types';
import { getLoadingStep, LOADING_STEPS } from '../../../streaming/player-shared/utils/streamingSteps';
import { DebugConsole } from './DebugConsole';
import { formatTimeRemaining, formatBytes } from '../../../../lib/utils/formatBytes';

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
  const currentStep = getLoadingStep(playStatus, progressMessage, torrentStats);
  const isWaitingSeeders = playStatus === 'downloading' && (!torrentStats || (progressPercentage === 0 && !torrentStats?.download_speed));

  const downloadedFormatted = torrentStats?.downloaded_bytes ? formatBytes(torrentStats.downloaded_bytes) : '0 B';
  const totalFormatted = torrentStats?.total_bytes ? formatBytes(torrentStats.total_bytes) : '0 B';
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

        {/* Spinner + indicateur d'étapes */}
        {playStatus !== 'error' && (
          <div className="flex flex-col items-center">
            {/* Indicateur d'étapes (barre avec 4 phases) */}
            {(playStatus === 'adding' || playStatus === 'downloading' || playStatus === 'buffering') && (
              <div className="w-full max-w-sm mb-8">
                <div className="flex justify-between gap-1">
                  {LOADING_STEPS.map((step, i) => {
                    const stepNum = i + 1;
                    const isActive = currentStep === stepNum;
                    const isDone = currentStep > stepNum;
                    return (
                      <div key={step.label} className="flex flex-1 flex-col items-center">
                        <div
                          className={`
                            w-full h-1.5 rounded-full transition-all duration-300
                            ${isDone ? 'bg-primary-500' : isActive ? 'bg-primary-500 animate-pulse' : 'bg-white/20'}
                          `}
                        />
                        <div className="mt-2 flex flex-col items-center">
                          <span
                            className={`
                              text-xs font-medium transition-colors
                              ${isActive ? 'text-primary-400' : isDone ? 'text-white/70' : 'text-white/40'}
                            `}
                          >
                            {isActive && (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary-400 animate-ping mr-1 align-middle" />
                            )}
                            {step.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="relative w-28 h-28 mb-6">
              {/* Cercle de fond */}
              <div className="absolute inset-0 border-4 border-primary-600/20 rounded-full" />
              {/* Spinner principal */}
              <div
                className="absolute inset-0 border-4 border-transparent border-t-primary-600 border-r-primary-600 rounded-full animate-spin"
                style={{ animationDuration: '1s' }}
              />
              {/* Contenu central : % seulement quand on a une vraie progression, sinon animation par phase */}
              {(playStatus === 'downloading' || playStatus === 'buffering') && torrentStats && (progressPercentage > 0 || isDownloading) ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-primary-600 text-3xl font-bold drop-shadow-lg">
                    {progressPercentage.toFixed(0)}%
                  </span>
                </div>
              ) : playStatus === 'adding' ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl animate-pulse" title="Préparation">
                    📥
                  </span>
                </div>
              ) : isWaitingSeeders ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-4xl animate-pulse" title="En attente de seeders">
                    🔗
                  </span>
                </div>
              ) : (playStatus === 'downloading' || playStatus === 'buffering') ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-primary-600 text-3xl font-bold drop-shadow-lg">
                    {progressPercentage.toFixed(0)}%
                  </span>
                </div>
              ) : null}
              {/* Badge vitesse quand téléchargement actif */}
              {isDownloading && (
                <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2">
                  <div className="flex items-center gap-2 bg-green-500/20 backdrop-blur-sm px-3 py-1 rounded-full border border-green-500/30">
                    <div className="relative w-2 h-2">
                      <div className="absolute inset-0 bg-green-500 rounded-full animate-ping" />
                      <div className="absolute inset-0 bg-green-500 rounded-full" />
                    </div>
                    <span className="text-green-400 text-xs font-semibold">{downloadSpeed} MB/s</span>
                  </div>
                </div>
              )}
            </div>

            <h2 className="text-white text-3xl font-bold mb-2 text-center tracking-tight">
              {playStatus === 'adding' && 'Préparation en cours...'}
              {playStatus === 'downloading' && (isWaitingSeeders ? 'En attente de seeders...' : 'Téléchargement en cours')}
              {playStatus === 'buffering' && 'Mise en buffer...'}
              {playStatus === 'ready' && 'Téléchargement terminé'}
            </h2>

            {progressMessage && (
              <p className="text-white/60 text-center text-base mb-6 font-light max-w-md">
                {progressMessage}
              </p>
            )}

            {/* Rappel seeders/peers quand on attend */}
            {isWaitingSeeders && torrentStats && (
              <p className="text-white/50 text-sm text-center mb-4">
                Peers connectés : {torrentStats.peers_connected ?? 0} / {torrentStats.peers_total ?? 0}
                {(torrentStats.seeders ?? 0) > 0 && ` · Seeders : ${torrentStats.seeders}`}
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
