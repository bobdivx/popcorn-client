import type { ClientTorrentStats } from '../../../../../lib/client/types';
import type { PlayStatus } from '../../types';

export function stopProgressPolling(
  progressPollIntervalRef: { current: number | null },
  notFoundStartTimeRef: { current: number | null },
  queuedStartTimeRef: { current: number | null },
  lastQueuedLogTimeRef: { current: number | null }
) {
  if (progressPollIntervalRef.current !== null) {
    clearInterval(progressPollIntervalRef.current);
    progressPollIntervalRef.current = null;
  }
  notFoundStartTimeRef.current = null;
  queuedStartTimeRef.current = null;
  lastQueuedLogTimeRef.current = null;
}

export async function handleClosePlayer(
  stopProgressPollingFn: () => void,
  setIsPlaying: (playing: boolean) => void,
  setShowInfo: (show: boolean) => void,
  setPlayStatus: (status: PlayStatus) => void,
  setProgressMessage: (message: string) => void,
  addDebugLog: (type: 'info' | 'success' | 'error' | 'warning', message: string, data?: any) => void,
  infoHash?: string | null,
  isExternal?: boolean,
  /** Média depuis la bibliothèque : ne pas tenter de supprimer le torrent (évite 502, fichiers déjà sur disque). */
  fromLibrary?: boolean
) {
  // Sortir du plein écran si on y est
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch (err) {
      // Ignorer les erreurs de sortie du plein écran
      console.debug('[handleClosePlayer] Impossible de sortir du plein écran:', err);
    }
  }
  
  stopProgressPollingFn();
  setIsPlaying(false);
  setShowInfo(true);
  setPlayStatus('idle');
  setProgressMessage('');
  addDebugLog('info', '🎬 Fermeture du lecteur vidéo');
  
  // Si c'est un torrent externe et pas depuis la bibliothèque, supprimer automatiquement pour libérer l'espace.
  // Depuis la bibliothèque : le torrent n'est pas forcément géré par le client ou ne doit pas être supprimé (502).
  if (isExternal && infoHash && !fromLibrary) {
    try {
      const { clientApi } = await import('../../../../../lib/client/api');
      addDebugLog('info', '🗑️ Suppression automatique du torrent de streaming externe', { infoHash });
      await clientApi.removeTorrent(infoHash, true); // deleteFiles = true pour nettoyer
      addDebugLog('success', '✅ Torrent de streaming supprimé (nettoyé)');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      addDebugLog('warning', '⚠️ Impossible de supprimer le torrent de streaming', { error: errorMsg });
      // Ne pas bloquer la fermeture du lecteur si la suppression échoue
    }
  }
}
