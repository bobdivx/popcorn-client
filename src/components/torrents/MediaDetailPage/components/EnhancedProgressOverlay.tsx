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
  const progressFromBytes =
    torrentStats?.total_bytes != null &&
    torrentStats.total_bytes > 0 &&
    torrentStats?.downloaded_bytes != null
      ? (torrentStats.downloaded_bytes / torrentStats.total_bytes) * 100
      : null;
  const progressPercentage =
    progressFromBytes != null ? progressFromBytes : (torrentStats?.progress ?? 0) * 100;
  const downloadSpeed = torrentStats?.download_speed ? (torrentStats.download_speed / (1024 * 1024)).toFixed(1) : '0.0';
  const isDownloading = playStatus === 'downloading' && torrentStats && torrentStats.download_speed > 0;
  const currentStep = getLoadingStep(playStatus, progressMessage, torrentStats);
  const isWaitingSeeders = playStatus === 'downloading' && (!torrentStats || (progressPercentage === 0 && !torrentStats?.download_speed));

  const downloadedFormatted = torrentStats?.downloaded_bytes ? formatBytes(torrentStats.downloaded_bytes) : '0 B';
  const totalFormatted = torrentStats?.total_bytes ? formatBytes(torrentStats.total_bytes) : '0 B';
  const timeRemaining = torrentStats?.eta_seconds ? formatTimeRemaining(torrentStats.eta_seconds) : '--:--';

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center">
      {/* Fond avec l''image et effet de profondeur */}
      {imageUrl && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center opacity-30 scale-105 transition-all duration-700 blur-xl"
            style={{ backgroundImage: `url(${imageUrl})` }}
          />
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
        </>
      )}

      {/* Overlay dynamique : Gradient radial profond */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_transparent_0%,_rgba(0,0,0,0.8)_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/40 to-black" />

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

        {/* Spinner + indicateur d''étapes */}
        {playStatus !== 'error' && (
          <div className="flex flex-col items-center">
            {/* Indicateur d''étapes (barre avec 4 phases) */}
            {(playStatus === 'adding' || playStatus === 'downloading' || playStatus === 'buffering') && (
              <div className="w-full max-w-sm mb-12 relative">
                <div className="flex justify-between gap-3">
                  {LOADING_STEPS.map((step, i) => {
                    const stepNum = i + 1;
                    const isActive = currentStep === stepNum;
                    const isDone = currentStep > stepNum;
                    return (
                      <div key={step.label} className="flex flex-1 flex-col items-center">
                        <div
                          className={`
                            w-full h-1 rounded-full transition-all duration-500 relative
                            ${isDone ? 'bg-primary-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]' : isActive ? 'bg-white/30 overflow-hidden' : 'bg-white/10'}
                          `}
                        >
                          {isActive && (
                            <div className="absolute inset-0 bg-primary-500 animate-shimmer shadow-[0_0_15px_rgba(168,85,247,0.8)]" />
                          )}
                        </div>
                        <div className="mt-3 flex flex-col items-center">
                          <span
                            className={`
                              text-[10px] uppercase tracking-[0.2em] font-bold transition-all duration-300
                              ${isActive ? 'text-primary-400 opacity-100 scale-110' : isDone ? 'text-white/80' : 'text-white/20'}
                            `}
                          >
                            {step.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="relative w-40 h-40 mb-10 flex items-center justify-center">
               {/* Effet Orbe / Halo de fond */}
               <div className="absolute inset-0 bg-primary-600/10 rounded-full blur-3xl animate-glow-pulse" />
               
               {/* Cercle SVG de progression Premium */}
               <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                 {/* Fond de l''anneau */}
                 <circle
                   cx="80"
                   cy="80"
                   r="74"
                   className="stroke-white/5 fill-none"
                   strokeWidth="3"
                 />
                 {/* Anneau actif avec glow */}
                 <circle
                   cx="80"
                   cy="80"
                   r="74"
                   className="stroke-primary-500 fill-none transition-all duration-1000 ease-out"
                   strokeWidth="3"
                   strokeLinecap="round"
                   strokeDasharray={2 * Math.PI * 74}
                   strokeDashoffset={2 * Math.PI * 74 * (1 - (progressPercentage / 100))}
                   style={{ filter: 'drop-shadow(0 0 8px rgba(168, 85, 247, 0.6))' }}
                 />
               </svg>

              {/* Contenu central */}
              <div className="relative flex flex-col items-center justify-center animate-fade-in">
                {(playStatus === 'downloading' || playStatus === 'buffering') && torrentStats && (progressPercentage > 0 || isDownloading) ? (
                  <div className="flex flex-col items-center">
                    <span className="text-white text-4xl font-black tracking-tighter">
                      {progressPercentage.toFixed(0)}<span className="text-xl text-primary-400">%</span>
                    </span>
                  </div>
                ) : playStatus === 'adding' ? (
                   <div className="text-4xl animate-float">📥</div>
                ) : isWaitingSeeders ? (
                  <div className="text-4xl animate-orbit">🔗</div>
                ) : (
                  <span className="text-white text-4xl font-black tracking-tighter">
                    {progressPercentage.toFixed(0)}<span className="text-xl text-primary-400">%</span>
                  </span>
                )}
              </div>

              {/* Badge vitesse flottant */}
              {isDownloading && (
                <div className="absolute -right-4 top-0 animate-float">
                  <div className="deep-glass px-3 py-1.5 rounded-2xl flex items-center gap-2 border border-green-500/30">
                    <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
                    <span className="text-green-400 text-xs font-black tracking-widest">{downloadSpeed} MB/s</span>
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

            {/* Card de détails Premium (Deep Glass) */}
            {playStatus === 'downloading' && torrentStats && (
              <div className="deep-glass p-8 rounded-[2.5rem] w-full max-w-md mx-auto group hover:bg-white/[0.05] transition-all duration-500">
                <div className="flex justify-between items-end mb-6">
                  <div className="text-left">
                    <div className="text-white/30 text-[10px] uppercase tracking-[0.2em] font-black mb-1">Téléchargé</div>
                    <div className="text-white text-2xl font-black">
                      {downloadedFormatted} <span className="text-white/20 text-sm font-light">/ {totalFormatted}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-primary-400/50 text-[10px] uppercase tracking-[0.2em] font-black mb-1">Temps restant</div>
                    <div className="text-primary-400 text-xl font-black tracking-tighter">{timeRemaining}</div>
                  </div>
                </div>
                
                {/* Barre de progression Shimmer */}
                <div className="mb-10 w-full bg-white/5 rounded-full h-1.5 overflow-hidden relative">
                  <div
                    className="bg-primary-500 h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(168,85,247,0.4)] relative"
                    style={{ width: `${progressPercentage}%` }}
                  >
                    <div className="absolute inset-0 bg-white/20 animate-shimmer" />
                  </div>
                </div>
                
                {/* Stats en grille */}
                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">
                      <span className="text-xs">⚡</span>
                    </div>
                    <div className="text-left">
                      <div className="text-white/30 text-[8px] uppercase tracking-widest font-bold">Vitesse</div>
                      <div className="text-white text-sm font-black">{downloadSpeed} MB/s</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center">
                      <span className="text-xs">👥</span>
                    </div>
                    <div className="text-left">
                      <div className="text-white/30 text-[8px] uppercase tracking-widest font-bold">Peers</div>
                      <div className="text-white text-sm font-black">{torrentStats.peers_connected}<span className="text-white/20">/{torrentStats.peers_total}</span></div>
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
