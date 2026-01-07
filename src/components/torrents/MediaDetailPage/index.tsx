import { useState, useEffect, useRef } from 'preact/hooks';
import { NotificationContainer } from '../../ui/Notification';
import type { MediaDetailPageProps } from './types';
import { useTorrentPlayer } from './hooks/useTorrentPlayer';
import { useVideoFiles } from './hooks/useVideoFiles';
import { useDebug } from './hooks/useDebug';
import { useNotifications } from './hooks/useNotifications';
import { createTorrentActions } from './actions/torrentActions';
import { ProgressOverlay } from './components/ProgressOverlay';
import { EnhancedProgressOverlay } from './components/EnhancedProgressOverlay';
import { VideoPlayerWrapper } from './components/VideoPlayerWrapper';
import { ActionButtons } from './components/ActionButtons';
import { TorrentInfo } from './components/TorrentInfo';
import { YouTubeVideoPlayer as VideoPlayer } from '../../ui/YouTubeVideoPlayer';
import { getPlaybackPosition } from '../../../lib/streaming/torrent-storage';
import { getOrCreateDeviceId } from '../../../lib/utils/device-id';
import { serverApi } from '../../../lib/client/server-api';
import { PROGRESS_POLL_INTERVAL_MS } from './utils/constants';

export default function MediaDetailPage({ torrent }: MediaDetailPageProps) {
  // États de base
  const [isPlaying, setIsPlaying] = useState(false);
  const [showInfo, setShowInfo] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(torrent.imageUrl || null);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(torrent.heroImageUrl || null);
  const isCompletedFromProps = torrent.clientState === 'completed' || 
                                torrent.clientState === 'seeding' || 
                                (torrent.clientProgress !== undefined && torrent.clientProgress >= 0.95);
  const [isAvailableLocally, setIsAvailableLocally] = useState(isCompletedFromProps);
  const [downloadingToClient, setDownloadingToClient] = useState(false);
  const [magnetCopied, setMagnetCopied] = useState(false);
  const [deletingMedia, setDeletingMedia] = useState(false);
  const [trailerKey, setTrailerKey] = useState<string | null>(torrent.trailerKey || null);
  const [isLoadingTrailer, setIsLoadingTrailer] = useState(false);
  const [isPlayingTrailer, setIsPlayingTrailer] = useState(false);

  // États pour les seeders/leechers
  const [currentSeedCount, setCurrentSeedCount] = useState<number>(torrent.seedCount);
  const [currentLeechCount, setCurrentLeechCount] = useState<number>(torrent.leechCount);
  const [currentFileSize, setCurrentFileSize] = useState<number>(torrent.fileSize);

  // États pour les variantes
  const [allVariants, setAllVariants] = useState<any[]>([torrent]);
  const [selectedTorrent, setSelectedTorrent] = useState<any>(torrent);
  
  // État pour la position de lecture sauvegardée
  const [savedPlaybackPosition, setSavedPlaybackPosition] = useState<number | null>(null);
  const [startFromBeginning, setStartFromBeginning] = useState(true);

  // Constantes dérivées
  const isExternal = torrent.id.startsWith('external_');
  const hasInfoHash = torrent.infoHash && torrent.infoHash.trim().length > 0;
  const hasMagnetLink = torrent._externalMagnetUri && torrent._externalMagnetUri.trim().length > 0;
  const canStream = hasInfoHash || (isExternal && (torrent._externalLink || hasMagnetLink));

  // Hooks personnalisés
  const { videoFiles, selectedFile, setVideoFiles, setSelectedFile, loadVideoFiles } = useVideoFiles({
    torrentName: torrent.name,
    onError: (error) => {
      console.error('Erreur lors du chargement des fichiers vidéo:', error);
    },
  });
  const { notifications, addNotification, removeNotification } = useNotifications();
  const { debugLogs, showDebug, setShowDebug, addDebugLog, clearDebugLogs } = useDebug();

  // Hook useTorrentPlayer
  const {
    playStatus,
    setPlayStatus,
    torrentStats,
    setTorrentStats,
    progressMessage,
    setProgressMessage,
    errorMessage,
    setErrorMessage,
    handlePlay,
    handleClosePlayer,
    stopProgressPolling,
    pollTorrentProgress,
    progressPollIntervalRef,
  } = useTorrentPlayer({
    torrent,
    isExternal,
    hasInfoHash,
    hasMagnetLink,
    canStream,
    isAvailableLocally,
    setIsAvailableLocally,
    loadVideoFiles,
    videoFiles,
    selectedFile,
    setVideoFiles,
    setSelectedFile,
    isPlaying,
    setIsPlaying,
    setShowInfo,
    addDebugLog,
  });

  // Actions torrent
  const { handleDownload, handleDownloadTorrent, handleCopyMagnet, handleDeleteMedia: deleteMediaAction } = createTorrentActions({
    torrent,
    isExternal,
    setDownloadingToClient,
    setMagnetCopied,
    addNotification,
  });

  const handleDeleteMedia = async () => {
    if (!hasInfoHash || !torrent.infoHash) {
      addNotification('error', 'Impossible de supprimer : infoHash manquant');
      return;
    }

    setDeletingMedia(true);
    try {
      await deleteMediaAction(torrent.infoHash, setIsAvailableLocally, addDebugLog);
    } finally {
      setDeletingMedia(false);
    }
  };

  // Vérifier la position de lecture sauvegardée
  useEffect(() => {
    const checkSavedPosition = async () => {
      if (torrent.id && typeof window !== 'undefined') {
        try {
          const deviceId = getOrCreateDeviceId();
          const position = await getPlaybackPosition(torrent.id, deviceId);
          if (position && position > 0) {
            setSavedPlaybackPosition(position);
          } else {
            setSavedPlaybackPosition(null);
          }
        } catch (err) {
          console.debug('Erreur lors de la vérification de la position de lecture:', err);
          setSavedPlaybackPosition(null);
        }
      }
    };
    checkSavedPosition();
  }, [torrent.id]);

  // Vérifier si le torrent est disponible localement
  useEffect(() => {
    if (torrent.clientState && torrent.clientProgress !== undefined) {
      const isCompleted = torrent.clientState === 'completed' || 
                          torrent.clientState === 'seeding' || 
                          torrent.clientProgress >= 0.95;
      if (isCompleted) {
        setIsAvailableLocally(true);
        addDebugLog('success', '📚 Torrent complété détecté depuis les props', {
          state: torrent.clientState,
          progress: `${(torrent.clientProgress * 100).toFixed(1)}%`,
        });
        return;
      }
    }

    if (hasInfoHash && torrent.infoHash && !isExternal) {
      const checkAvailability = async () => {
        try {
          const { webtorrentClient } = await import('../../../lib/torrent/webtorrent-client');
          const stats = await webtorrentClient.getTorrent(torrent.infoHash!);
          if (stats && (stats.state === 'completed' || stats.state === 'seeding' || stats.progress >= 0.95)) {
            setIsAvailableLocally(true);
            addDebugLog('success', '📚 Torrent disponible localement dans WebTorrent', {
              state: stats.state,
              progress: `${(stats.progress * 100).toFixed(1)}%`,
            });
          }
        } catch (err) {
          // Ignorer les erreurs
        }
      };
      
      checkAvailability();
    }
  }, [hasInfoHash, torrent.infoHash, torrent.clientState, torrent.clientProgress, isExternal]);

  // Vérifier si un téléchargement est en cours au montage
  useEffect(() => {
    const checkDownloadingTorrent = async () => {
      if (torrent.clientState && torrent.clientProgress !== undefined) {
        const isCompleted = torrent.clientState === 'completed' || 
                            torrent.clientState === 'seeding' || 
                            torrent.clientProgress >= 0.95;
        if (isCompleted && hasInfoHash && torrent.infoHash) {
          try {
            const videos = await loadVideoFiles(torrent.infoHash);
            if (videos.length > 0) {
              setVideoFiles(videos);
              if (!selectedFile) {
                setSelectedFile(videos[0]);
              }
            }
          } catch (err) {
            // Ignorer les erreurs
          }
          return;
        }
      }

      if (hasInfoHash && torrent.infoHash && !isPlaying && playStatus === 'idle') {
        try {
          const { webtorrentClient } = await import('../../../lib/torrent/webtorrent-client');
          const stats = await webtorrentClient.getTorrent(torrent.infoHash);
          if (stats) {
            if (stats.state === 'completed' || stats.state === 'seeding' || stats.progress >= 0.95) {
              setIsAvailableLocally(true);
              return;
            }
            
            if (stats.state === 'downloading' || stats.state === 'queued') {
              setPlayStatus(stats.state === 'queued' ? 'adding' : 'downloading');
              setTorrentStats(stats);
              await loadVideoFiles(torrent.infoHash);
              
              if (!progressPollIntervalRef.current) {
                progressPollIntervalRef.current = window.setInterval(() => {
                  pollTorrentProgress(torrent.infoHash!);
                }, PROGRESS_POLL_INTERVAL_MS);
                pollTorrentProgress(torrent.infoHash);
              }
            }
          }
        } catch (err) {
          // Ignorer les erreurs
        }
      }
    };
    
    checkDownloadingTorrent();
  }, [hasInfoHash, torrent.infoHash, torrent.clientState, torrent.clientProgress, isPlaying, playStatus]);

  // Charger la bande annonce
  const trailerFetchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!torrent.id) return;

    const identifier = (torrent.slug || torrent.id || '').toString().trim();
    if (!identifier || trailerFetchedRef.current === identifier) return;
    
    trailerFetchedRef.current = identifier;
    setIsLoadingTrailer(true);

    const baseUrl = serverApi.getServerUrl();
    const token = serverApi.getAccessToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    fetch(`${baseUrl}/api/torrents/${encodeURIComponent(identifier)}/trailer`, { headers })
      .then((res) => {
        if (res.status === 404) {
          setTrailerKey(null);
          setIsLoadingTrailer(false);
          return null;
        }
        if (!res.ok) {
          setTrailerKey(null);
          setIsLoadingTrailer(false);
          return null;
        }
        return res.json();
      })
      .catch(() => {
        setTrailerKey(null);
        setIsLoadingTrailer(false);
      })
      .then((data) => {
        if (data && data.success && data.trailerKey) {
          setTrailerKey(data.trailerKey);
          setIsPlayingTrailer(true);
        } else {
          setTrailerKey(null);
        }
      })
      .finally(() => {
        setIsLoadingTrailer(false);
      });
  }, [torrent.id, torrent.slug]);

  // Déterminer le torrent actif
  const activeTorrent = selectedTorrent || torrent;
  const activeInfoHash = activeTorrent.infoHash;
  
  // Vérifier si on peut afficher le lecteur vidéo
  const canShowVideoPlayer = isPlaying && activeInfoHash && selectedFile && videoFiles.length > 0;
  
  // Ref pour le wrapper vidéo
  const videoWrapperRef = useRef<HTMLDivElement | null>(null);
  
  // Afficher l'overlay de progression si nécessaire
  const shouldShowOverlay = !canShowVideoPlayer && playStatus !== 'idle' && playStatus !== 'error';

  if (shouldShowOverlay) {
    return (
      <EnhancedProgressOverlay
        playStatus={playStatus}
        torrentStats={torrentStats}
        progressMessage={progressMessage}
        errorMessage={errorMessage}
        imageUrl={imageUrl}
        showDebug={showDebug}
        debugLogs={debugLogs}
        onCancel={async () => {
          const activeInfoHash = (selectedTorrent || torrent).infoHash;
          
          if (activeInfoHash && torrentStats) {
            const shouldDelete = confirm('Voulez-vous annuler et supprimer le téléchargement ?');
            
            if (shouldDelete) {
              try {
                const { webtorrentClient } = await import('../../../lib/torrent/webtorrent-client');
                addDebugLog('info', '🗑️ Suppression du torrent en cours...', { infoHash: activeInfoHash });
                await webtorrentClient.removeTorrent(activeInfoHash, false);
                addDebugLog('success', '✅ Torrent supprimé');
                addNotification('success', 'Téléchargement annulé et supprimé');
              } catch (err) {
                addDebugLog('error', '❌ Erreur lors de la suppression du torrent', { error: err });
                addNotification('error', 'Erreur lors de la suppression du torrent');
              }
            }
          }
          
          stopProgressPolling();
          setPlayStatus('idle');
          setProgressMessage('');
          setTorrentStats(null);
          setErrorMessage(null);
          addDebugLog('info', '=== Annulation ===');
        }}
        onRetry={() => {
          setPlayStatus('idle');
          setErrorMessage(null);
          setProgressMessage('');
          handlePlay();
        }}
        onToggleDebug={() => setShowDebug(!showDebug)}
        onCopyLogs={async () => {
          try {
            const logsText = debugLogs.map(log => {
              const dataStr = log.data ? `\n  Data: ${JSON.stringify(log.data, null, 2)}` : '';
              return `[${log.time}] [${log.type.toUpperCase()}] ${log.message}${dataStr}`;
            }).join('\n\n');
            await navigator.clipboard.writeText(logsText);
            addDebugLog('success', '✅ Logs copiés dans le presse-papiers');
          } catch (err) {
            const textarea = document.createElement('textarea');
            const logsText = debugLogs.map(log => {
              const dataStr = log.data ? `\n  Data: ${JSON.stringify(log.data, null, 2)}` : '';
              return `[${log.time}] [${log.type.toUpperCase()}] ${log.message}${dataStr}`;
            }).join('\n\n');
            textarea.value = logsText;
            textarea.style.position = 'fixed';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            addDebugLog('success', '✅ Logs copiés dans le presse-papiers (fallback)');
          }
        }}
        onClearLogs={() => {
          clearDebugLogs();
          addDebugLog('info', '=== Logs effacés ===');
        }}
      />
    );
  }

  // Si on peut afficher le lecteur vidéo, l'afficher
  if (canShowVideoPlayer && !shouldShowOverlay) {
    return (
      <VideoPlayerWrapper
        infoHash={activeInfoHash}
        selectedFile={selectedFile}
        torrentName={activeTorrent.cleanTitle || activeTorrent.name}
        torrentId={activeTorrent.id}
        startFromBeginning={startFromBeginning}
        onClose={handleClosePlayer}
        visible={true}
        wrapperRef={(el) => { videoWrapperRef.current = el; }}
      />
    );
  }

  // Page principale
  return (
    <>
      {activeInfoHash && !shouldShowOverlay && (
        <VideoPlayerWrapper
          infoHash={activeInfoHash}
          selectedFile={selectedFile}
          torrentName={activeTorrent.cleanTitle || activeTorrent.name}
          torrentId={activeTorrent.id}
          startFromBeginning={startFromBeginning}
          onClose={handleClosePlayer}
          visible={false}
          wrapperRef={(el) => { videoWrapperRef.current = el; }}
        />
      )}
    <div className="relative bg-black text-white">
      {/* Hero section */}
      {isPlayingTrailer && trailerKey ? (
        <div className="fixed top-0 left-0 right-0 bottom-0 z-0 overflow-hidden pointer-events-none">
          <VideoPlayer
            youtubeKey={trailerKey}
            autoplay={true}
            muted={true}
            loop={true}
            controls={false}
            cover={true}
            className="absolute inset-0 w-full h-full"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/40 to-black" />
        </div>
      ) : imageUrl ? (
        <div className="fixed top-0 left-0 right-0 bottom-0 z-0 overflow-hidden pointer-events-none">
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{
              backgroundImage: `url(${imageUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/40 to-black" />
        </div>
      ) : (
        <div className="fixed top-0 left-0 right-0 bottom-0 z-0 bg-gradient-to-b from-gray-900 to-black pointer-events-none" />
      )}

      {/* Contenu principal */}
      <div className="relative z-10">
        <div className="relative w-full min-h-[60vh] sm:min-h-[70vh] flex flex-col justify-end px-3 sm:px-4 md:px-6 lg:px-16 pb-8 sm:pb-12 md:pb-16 pt-20 sm:pt-24 md:pt-32">
          <a
            href="/dashboard"
            className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors mb-4 sm:mb-6 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2 focus:ring-offset-black rounded px-2 py-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="text-sm sm:text-base">Retour</span>
          </a>

          <div className="max-w-4xl">
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold mb-3 sm:mb-4 leading-tight">
              {torrent.cleanTitle ? torrent.cleanTitle : torrent.name}
            </h1>

            {/* Boutons d'action */}
            <ActionButtons
              torrent={selectedTorrent || torrent}
              isAvailableLocally={isAvailableLocally}
              canStream={canStream}
              isExternal={isExternal}
              hasInfoHash={hasInfoHash}
              magnetCopied={magnetCopied}
              downloadingToClient={downloadingToClient}
              deletingMedia={deletingMedia}
              trailerKey={trailerKey}
              isLoadingTrailer={isLoadingTrailer}
              isPlayingTrailer={isPlayingTrailer}
              savedPlaybackPosition={savedPlaybackPosition}
              onPlay={async () => {
                if (savedPlaybackPosition && savedPlaybackPosition > 0) {
                  setStartFromBeginning(false);
                } else {
                  setStartFromBeginning(true);
                }
                
                let wrapperElement = videoWrapperRef.current;
                if (!wrapperElement) {
                  wrapperElement = document.getElementById('video-player-wrapper') as HTMLDivElement;
                }
                
                if (wrapperElement && !document.fullscreenElement) {
                  try {
                    await wrapperElement.requestFullscreen();
                  } catch (err) {
                    console.warn('Impossible d\'activer le plein écran:', err);
                  }
                }
                
                handlePlay();
              }}
              onPlayFromBeginning={async () => {
                setStartFromBeginning(true);
                
                let wrapperElement = videoWrapperRef.current;
                if (!wrapperElement) {
                  wrapperElement = document.getElementById('video-player-wrapper') as HTMLDivElement;
                }
                
                if (wrapperElement && !document.fullscreenElement) {
                  try {
                    await wrapperElement.requestFullscreen();
                  } catch (err) {
                    console.warn('Impossible d\'activer le plein écran:', err);
                  }
                }
                
                handlePlay();
              }}
              onDownload={handleDownload}
              onDownloadTorrent={handleDownloadTorrent}
              onCopyMagnet={handleCopyMagnet}
              onDeleteMedia={handleDeleteMedia}
              onPlayTrailer={() => {
                if (isPlayingTrailer) {
                  setIsPlayingTrailer(false);
                  return;
                }
                
                if (trailerKey) {
                  setIsPlayingTrailer(true);
                } else if (!isLoadingTrailer) {
                  const identifier = (torrent.slug || torrent.id || '').toString().trim();
                  if (identifier) {
                    setIsLoadingTrailer(true);
                    const baseUrl = serverApi.getServerUrl();
                    const token = serverApi.getAccessToken();
                    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
                    fetch(`${baseUrl}/api/torrents/${encodeURIComponent(identifier)}/trailer`, { headers })
                      .then((res) => res.json())
                      .then((data) => {
                        if (data && data.success && data.trailerKey) {
                          setTrailerKey(data.trailerKey);
                          setIsPlayingTrailer(true);
                        } else {
                          addNotification('info', 'Bande-annonce non disponible pour ce média');
                        }
                      })
                      .catch(() => {
                        addNotification('error', 'Erreur lors du chargement de la bande-annonce');
                      })
                      .finally(() => {
                        setIsLoadingTrailer(false);
                      });
                  }
                }
              }}
            />

            {/* Informations détaillées */}
            {showInfo && (
              <TorrentInfo
                torrent={selectedTorrent || torrent}
                seedCount={currentSeedCount}
                leechCount={currentLeechCount}
                fileSize={currentFileSize}
              />
            )}
          </div>
        </div>
      </div>

      {/* Notifications */}
      <NotificationContainer notifications={notifications} onRemove={removeNotification} />
    </div>
    </>
  );
}
