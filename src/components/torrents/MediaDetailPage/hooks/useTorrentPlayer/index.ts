import { useState, useRef, useEffect } from 'preact/hooks';
import type { ClientTorrentStats } from '../../../../../lib/client/types';
import type { PlayStatus } from '../../types';
import type { UseTorrentPlayerOptions, PollingContext, PlayHandlerContext } from './types';
import { stopProgressPolling as stopProgressPollingUtil, handleClosePlayer as handleClosePlayerUtil } from './utils';
import { createPollTorrentProgress } from './polling';
import { createHandlePlay } from './playHandler';

export function useTorrentPlayer(options: UseTorrentPlayerOptions) {
  const {
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
  } = options;

  const [playStatus, setPlayStatus] = useState<PlayStatus>('idle');
  const [torrentStats, setTorrentStats] = useState<ClientTorrentStats | null>(null);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs pour le polling
  const progressPollIntervalRef = useRef<number | null>(null);
  const queuedStartTimeRef = useRef<number | null>(null);
  const lastQueuedLogTimeRef = useRef<number | null>(null);
  const lastResumeAttemptRef = useRef<number | null>(null);

  // Fonction pour arrêter le polling
  const stopProgressPolling = () => {
    stopProgressPollingUtil(progressPollIntervalRef, queuedStartTimeRef, lastQueuedLogTimeRef);
  };

  // Nettoyer le polling au démontage
  useEffect(() => {
    return () => {
      stopProgressPolling();
    };
  }, []);

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
    queuedStartTimeRef,
    lastQueuedLogTimeRef,
    lastResumeAttemptRef,
  };

  // Créer la fonction de polling
  const pollTorrentProgress = createPollTorrentProgress(pollingContext);

  // Créer le contexte pour le play handler
  const playHandlerContext: PlayHandlerContext = {
    torrent,
    isExternal,
    hasInfoHash,
    hasMagnetLink,
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

  // Fonction pour fermer le lecteur
  const handleClosePlayer = async () => {
    const currentInfoHash = torrentStats?.info_hash || torrent.infoHash;
    await handleClosePlayerUtil(
      stopProgressPolling,
      setIsPlaying,
      setShowInfo,
      setPlayStatus,
      setProgressMessage,
      addDebugLog,
      currentInfoHash,
      isExternal
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
  };
}
