import { clientApi } from '../../../../lib/client/api';
import { serverApi } from '../../../../lib/client/server-api';
import type { MediaDetailPageProps } from '../types';
import { startProgressPolling, type ProgressPollingOptions } from './progressPolling';

export interface DownloadOptions {
  torrent: MediaDetailPageProps['torrent'];
  isExternal: boolean;
  setDownloadingToClient: (value: boolean) => void;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  setPlayStatus?: (status: 'idle' | 'adding' | 'downloading' | 'ready' | 'error' | 'buffering') => void;
  pollTorrentProgress?: (infoHash: string) => void;
  progressPollIntervalRef?: { current: number | null };
  PROGRESS_POLL_INTERVAL_MS?: number;
}

/**
 * Gère le téléchargement d'un torrent (externe ou local)
 */
export async function handleDownload(options: DownloadOptions): Promise<void> {
  const {
    torrent,
    isExternal,
    setDownloadingToClient,
    addNotification,
    setPlayStatus,
    pollTorrentProgress,
    progressPollIntervalRef,
    PROGRESS_POLL_INTERVAL_MS = 2000,
  } = options;

  setDownloadingToClient(true);

  try {
    const baseUrl = serverApi.getServerUrl();
    const token = serverApi.getAccessToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    if (isExternal) {
      await handleExternalDownload({
        torrent,
        baseUrl,
        headers,
        addNotification,
        setPlayStatus,
        pollTorrentProgress,
        progressPollIntervalRef,
        PROGRESS_POLL_INTERVAL_MS,
      });
    } else if (torrent.infoHash) {
      await handleLocalDownload({
        torrent,
        baseUrl,
        headers,
        addNotification,
        pollTorrentProgress,
        progressPollIntervalRef,
        PROGRESS_POLL_INTERVAL_MS,
      });
    } else {
      throw new Error('Aucune méthode de téléchargement disponible pour ce torrent');
    }
  } catch (error) {
    console.error('Erreur lors de l\'ajout du torrent:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
    addNotification('error', `Erreur lors de l'ajout: ${errorMessage}`);
  } finally {
    setDownloadingToClient(false);
  }
}

/**
 * Gère le téléchargement d'un torrent externe
 */
async function handleExternalDownload(options: {
  torrent: MediaDetailPageProps['torrent'];
  baseUrl: string;
  headers: Record<string, string>;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  setPlayStatus?: (status: 'idle' | 'adding' | 'downloading' | 'ready' | 'error' | 'buffering') => void;
  pollTorrentProgress?: (infoHash: string) => void;
  progressPollIntervalRef?: { current: number | null };
  PROGRESS_POLL_INTERVAL_MS?: number;
}): Promise<void> {
  const {
    torrent,
    baseUrl,
    headers,
    addNotification,
    setPlayStatus,
    pollTorrentProgress,
    progressPollIntervalRef,
    PROGRESS_POLL_INTERVAL_MS = 2000,
  } = options;

  // Pour les torrents externes, utiliser l'infoHash depuis la DB locale (pas d'API Torznab)
  // Télécharger le fichier .torrent directement depuis la DB locale
  if (torrent.infoHash) {
    // Télécharger le fichier .torrent depuis la DB locale avec l'infoHash
    const downloadUrl = `${baseUrl}/api/torrents/${torrent.infoHash}/download`;
    
    if (setPlayStatus) {
      setPlayStatus('adding');
    }
    
    const response = await fetch(downloadUrl, { headers });
    
    if (!response.ok) {
      if (response.status === 404) {
        // Le fichier .torrent n'est pas dans la DB locale
        // Tout devrait être dans la DB locale, donc c'est une erreur
        throw new Error('Le fichier .torrent n\'est pas disponible dans la DB locale. Le torrent externe n\'a peut-être pas encore été synchronisé.');
      }
      throw new Error(`Impossible de télécharger le fichier torrent depuis la DB locale (${response.status})`);
    }
    
    // Le fichier .torrent est disponible dans la DB locale, l'ajouter au client
    const blob = await response.blob();
    
    // #region agent log
    const blobSize = blob.size;
    const blobType = blob.type;
    const blobStart = await blob.slice(0, Math.min(100, blob.size)).text().catch(() => '');
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'download.ts:118',
        message: 'Blob téléchargé depuis DB',
        data: {
          infoHash: torrent.infoHash,
          blobSize,
          blobType,
          blobStart: blobStart.substring(0, 50),
          contentType: response.headers.get('content-type'),
        },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'G',
      }),
    }).catch(() => {});
    // #endregion
    
    const file = new File([blob], `${torrent.name}.torrent`, { type: 'application/x-bittorrent' });
    const forStreaming = false;
    const downloadType = torrent.tmdbType === 'movie' ? 'film' : (torrent.tmdbType === 'tv' ? 'serie' : 'film');
    
    // #region agent log
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: 'download.ts:122',
        message: 'Avant addTorrentFile',
        data: {
          infoHash: torrent.infoHash,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        },
        timestamp: Date.now(),
        sessionId: 'debug-session',
        runId: 'run1',
        hypothesisId: 'G',
      }),
    }).catch(() => {});
    // #endregion
    
    const result = await clientApi.addTorrentFile(file, forStreaming, downloadType);
    addNotification('success', 'Torrent ajouté au client avec succès depuis la DB locale !');
    window.dispatchEvent(new CustomEvent('torrentAdded'));
    
    if (result?.info_hash) {
      startProgressPolling(result.info_hash, {
        torrent,
        pollTorrentProgress,
        progressPollIntervalRef,
        PROGRESS_POLL_INTERVAL_MS,
        setPlayStatus,
      });
    } else if (torrent.infoHash) {
      startProgressPolling(torrent.infoHash, {
        torrent,
        pollTorrentProgress,
        progressPollIntervalRef,
        PROGRESS_POLL_INTERVAL_MS,
        setPlayStatus,
      });
    }
    return;
  }

  // Si pas d'infoHash, essayer avec le magnet link externe s'il existe
  const magnetUri = torrent._externalMagnetUri || 
    (torrent._externalLink && torrent._externalLink.startsWith('magnet:') 
      ? torrent._externalLink 
      : null);

  if (magnetUri) {
    const forStreaming = false;
    const downloadType = torrent.tmdbType === 'movie' ? 'film' : (torrent.tmdbType === 'tv' ? 'serie' : 'film');
    const result = await clientApi.addMagnetLink(magnetUri, torrent.name, forStreaming, downloadType);
    addNotification('success', 'Torrent ajouté au client avec succès !');
    window.dispatchEvent(new CustomEvent('torrentAdded'));
    
    if (result?.info_hash) {
      startProgressPolling(result.info_hash, {
        torrent,
        pollTorrentProgress,
        progressPollIntervalRef,
        PROGRESS_POLL_INTERVAL_MS,
        setPlayStatus,
      });
    }
    return;
  }

  // Si aucun infoHash ni magnet, erreur
  throw new Error('Aucune méthode de téléchargement disponible : infoHash et magnet link manquants');
}

// Fonction supprimée : downloadExternalTorrentFile
// Plus besoin d'utiliser l'API Torznab, tout est dans la DB locale

// Fonction supprimée : handleDownloadError
// Plus besoin de gérer les erreurs Torznab, tout est dans la DB locale

/**
 * Gère une réponse magnet (ajoute le torrent via magnet link)
 */
async function handleMagnetResponse(options: {
  magnetUri: string;
  torrent: MediaDetailPageProps['torrent'];
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  pollTorrentProgress?: (infoHash: string) => void;
  progressPollIntervalRef?: { current: number | null };
  PROGRESS_POLL_INTERVAL_MS?: number;
  setPlayStatus?: (status: 'idle' | 'adding' | 'downloading' | 'ready' | 'error' | 'buffering') => void;
}): Promise<void> {
  const {
    magnetUri,
    torrent,
    addNotification,
    pollTorrentProgress,
    progressPollIntervalRef,
    PROGRESS_POLL_INTERVAL_MS = 2000,
    setPlayStatus,
  } = options;

  const forStreaming = false;
  const downloadType = torrent.tmdbType === 'movie' ? 'film' : (torrent.tmdbType === 'tv' ? 'serie' : 'film');
  const result = await clientApi.addMagnetLink(magnetUri, torrent.name, forStreaming, downloadType);
  addNotification('success', 'Torrent ajouté au client avec succès !');
  window.dispatchEvent(new CustomEvent('torrentAdded'));
  
  if (result?.info_hash) {
    startProgressPolling(result.info_hash, {
      torrent,
      pollTorrentProgress,
      progressPollIntervalRef,
      PROGRESS_POLL_INTERVAL_MS,
      setPlayStatus,
    });
  } else if (torrent.infoHash) {
    startProgressPolling(torrent.infoHash, {
      torrent,
      pollTorrentProgress,
      progressPollIntervalRef,
      PROGRESS_POLL_INTERVAL_MS,
      setPlayStatus,
    });
  }
}

/**
 * Gère le téléchargement d'un torrent local
 */
async function handleLocalDownload(options: {
  torrent: MediaDetailPageProps['torrent'];
  baseUrl: string;
  headers: Record<string, string>;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  pollTorrentProgress?: (infoHash: string) => void;
  progressPollIntervalRef?: { current: number | null };
  PROGRESS_POLL_INTERVAL_MS?: number;
}): Promise<void> {
  const {
    torrent,
    baseUrl,
    headers,
    addNotification,
    pollTorrentProgress,
    progressPollIntervalRef,
    PROGRESS_POLL_INTERVAL_MS = 2000,
  } = options;

  const response = await fetch(`${baseUrl}/api/torrents/${torrent.id}/download`, { headers });
  if (!response.ok) {
    throw new Error(`Impossible de télécharger le fichier torrent (${response.status})`);
  }
  
  const blob = await response.blob();
  const file = new File([blob], `${torrent.name}.torrent`, { type: 'application/x-bittorrent' });
  const forStreaming = false;
  const downloadType = torrent.tmdbType === 'movie' ? 'film' : (torrent.tmdbType === 'tv' ? 'serie' : 'film');
  const result = await clientApi.addTorrentFile(file, forStreaming, downloadType);
  addNotification('success', 'Torrent ajouté au client avec succès !');
  window.dispatchEvent(new CustomEvent('torrentAdded'));
  
  if (result?.info_hash) {
    startProgressPolling(result.info_hash, {
      torrent,
      pollTorrentProgress,
      progressPollIntervalRef,
      PROGRESS_POLL_INTERVAL_MS,
    });
  } else if (torrent.infoHash) {
    startProgressPolling(torrent.infoHash, {
      torrent,
      pollTorrentProgress,
      progressPollIntervalRef,
      PROGRESS_POLL_INTERVAL_MS,
    });
  }
}