import { webtorrentClient, type ClientTorrentStats } from '../../../../../lib/torrent/webtorrent-client';
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
    // Ne pas poller si la lecture est déjà en cours
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
      const stats = await webtorrentClient.getTorrent(infoHash);
      if (stats) {
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
  const { setPlayStatus, setProgressMessage, addDebugLog, loadVideoFiles, setVideoFiles, setSelectedFile, lastResumeAttemptRef, torrent, isPlaying } = context;

  setPlayStatus('adding');

  if (stats.total_bytes === 0) {
    setProgressMessage('Récupération des métadonnées du torrent via DHT...');
    addDebugLog('warning', '⚠️ Torrent en file d\'attente - Métadonnées non disponibles', {
      total_bytes: stats.total_bytes,
    });

    const nowTime = Date.now();
    const lastResumeAttempt = lastResumeAttemptRef.current;

    if (!lastResumeAttempt || nowTime - lastResumeAttempt >= QUEUED_RETRY_RESUME_MS) {
      lastResumeAttemptRef.current = nowTime;
      addDebugLog('info', '🔄 Tentative de reprise du torrent...');
              webtorrentClient.resumeTorrent(infoHash).catch((err: any) => {
        addDebugLog('warning', 'Impossible de reprendre le torrent', { error: err });
      });
    }

    if (videoFiles.length === 0 && !isPlaying) {
      loadVideoFiles(infoHash)
        .then((videos) => {
          if (isPlaying) return;
          if (videos.length > 0) {
            setVideoFiles(videos);
            setSelectedFile(videos[0]);
            setPlayStatus('downloading');
            setProgressMessage('Fichiers identifiés, téléchargement en cours...');
            webtorrentClient.resumeTorrent(infoHash).catch(() => {});
          }
        })
        .catch(() => {});
    }
  } else {
    setProgressMessage('En attente de téléchargement...');
    if (stats.total_bytes > 0) {
      if (videoFiles.length === 0) {
        loadVideoFiles(infoHash)
          .then((videos) => {
            if (videos.length > 0) {
              setVideoFiles(videos);
              setSelectedFile(videos[0]);
            }
          })
          .catch(() => {});
      }

      const shouldRetryResume = lastResumeAttemptRef.current === null || now - lastResumeAttemptRef.current >= QUEUED_RETRY_RESUME_MS;
      if (shouldRetryResume) {
        lastResumeAttemptRef.current = now;
        webtorrentClient.resumeTorrent(infoHash).then(() => {
          addDebugLog('info', '🔄 Tentative de reprise du torrent');
        }).catch(() => {});
      }
    }
  }
}

async function handleDownloadingState(
  infoHash: string,
  stats: ClientTorrentStats,
  progress: number,
  context: PollingContext
) {
  const { setPlayStatus, setProgressMessage, addDebugLog, loadVideoFiles, setVideoFiles, setSelectedFile, videoFiles, torrent } = context;

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

  if (videoFiles.length === 0) {
    loadVideoFiles(infoHash).then((videos) => {
      if (videos.length > 0) {
        setVideoFiles(videos);
        setSelectedFile(videos[0]);
        addDebugLog('info', '✅ Fichiers vidéo chargés en préparation', {
          selected_file: videos[0].path,
          file_size_mb: (videos[0].size / (1024 * 1024)).toFixed(2),
          progress: (progress * 100).toFixed(1) + '%',
        });
      }
    }).catch(() => {});
  }
}

async function handleCompletedState(
  infoHash: string,
  stats: ClientTorrentStats,
  progress: number,
  context: PollingContext
) {
  const { setPlayStatus, setProgressMessage, addDebugLog, loadVideoFiles, setVideoFiles, setSelectedFile, setIsPlaying, setShowInfo, stopProgressPolling } = context;

  setPlayStatus('ready');
  setProgressMessage('Téléchargement terminé !');
  
  try {
    const videos = await loadVideoFiles(infoHash);
    addDebugLog('success', '✅ Torrent terminé, fichiers vidéo chargés', {
      videoFiles_count: videos.length,
    });

    if (videos.length > 0) {
      const fileToUse = videos[0];
      setVideoFiles(videos);
      setSelectedFile(fileToUse);
      
      addDebugLog('success', '✅ Démarrage de la lecture', {
        selected_file: fileToUse.path,
      });
      
      stopProgressPolling();
      setTimeout(() => {
        setIsPlaying(true);
        setShowInfo(false);
      }, 300);
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
    await webtorrentClient.resumeTorrent(infoHash);
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
