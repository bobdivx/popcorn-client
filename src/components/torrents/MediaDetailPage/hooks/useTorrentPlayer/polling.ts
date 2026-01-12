import { clientApi } from '../../../../../lib/client/api';
import type { ClientTorrentStats } from '../../../../../lib/client/types';
import { QUEUED_TIMEOUT_MS, QUEUED_LOG_INTERVAL_MS, QUEUED_RETRY_RESUME_MS } from '../../utils/constants';
import type { PollingContext } from './types';

export function createPollTorrentProgress(context: PollingContext) {
  const {
    setPlayStatus,
    setTorrentStats,
    setProgressMessage,
    setErrorMessage,
    stopProgressPolling,
    setIsPlaying,
    setShowInfo,
    setVideoFiles,
    setSelectedFile,
    addDebugLog,
    playStatus,
    isPlaying,
    videoFiles,
    selectedFile,
    torrent,
    loadVideoFiles,
    progressPollIntervalRef,
    queuedStartTimeRef,
    lastQueuedLogTimeRef,
    lastResumeAttemptRef,
  } = context;

  return async (infoHash: string) => {
    // Ne pas poller si la lecture est déjà en cours (pour le streaming)
    // Mais permettre le polling pendant le téléchargement (isPlaying = false)
    if (isPlaying) {
      stopProgressPolling();
      if (playStatus !== 'ready' && playStatus !== 'error') {
        setPlayStatus('ready');
      }
      return;
    }

    // Ne pas poller si la page n'est pas visible
    if (document.hidden) {
      return;
    }

    try {
      const stats = await clientApi.getTorrent(infoHash);
      if (stats) {
        // Mettre à jour les stats (utilisé pour afficher le statut de téléchargement sur la page détail)
        setTorrentStats(stats);

        const progress = stats.progress || 0;
        const state = (stats.state || '').toLowerCase();
        const now = Date.now();

        // Si le torrent est complété, arrêter le polling
        if (state === 'completed' || state === 'seeding' || progress >= 1.0) {
          stopProgressPolling();
        }

        // Vérifier si le torrent est resté trop longtemps en état "Queued"
        if (state === 'queued') {
          if (queuedStartTimeRef.current === null) {
            queuedStartTimeRef.current = now;
          } else {
            const timeInQueued = now - queuedStartTimeRef.current;
            if (timeInQueued > QUEUED_TIMEOUT_MS) {
              stopProgressPolling();
              setPlayStatus('error');
              setErrorMessage(
                'Le torrent n\'a pas pu démarrer. Il est resté en file d\'attente trop longtemps (plus de 3 minutes).'
              );
              addDebugLog('error', '⏱️ Timeout: Le torrent est resté en état "Queued" trop longtemps', {
                timeInQueuedSeconds: Math.floor(timeInQueued / 1000),
                timeoutSeconds: QUEUED_TIMEOUT_MS / 1000,
              });
              queuedStartTimeRef.current = null;
              return;
            }
          }
        } else {
          queuedStartTimeRef.current = null;
          lastResumeAttemptRef.current = null;
        }

        // Message principal avec les infos
        const speedMBps = (stats.download_speed / (1024 * 1024)).toFixed(2);
        const progressPercent = (stats.progress * 100).toFixed(2);
        const statusMsg = `État: ${stats.state} | Progression: ${progressPercent}% | Vitesse: ${speedMBps} MB/s | Peers: ${stats.peers_connected}`;

        let logType: 'info' | 'success' | 'warning' = 'info';
        if (stats.download_speed > 0) {
          logType = 'success';
        } else if (stats.peers_connected === 0 && stats.state === 'downloading') {
          logType = 'warning';
        }

        const shouldLog = state !== 'queued' || lastQueuedLogTimeRef.current === null || now - lastQueuedLogTimeRef.current >= QUEUED_LOG_INTERVAL_MS;

        if (shouldLog) {
          addDebugLog(logType, statusMsg, {
            state: stats.state,
            progress: `${progressPercent}%`,
            download_speed_mb: `${speedMBps} MB/s`,
            peers_connected: stats.peers_connected,
            eta_seconds: stats.eta_seconds,
          });

          if (state === 'queued') {
            lastQueuedLogTimeRef.current = now;
          } else {
            lastQueuedLogTimeRef.current = null;
          }
        }

        // Traiter selon l'état du torrent
        if (state === 'queued' && !isPlaying) {
          await handleQueuedState(infoHash, stats, now, context);
        } else if (state === 'downloading') {
          await handleDownloadingState(infoHash, stats, progress, context);
        } else if (state === 'seeding' || state === 'completed') {
          await handleCompletedState(infoHash, stats, progress, context);
        } else if (state === 'paused') {
          await handlePausedState(infoHash, context);
        } else if (state === 'error') {
          handleErrorState(context);
        }
      } else {
        setPlayStatus('error');
        setErrorMessage('Torrent introuvable dans le client');
        stopProgressPolling();
      }
    } catch (err) {
      console.error('Erreur lors du polling de progression:', err);
    }
  };
}

async function handleQueuedState(
  infoHash: string,
  stats: ClientTorrentStats,
  now: number,
  context: PollingContext
) {
  const { setPlayStatus, setProgressMessage, addDebugLog, loadVideoFiles, setVideoFiles, setSelectedFile, lastResumeAttemptRef, torrent, isPlaying, videoFiles } = context;

  setPlayStatus('adding');

  if (stats.total_bytes === 0) {
    // Pas encore de métadonnées
    if (stats.peers_connected === 0) {
      setProgressMessage('Recherche de peers... (aucun peer trouvé pour le moment)');
      addDebugLog('warning', '⚠️ Torrent en file d\'attente - Aucun peer disponible', {
        total_bytes: stats.total_bytes,
        peers: stats.peers_connected,
        seeders: stats.seeders,
        leechers: stats.leechers,
      });
    } else {
      setProgressMessage(`Récupération des métadonnées du torrent via ${stats.peers_connected} peer(s)...`);
      addDebugLog('info', '📡 Torrent en file d\'attente - Métadonnées en cours de récupération', {
        total_bytes: stats.total_bytes,
        peers: stats.peers_connected,
        seeders: stats.seeders,
        leechers: stats.leechers,
      });
    }

    const nowTime = Date.now();
    const lastResumeAttempt = lastResumeAttemptRef.current;

    // Essayer de reprendre le torrent périodiquement
    // Mais seulement si on a des peers ou si on attend depuis un moment
    if (!lastResumeAttempt || nowTime - lastResumeAttempt >= QUEUED_RETRY_RESUME_MS) {
      lastResumeAttemptRef.current = nowTime;
      
      // Ne pas essayer de reprendre si on n'a pas de peers - cela peut causer des erreurs
      if (stats.peers_connected > 0) {
        addDebugLog('info', '🔄 Tentative de reprise du torrent...', {
          peers: stats.peers_connected,
        });
        clientApi.resumeTorrent(infoHash).catch((err: any) => {
          addDebugLog('warning', 'Impossible de reprendre le torrent', { 
            error: err instanceof Error ? err.message : String(err),
          });
        });
      } else {
        addDebugLog('info', '⏳ En attente de peers avant de reprendre le torrent...', {
          seeders: stats.seeders,
          leechers: stats.leechers,
        });
      }
    }

    // Ne pas charger les fichiers vidéo pendant le téléchargement (isPlaying = false)
    // Les fichiers seront chargés uniquement quand l'utilisateur clique sur "Lire"
    // Cela évite de déclencher le lecteur HLS pendant le téléchargement
  } else {
    // Métadonnées disponibles mais torrent toujours en queue
    setProgressMessage('En attente de téléchargement...');
    
    // Ne pas charger les fichiers vidéo pendant le téléchargement (isPlaying = false)
    // Les fichiers seront chargés uniquement quand l'utilisateur clique sur "Lire"
    // Cela évite de déclencher le lecteur HLS pendant le téléchargement

    // Essayer de reprendre le torrent périodiquement
    const shouldRetryResume = lastResumeAttemptRef.current === null || now - lastResumeAttemptRef.current >= QUEUED_RETRY_RESUME_MS;
    if (shouldRetryResume) {
      lastResumeAttemptRef.current = now;
      clientApi.resumeTorrent(infoHash).then(() => {
        addDebugLog('info', '🔄 Tentative de reprise du torrent');
      }).catch(() => {});
    }
  }
}

async function handleDownloadingState(
  infoHash: string,
  stats: ClientTorrentStats,
  progress: number,
  context: PollingContext
) {
  const { setPlayStatus, setProgressMessage, addDebugLog, loadVideoFiles, setVideoFiles, setSelectedFile, videoFiles, torrent, isPlaying, setIsPlaying, setShowInfo, stopProgressPolling } = context;

  setPlayStatus('downloading');
  const downloadedMB = (stats.downloaded_bytes / (1024 * 1024)).toFixed(2);
  const totalMB = (stats.total_bytes / (1024 * 1024)).toFixed(2);
  const speedMBps = (stats.download_speed / (1024 * 1024)).toFixed(2);

  if (stats.download_speed > 0) {
    setProgressMessage(`${downloadedMB} MB / ${totalMB} MB • ${speedMBps} MB/s`);
  } else {
    if (stats.peers_connected === 0) {
      setProgressMessage(`Recherche de connexion...`);
      addDebugLog('warning', '⚠️ Aucun peer disponible', {
        seeders: stats.seeders,
        leechers: stats.leechers,
      });
    } else {
      setProgressMessage(`${stats.peers_connected} peer${stats.peers_connected > 1 ? 's' : ''} connecté${stats.peers_connected > 1 ? 's' : ''}`);
    }
  }

  // Charger les fichiers vidéo UNIQUEMENT si on est en mode streaming (isPlaying = true)
  // Pendant le téléchargement (isPlaying = false), ne pas charger les fichiers pour éviter de déclencher le lecteur HLS
  // Les fichiers seront chargés uniquement quand l'utilisateur clique sur "Lire"
  if (videoFiles.length === 0 && isPlaying) {
    loadVideoFiles(infoHash).then((videos) => {
      if (videos.length > 0) {
        addDebugLog('success', '✅ Fichiers vidéo chargés en préparation', {
          selected_file: videos[0].path,
          file_size_mb: (videos[0].size / (1024 * 1024)).toFixed(2),
          progress: (progress * 100).toFixed(1) + '%',
          files_count: videos.length,
        });
        setVideoFiles(videos);
        setSelectedFile(videos[0]);
      } else {
        // Pas encore de fichiers, mais on est en téléchargement
        // Cela peut arriver si les métadonnées viennent d'arriver
        // Le polling continuera à vérifier
        addDebugLog('info', '⏳ Fichiers pas encore disponibles, attente...', {
          total_bytes: stats.total_bytes,
          progress: (progress * 100).toFixed(1) + '%',
        });
      }
    }).catch((err) => {
      addDebugLog('warning', '⚠️ Erreur lors du chargement des fichiers', {
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
  
  // Ne pas lancer automatiquement la lecture pendant le téléchargement
  // La lecture ne sera lancée que quand l'utilisateur clique explicitement sur "Lire"
  // (via handlePlay qui vérifie si le torrent est disponible)
}

async function handleCompletedState(
  infoHash: string,
  stats: ClientTorrentStats,
  progress: number,
  context: PollingContext
) {
  const { setPlayStatus, setProgressMessage, addDebugLog, loadVideoFiles, setVideoFiles, setSelectedFile, setIsPlaying, setShowInfo, setIsAvailableLocally, stopProgressPolling } = context;

  setPlayStatus('ready');
  setProgressMessage('Téléchargement terminé !');
  
  // Marquer le torrent comme disponible localement
  setIsAvailableLocally(true);
  addDebugLog('success', '📚 Torrent marqué comme disponible localement', {
    state: stats.state,
    progress: `${(progress * 100).toFixed(1)}%`,
  });
  
  try {
    const videos = await loadVideoFiles(infoHash);
    addDebugLog('success', '✅ Torrent terminé, fichiers vidéo chargés', {
      videoFiles_count: videos.length,
    });

    if (videos.length > 0) {
      const fileToUse = videos[0];
      setVideoFiles(videos);
      setSelectedFile(fileToUse);
      
      addDebugLog('success', '✅ Démarrage de la lecture (torrent completed par libtorrent)', {
        selected_file: fileToUse.path,
      });
      
      stopProgressPolling();
      
      // Lancer la lecture immédiatement quand le torrent est marqué "completed" par libtorrent
      // Le lecteur HLS gérera les erreurs et réessayera automatiquement si le fichier n'est pas encore prêt
      setIsPlaying(true);
      setShowInfo(false);
    } else {
      setPlayStatus('error');
      addDebugLog('error', '❌ Aucun fichier vidéo trouvé dans le torrent terminé');
      stopProgressPolling();
    }
  } catch (err) {
    console.error('Erreur lors du chargement des fichiers vidéo:', err);
    setPlayStatus('error');
    stopProgressPolling();
  }
}

async function handlePausedState(infoHash: string, context: PollingContext) {
  const { setPlayStatus, setProgressMessage } = context;
  setPlayStatus('downloading');
  setProgressMessage('Torrent en pause. Reprise...');
  try {
    await clientApi.resumeTorrent(infoHash);
  } catch (err) {
    console.error('Erreur lors de la reprise:', err);
  }
}

function handleErrorState(context: PollingContext) {
  const { setPlayStatus, setErrorMessage, stopProgressPolling } = context;
  setPlayStatus('error');
  setErrorMessage('Erreur lors du téléchargement du torrent');
  stopProgressPolling();
}
