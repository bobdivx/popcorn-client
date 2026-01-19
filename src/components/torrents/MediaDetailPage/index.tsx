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
import { QualityBadges } from './components/QualityBadges';
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
  const hasInfoHash = typeof torrent.infoHash === 'string' && torrent.infoHash.trim().length > 0;
  const hasMagnetLink = typeof torrent._externalMagnetUri === 'string' && torrent._externalMagnetUri.trim().length > 0;
  const canStream = hasInfoHash || (isExternal && (!!torrent._externalLink || hasMagnetLink));

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
    setPlayStatus,
    pollTorrentProgress,
    progressPollIntervalRef,
    PROGRESS_POLL_INTERVAL_MS,
    onPlayAfterDownload: handlePlay,
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

    if (hasInfoHash && torrent.infoHash) {
      const checkAvailability = async () => {
        try {
          // #region agent log
          fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MediaDetailPage.tsx:166',message:'Vérification disponibilité torrent au chargement',data:{infoHash:torrent.infoHash?.substring(0,12),hasInfoHash,isExternal},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          const { clientApi } = await import('../../../lib/client/api');
          const stats = await clientApi.getTorrent(torrent.infoHash!);
          // #region agent log
          fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MediaDetailPage.tsx:170',message:'Stats torrent récupérées',data:{hasStats:!!stats,state:stats?.state,progress:stats?.progress,isCompleted:stats?(stats.state==='completed'||stats.state==='seeding'||stats.progress>=0.95):false},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          if (stats) {
            // Toujours mettre à jour torrentStats pour que le bouton "Lire" puisse s'afficher
            console.log('[MediaDetailPage] checkAvailability: Mise à jour torrentStats', {
              state: stats.state,
              progress: stats.progress,
              isCompleted: stats.state === 'completed' || stats.state === 'seeding' || stats.progress >= 0.95,
            });
            setTorrentStats(stats);
            
            if (stats.state === 'completed' || stats.state === 'seeding' || stats.progress >= 0.95) {
              setIsAvailableLocally(true);
              // #region agent log
              fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MediaDetailPage.tsx:171',message:'isAvailableLocally défini à true',data:{state:stats.state,progress:stats.progress},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
              // #endregion
              addDebugLog('success', '📚 Torrent disponible localement dans le backend', {
                state: stats.state,
                progress: `${(stats.progress * 100).toFixed(1)}%`,
              });
            }
          } else {
            console.log('[MediaDetailPage] checkAvailability: Aucune stats récupérée pour', torrent.infoHash);
          }
        } catch (err) {
          // #region agent log
          fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MediaDetailPage.tsx:178',message:'Erreur vérification disponibilité',data:{error:err instanceof Error?err.message:String(err)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
          // #endregion
          // Ignorer les erreurs
        }
      };
      
      checkAvailability();
    }
  }, [hasInfoHash, torrent.infoHash, torrent.clientState, torrent.clientProgress, isExternal]);

  // Vérifier si un téléchargement est en cours au montage
  useEffect(() => {
    const checkDownloadingTorrent = async () => {
      // #region agent log
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MediaDetailPage.tsx:188',message:'checkDownloadingTorrent appelé',data:{hasClientState:!!torrent.clientState,clientState:torrent.clientState,clientProgress:torrent.clientProgress,hasInfoHash,infoHash:torrent.infoHash?.substring(0,12)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      if (torrent.clientState && torrent.clientProgress !== undefined) {
        const isCompleted = torrent.clientState === 'completed' || 
                            torrent.clientState === 'seeding' || 
                            torrent.clientProgress >= 0.95;
        // #region agent log
        fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MediaDetailPage.tsx:193',message:'Vérification complétion depuis props',data:{isCompleted,clientState:torrent.clientState,clientProgress:torrent.clientProgress},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        if (isCompleted && hasInfoHash && torrent.infoHash) {
          try {
            const videos = await loadVideoFiles(torrent.infoHash);
            // #region agent log
            fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MediaDetailPage.tsx:196',message:'Fichiers vidéo chargés depuis props',data:{videosCount:videos.length,hasSelectedFile:!!selectedFile},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            if (videos.length > 0) {
              setVideoFiles(videos);
              if (!selectedFile) {
                setSelectedFile(videos[0]);
              }
            }
          } catch (err) {
            // #region agent log
            fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'MediaDetailPage.tsx:203',message:'Erreur chargement fichiers depuis props',data:{error:err instanceof Error?err.message:String(err)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
            // #endregion
            // Ignorer les erreurs
          }
          return;
        }
      }

      if (hasInfoHash && torrent.infoHash && !isPlaying && playStatus === 'idle') {
        try {
          const { clientApi } = await import('../../../lib/client/api');
          const stats = await clientApi.getTorrent(torrent.infoHash);
          if (stats) {
            // Toujours mettre à jour torrentStats pour que le bouton "Lire" puisse s'afficher
            console.log('[MediaDetailPage] checkDownloadingTorrent: Mise à jour torrentStats', {
              state: stats.state,
              progress: stats.progress,
              isCompleted: stats.state === 'completed' || stats.state === 'seeding' || stats.progress >= 0.95,
            });
            setTorrentStats(stats);
            
            if (stats.state === 'completed' || stats.state === 'seeding' || stats.progress >= 0.95) {
              setIsAvailableLocally(true);
              // Si le téléchargement est terminé, réinitialiser le flag
              continueInBackgroundRef.current = false;
              // Charger les fichiers vidéo pour permettre la lecture
              try {
                await loadVideoFiles(torrent.infoHash);
              } catch (err) {
                // Ignorer les erreurs de chargement de fichiers
              }
              return;
            }
            
            if (stats.state === 'downloading' || stats.state === 'queued') {
              // Pour le téléchargement (pas streaming), ne pas changer playStatus (réservé au streaming)
              // Ne pas charger les fichiers vidéo pendant le téléchargement (réservé au streaming)
              // Démarrer le polling pour suivre la progression et mettre à jour torrentStats
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

  // Utiliser directement le trailerKey du torrent s'il est disponible
  // Sinon, essayer de le charger via l'API (fallback)
  const trailerFetchedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!torrent.id && !torrent.slug) return;

    // Si le torrent a déjà un trailerKey, l'utiliser directement
    if (torrent.trailerKey) {
      setTrailerKey(torrent.trailerKey);
      trailerFetchedRef.current = (torrent.slug || torrent.id || '').toString().trim();
      return;
    }

    // Sinon, essayer de charger via l'API (fallback)
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
  }, [torrent.id, torrent.slug, torrent.trailerKey]);

  // Déterminer le torrent actif
  const activeTorrent = selectedTorrent || torrent;
  const activeInfoHash = activeTorrent.infoHash;
  
  // Vérifier si on peut afficher le lecteur vidéo
  const canShowVideoPlayer = isPlaying && activeInfoHash && selectedFile && videoFiles.length > 0;
  
  // Ref pour le wrapper vidéo
  const videoWrapperRef = useRef<HTMLDivElement | null>(null);
  
  // Flag pour indiquer qu'on continue en arrière-plan (pour éviter que l'overlay se réaffiche)
  const continueInBackgroundRef = useRef<boolean>(false);
  
  // Afficher l'overlay de progression UNIQUEMENT pour le streaming (bouton "Lire")
  // Pas pour le téléchargement (bouton "Télécharger") - le statut sera affiché sur la page détail
  // L'overlay ne doit s'afficher que si on a cliqué sur "Lire" ET que le torrent n'est pas encore prêt
  // Si le torrent est disponible localement et qu'on clique sur "Lire", on lance directement la lecture sans overlay
  const shouldShowOverlay = !canShowVideoPlayer && 
                            playStatus !== 'idle' && 
                            playStatus !== 'error' && 
                            playStatus !== 'ready' && // 'ready' signifie qu'on peut lancer directement la lecture
                            !continueInBackgroundRef.current &&
                            isPlaying; // L'overlay ne s'affiche que si on est en mode streaming (isPlaying = true)

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
          
          // Réinitialiser le flag de continuation en arrière-plan
          continueInBackgroundRef.current = false;
          
          if (activeInfoHash && torrentStats) {
            const shouldDelete = confirm('Voulez-vous annuler et supprimer le téléchargement ?');
            
            if (shouldDelete) {
              try {
                const { clientApi } = await import('../../../lib/client/api');
                addDebugLog('info', '🗑️ Suppression du torrent en cours...', { infoHash: activeInfoHash });
                await clientApi.removeTorrent(activeInfoHash, false);
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
        onContinueInBackground={() => {
          // Fermer l'overlay mais continuer le téléchargement en arrière-plan
          // Ne pas arrêter le polling, juste masquer l'overlay
          continueInBackgroundRef.current = true;
          // Ne pas appeler stopProgressPolling() - on veut continuer à suivre la progression
          // Le polling continue en arrière-plan pour suivre la progression
          setPlayStatus('idle'); // Masquer l'overlay
          // Garder torrentStats pour qu'on puisse voir la progression si on revient
          // Ne pas réinitialiser torrentStats pour garder les stats actuelles
          setProgressMessage('');
          setErrorMessage(null);
          addDebugLog('info', '📱 Téléchargement continué en arrière-plan', { 
            hasPolling: !!progressPollIntervalRef.current,
            torrentStats: torrentStats ? { progress: torrentStats.progress, state: torrentStats.state } : null
          });
          addNotification('info', 'Le téléchargement continue en arrière-plan');
        }}
        onRetry={() => {
          // Réinitialiser le flag de continuation en arrière-plan quand on réessaie
          continueInBackgroundRef.current = false;
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
        quality={activeTorrent.quality}
      />
    );
  }

  // Page principale
  return (
    <>
      {/* Ne rendre VideoPlayerWrapper QUE si on est en mode streaming (isPlaying = true) */}
      {/* Pendant le téléchargement (isPlaying = false), ne pas rendre le composant pour éviter de déclencher le lecteur HLS */}
      {activeInfoHash && !shouldShowOverlay && isPlaying && canShowVideoPlayer && (
        <VideoPlayerWrapper
          infoHash={activeInfoHash}
          selectedFile={selectedFile}
          torrentName={activeTorrent.cleanTitle || activeTorrent.name}
          torrentId={activeTorrent.id}
          startFromBeginning={startFromBeginning}
          onClose={handleClosePlayer}
          visible={true}
          wrapperRef={(el) => { videoWrapperRef.current = el; }}
          quality={activeTorrent.quality}
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
            className="inline-flex items-center gap-2 text-white/80 hover:text-white transition-colors mb-4 sm:mb-6 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 focus:ring-offset-black rounded px-2 py-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span className="text-sm sm:text-base">Retour</span>
          </a>

          <div className="max-w-4xl">
            <div className="mb-4 sm:mb-6">
              <div className="flex items-baseline gap-4 flex-wrap">
                <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold leading-tight">
                  {torrent.cleanTitle ? torrent.cleanTitle : torrent.name}
                </h1>
                {torrent.releaseDate && (
                  <div className="flex items-center">
                    <span className="inline-flex items-center justify-center px-4 py-2 bg-gradient-to-r from-gray-800/90 to-gray-900/90 backdrop-blur-md text-white/95 text-base sm:text-lg md:text-xl font-semibold rounded-lg border border-white/30 shadow-lg min-w-[70px]">
                      {new Date(torrent.releaseDate).getFullYear()}
                    </span>
                  </div>
                )}
              </div>
              {/* Badges de qualité sous le titre avec logos officiels */}
              {torrent.quality && (
                <div className="mt-3 sm:mt-4">
                  <QualityBadges quality={torrent.quality} />
                </div>
              )}
            </div>

            {/* Boutons d'action */}
            <ActionButtons
              torrent={selectedTorrent || torrent}
              allVariants={allVariants}
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
              torrentStats={torrentStats}
              onPlayAuto={async (bestTorrent) => {
                // Sélectionner le meilleur torrent
                setSelectedTorrent(bestTorrent);
                setStartFromBeginning(true);
                
                // Réinitialiser le flag de continuation en arrière-plan
                continueInBackgroundRef.current = false;
                
                // Utiliser le torrent sélectionné pour la lecture
                const wrapperElement = videoWrapperRef.current || (document.getElementById('video-player-wrapper') as HTMLDivElement);
                
                if (wrapperElement && !document.fullscreenElement) {
                  try {
                    await wrapperElement.requestFullscreen();
                  } catch (err) {
                    console.warn('Impossible d\'activer le plein écran:', err);
                  }
                }
                
                // Attendre un court délai pour que le state soit mis à jour, puis jouer
                setTimeout(() => {
                  handlePlay();
                }, 150);
              }}
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
                
                // Réinitialiser le flag de continuation en arrière-plan quand on clique sur "Lire"
                continueInBackgroundRef.current = false;
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
                
                // Réinitialiser le flag de continuation en arrière-plan quand on joue depuis le début
                continueInBackgroundRef.current = false;
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
                sources={allVariants && allVariants.length > 1 ? allVariants.map((variant) => ({
                  tracker: variant.indexerName || variant.uploader || 'Tracker',
                  seeds: variant.seedCount || 0,
                  peers: variant.leechCount || 0,
                  quality: variant.quality?.resolution as 'Remux' | '4K' | '1080p' | '720p' | '480p' | undefined,
                  codec: variant.codec as 'x264' | 'x265' | 'AV1' | undefined,
                  fileSize: variant.fileSize,
                })) : undefined}
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
