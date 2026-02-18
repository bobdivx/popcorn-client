import { useState, useRef, useEffect } from 'preact/hooks';
import type { ClientTorrentStats } from '../../../../../lib/client/types';
import { clearStreamingInfoHash } from '../../../../../lib/streamingInfoHashStorage';
import type { PlayStatus } from '../../types';
import type { UseTorrentPlayerOptions, PollingContext, PlayHandlerContext } from './types';
import { stopProgressPolling as stopProgressPollingUtil, handleClosePlayer as handleClosePlayerUtil } from './utils';
import { createPollTorrentProgress } from './polling';
import { createHandlePlay } from './playHandler';
import { clientApi } from '../../../../../lib/client/api';

export function useTorrentPlayer(options: UseTorrentPlayerOptions) {
  const {
    torrent,
    initialTorrentStats = null,
    isExternal,
    hasInfoHash,
    hasMagnetLink,
    canStream,
    streamingTorrentActive = false,
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
  } = options;

  const [playStatus, setPlayStatus] = useState<PlayStatus>('idle');
  const [torrentStats, setTorrentStats] = useState<ClientTorrentStats | null>(initialTorrentStats ?? null);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  /** Compte à rebours (secondes) avant lancement auto à la fin du téléchargement (3, 2, 1, 0). */
  const [countdownRemaining, setCountdownRemaining] = useState<number | null>(null);

  // Refs pour le polling
  const progressPollIntervalRef = useRef<number | null>(null);
  const notFoundStartTimeRef = useRef<number | null>(null);
  const queuedStartTimeRef = useRef<number | null>(null);
  const lastQueuedLogTimeRef = useRef<number | null>(null);
  const lastResumeAttemptRef = useRef<number | null>(null);
  const lastTorrentStatsRef = useRef<{ state?: string; progress?: number } | null>(null);
  useEffect(() => {
    lastTorrentStatsRef.current = torrentStats
      ? { state: torrentStats.state, progress: torrentStats.progress }
      : null;
  }, [torrentStats]);
  const getCurrentTorrentStats = () => lastTorrentStatsRef.current;

  // Fonction pour arrêter le polling
  const stopProgressPolling = () => {
    stopProgressPollingUtil(progressPollIntervalRef, notFoundStartTimeRef, queuedStartTimeRef, lastQueuedLogTimeRef);
  };

  // Nettoyer le polling au démontage
  useEffect(() => {
    return () => {
      stopProgressPolling();
    };
  }, []);

  // Pendant que le lecteur est ouvert : rafraîchir les stats avec la MÊME source que la page Téléchargements (listTorrents)
  // pour que l’overlay affiche exactement la même progression (%, downloaded/total) que /downloads
  const statsRefreshIntervalRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isPlaying) {
      if (statsRefreshIntervalRef.current != null) {
        window.clearInterval(statsRefreshIntervalRef.current);
        statsRefreshIntervalRef.current = null;
      }
      return;
    }
    const infoHash = (torrent.infoHash || '').trim().toLowerCase();
    if (!infoHash) return;

    const refreshStats = () => {
      clientApi
        .listTorrents()
        .then((list) => {
          const found = list.find((t) => (t.info_hash || '').toLowerCase() === infoHash);
          if (found) {
            setTorrentStats(found);
            return;
          }
          // Si absent de la liste (ex. tout juste ajouté), fallback sur getTorrent comme avant
          clientApi.getTorrent(infoHash).then((stats) => {
            if (stats) setTorrentStats(stats);
          }).catch(() => {});
        })
        .catch(() => {});
    };
    refreshStats();
    const interval = window.setInterval(refreshStats, 3000);
    statsRefreshIntervalRef.current = interval;
    return () => {
      if (statsRefreshIntervalRef.current != null) {
        window.clearInterval(statsRefreshIntervalRef.current);
        statsRefreshIntervalRef.current = null;
      }
    };
  }, [isPlaying, torrent.infoHash]);

  // Créer le contexte pour le polling
  const pollingContext: PollingContext = {
    setPlayStatus,
    setTorrentStats,
    setProgressMessage,
    setErrorMessage,
    stopProgressPolling,
    setIsPlaying,
    setShowInfo,
    setVideoFiles,
    setSelectedFile,
    setIsAvailableLocally,
    addDebugLog,
    playStatus,
    isPlaying,
    videoFiles,
    selectedFile,
    torrent,
    loadVideoFiles,
    progressPollIntervalRef,
    notFoundStartTimeRef,
    queuedStartTimeRef,
    lastQueuedLogTimeRef,
    lastResumeAttemptRef,
    setCountdownRemaining,
    getCurrentTorrentStats,
  };

  // Créer la fonction de polling
  const pollTorrentProgress = createPollTorrentProgress(pollingContext);

  // Créer le contexte pour le play handler
  const playHandlerContext: PlayHandlerContext = {
    torrent,
    isExternal,
    hasInfoHash,
    hasMagnetLink,
    streamingTorrentActive,
    isAvailableLocally,
    loadVideoFiles,
    videoFiles,
    selectedFile,
    setVideoFiles,
    setSelectedFile,
    isPlaying,
    setIsPlaying,
    setShowInfo,
    setPlayStatus,
    setProgressMessage,
    setErrorMessage,
    setTorrentStats,
    stopProgressPolling,
    addDebugLog,
    progressPollIntervalRef,
    pollTorrentProgress,
  };

  // Créer la fonction handlePlay
  const handlePlay = createHandlePlay(playHandlerContext);
  const handlePlayRef = useRef(handlePlay);
  handlePlayRef.current = handlePlay;

  // Compte à rebours 3s à la fin du téléchargement puis lancement automatique
  useEffect(() => {
    if (countdownRemaining === null) return;
    if (countdownRemaining === 0) {
      // Ne pas lancer si le backend a relancé le torrent (ex: fichier corrompu -> reset à 0%)
      setCountdownRemaining(null);
      (async () => {
        const infoHash = (torrentStats?.info_hash || torrent.infoHash || '').trim();
        if (!infoHash) {
          return;
        }

        const fresh = await clientApi.getTorrent(infoHash);
        const freshState = fresh?.state;
        const freshProgress = fresh?.progress ?? 0;
        const isReady =
          !!fresh &&
          (freshState === 'completed' || freshState === 'seeding' || freshProgress >= 0.99);

        if (isReady) {
          handlePlayRef.current();
          return;
        }

        addDebugLog('warning', '⛔ Lancement annulé: le torrent a redémarré / n’est pas prêt', {
          state: freshState,
          progress: `${(freshProgress * 100).toFixed(2)}%`,
        });

        // Mettre à jour l'UI immédiatement avec les stats fraîches si disponibles
        if (fresh) {
          setTorrentStats(fresh);
          setPlayStatus('downloading');
          setProgressMessage('Téléchargement relancé…');
        }

        // Relancer le polling si on l'avait arrêté au moment du "completed"
        if (typeof window !== 'undefined' && !progressPollIntervalRef.current) {
          progressPollIntervalRef.current = window.setInterval(() => {
            pollTorrentProgress(infoHash);
          }, 2000);
          pollTorrentProgress(infoHash);
        }
      })();
      return;
    }
    const t = setTimeout(() => setCountdownRemaining((c) => (c !== null && c > 0 ? c - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [countdownRemaining, torrentStats?.info_hash, torrent.infoHash]);

  // Fonction pour fermer le lecteur
  const handleClosePlayer = async () => {
    const currentInfoHash = torrentStats?.info_hash || torrent.infoHash;
    if (streamingTorrentActive && currentInfoHash) {
      clientApi.notifyStreamingEnded(currentInfoHash).catch(() => {});
      clearStreamingInfoHash(currentInfoHash);
    }
    await handleClosePlayerUtil(
      stopProgressPolling,
      setIsPlaying,
      setShowInfo,
      setPlayStatus,
      setProgressMessage,
      addDebugLog,
      currentInfoHash,
      isExternal,
      isAvailableLocally,
      streamingTorrentActive
    );
  };

  return {
    playStatus,
    setPlayStatus,
    torrentStats,
    setTorrentStats,
    progressMessage,
    setProgressMessage,
    errorMessage,
    setErrorMessage,
    stopProgressPolling,
    handleClosePlayer,
    handlePlay,
    pollTorrentProgress,
    progressPollIntervalRef,
    countdownRemaining,
  };
}
