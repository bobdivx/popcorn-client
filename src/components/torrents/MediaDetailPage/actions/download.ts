import { clientApi } from '../../../../lib/client/api';
import { serverApi } from '../../../../lib/client/server-api';
import { saveDownloadMeta } from '../../../../lib/utils/download-meta-storage';
import type { ClientTorrentStats } from '../../../../lib/client/types';
import type { MediaDetailPageProps } from '../types';
import { startProgressPolling, type ProgressPollingOptions } from './progressPolling';

/** Stats initiales pour afficher la barre de progression dès le clic sur "Télécharger" */
function createInitialTorrentStats(infoHash: string, name: string): ClientTorrentStats {
  return {
    info_hash: infoHash,
    name,
    state: 'queued',
    downloaded_bytes: 0,
    uploaded_bytes: 0,
    total_bytes: 0,
    progress: 0,
    download_speed: 0,
    upload_speed: 0,
    peers_connected: 0,
    peers_total: 0,
    seeders: 0,
    leechers: 0,
    eta_seconds: null,
    download_started: true,
  };
}

function persistDownloadMeta(infoHash: string, torrent: MediaDetailPageProps['torrent']): void {
  saveDownloadMeta(infoHash, {
    posterUrl: torrent.imageUrl ?? null,
    backdropUrl: torrent.heroImageUrl ?? null,
    cleanTitle: torrent.cleanTitle ?? torrent.name ?? null,
  });
}

/** Lie le téléchargement au média TMDB (pour library/téléchargements) si tmdbId/tmdbType disponibles. */
function bindDownloadIfTmdb(infoHash: string, torrent: MediaDetailPageProps['torrent']): void {
  const tmdbId = torrent.tmdbId ?? (torrent as { tmdbId?: number }).tmdbId;
  const tmdbType = (torrent.tmdbType ?? (torrent as { tmdbType?: string }).tmdbType) as 'movie' | 'tv' | undefined;
  if (infoHash && typeof tmdbId === 'number' && (tmdbType === 'movie' || tmdbType === 'tv')) {
    clientApi.bindDownloadToMedia(infoHash, tmdbId, tmdbType).catch(() => {});
  }
}

/** Message d'erreur backend quand le torrent n'est plus disponible (404) — permet de réessayer une autre variante */
const TORRENT_NOT_AVAILABLE_MESSAGE = "n'est plus disponible sur l'indexer";

export interface DownloadOptions {
  torrent: MediaDetailPageProps['torrent'];
  isExternal: boolean;
  setDownloadingToClient: (value: boolean) => void;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  setPlayStatus?: (status: 'idle' | 'adding' | 'downloading' | 'ready' | 'error' | 'buffering') => void;
  pollTorrentProgress?: (infoHash: string) => void;
  progressPollIntervalRef?: { current: number | null };
  PROGRESS_POLL_INTERVAL_MS?: number;
  /** Pour afficher la barre de progression dès le démarrage du téléchargement */
  setTorrentStats?: (stats: ClientTorrentStats | null) => void;
  /** Variantes du même groupe : en cas d'erreur "torrent non disponible", on réessaie avec une autre variante */
  variants?: MediaDetailPageProps['torrent'][];
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
        setTorrentStats: options.setTorrentStats,
        variants: options.variants,
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
        setTorrentStats: options.setTorrentStats,
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
  setTorrentStats?: (stats: ClientTorrentStats | null) => void;
  variants?: MediaDetailPageProps['torrent'][];
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
    setTorrentStats,
    variants,
  } = options;

  try {
    await downloadFromExternalIndexerOnce({
      torrent,
      baseUrl,
      headers,
      addNotification,
      setPlayStatus,
      pollTorrentProgress,
      progressPollIntervalRef,
      PROGRESS_POLL_INTERVAL_MS,
      setTorrentStats: options.setTorrentStats,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isTorrentNotAvailable = errorMessage.includes(TORRENT_NOT_AVAILABLE_MESSAGE);
    const otherVariants = variants?.filter((v) => v.id !== torrent.id) ?? [];
    if (isTorrentNotAvailable && otherVariants.length > 0) {
      addNotification('info', 'Cette variante n\'est plus disponible. Essai avec une autre qualité…');
      for (const variant of otherVariants) {
        if (!variant._externalLink) continue;
        try {
          await downloadFromExternalIndexerOnce({
            torrent: variant,
            baseUrl,
            headers,
            addNotification,
            setPlayStatus,
            pollTorrentProgress,
            progressPollIntervalRef,
            PROGRESS_POLL_INTERVAL_MS,
            setTorrentStats: options.setTorrentStats,
          });
          return;
        } catch {
          // Continuer avec la variante suivante
        }
      }
      addNotification('error', 'Aucune variante n\'est disponible au téléchargement pour ce média.');
      throw new Error('Aucune variante disponible.');
    }
    throw err;
  }
}

/**
 * Une seule tentative de téléchargement depuis l'indexer externe (sans réessai de variantes).
 */
async function downloadFromExternalIndexerOnce(options: {
  torrent: MediaDetailPageProps['torrent'];
  baseUrl: string;
  headers: Record<string, string>;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  setPlayStatus?: (status: 'idle' | 'adding' | 'downloading' | 'ready' | 'error' | 'buffering') => void;
  pollTorrentProgress?: (infoHash: string) => void;
  progressPollIntervalRef?: { current: number | null };
  PROGRESS_POLL_INTERVAL_MS?: number;
  setTorrentStats?: (stats: ClientTorrentStats | null) => void;
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
    setTorrentStats,
  } = options;

  // Si on a une URL externe (ex. C411, YGG), utiliser directement l'endpoint external/download :
  // évite un 404 inutile sur /api/torrents/{infoHash}/download (torrent pas en DB locale).
  const hasExternalHttpLink =
    torrent._externalLink &&
    (torrent._externalLink.startsWith('http://') || torrent._externalLink.startsWith('https://'));
  if (hasExternalHttpLink) {
    return await downloadFromExternalIndexer({
      torrent,
      baseUrl,
      headers,
      addNotification,
      setPlayStatus,
      pollTorrentProgress,
      progressPollIntervalRef,
      PROGRESS_POLL_INTERVAL_MS,
      setTorrentStats,
    });
  }

  // Torrent externe sans URL HTTP : tenter la DB locale par infoHash (ex. torrents synchronisés)
  if (torrent.infoHash) {
    const downloadUrl = `${baseUrl}/api/torrents/${torrent.infoHash}/download`;
    if (setPlayStatus) {
      setPlayStatus('adding');
    }
    const response = await fetch(downloadUrl, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Le fichier .torrent n\'est pas disponible dans la DB locale et aucune URL externe n\'est disponible.');
      }
      throw new Error(`Impossible de télécharger le fichier torrent depuis la DB locale (${response.status})`);
    }

    const blob = await response.blob();
    const file = new File([blob], `${torrent.name}.torrent`, { type: 'application/x-bittorrent' });
    const forStreaming = false;
    const downloadType = torrent.tmdbType === 'movie' ? 'film' : (torrent.tmdbType === 'tv' ? 'serie' : 'film');

    const result = await clientApi.addTorrentFile(file, forStreaming, downloadType);
    addNotification('success', 'Torrent ajouté au client avec succès depuis la DB locale !');
    const infoHash = result?.info_hash ?? torrent.infoHash ?? '';
    if (infoHash) {
      persistDownloadMeta(infoHash, torrent);
      bindDownloadIfTmdb(infoHash, torrent);
    }
    window.dispatchEvent(new CustomEvent('torrentAdded', { detail: { infoHash, name: torrent.name } }));

    if (result?.info_hash) {
      setTorrentStats?.(createInitialTorrentStats(result.info_hash, torrent.name));
      startProgressPolling(result.info_hash, {
        torrent,
        pollTorrentProgress,
        progressPollIntervalRef,
        PROGRESS_POLL_INTERVAL_MS,
        setPlayStatus,
      });
    } else if (torrent.infoHash) {
      setTorrentStats?.(createInitialTorrentStats(torrent.infoHash, torrent.name));
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
    const infoHashMagnet = result?.info_hash ?? torrent.infoHash ?? '';
    if (infoHashMagnet) {
      persistDownloadMeta(infoHashMagnet, torrent);
      bindDownloadIfTmdb(infoHashMagnet, torrent);
    }
    window.dispatchEvent(new CustomEvent('torrentAdded', { detail: { infoHash: infoHashMagnet, name: torrent.name } }));

    if (result?.info_hash) {
      options.setTorrentStats?.(createInitialTorrentStats(result.info_hash, torrent.name));
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

  // Si pas d'infoHash ni magnet mais URL externe (page indexer, ex. YGG API) : télécharger via le backend
  if (torrent._externalLink && (torrent._externalLink.startsWith('http://') || torrent._externalLink.startsWith('https://'))) {
    return await downloadFromExternalIndexer({
      torrent,
      baseUrl,
      headers,
      addNotification,
      setPlayStatus,
      pollTorrentProgress,
      progressPollIntervalRef,
      PROGRESS_POLL_INTERVAL_MS,
      setTorrentStats: options.setTorrentStats,
    });
  }

  // Si aucun infoHash, magnet ni URL externe, erreur
  throw new Error('Aucune méthode de téléchargement disponible : infoHash et magnet link manquants');
}

/**
 * Télécharge un fichier .torrent depuis un indexer externe via l'API backend
 */
async function downloadFromExternalIndexer(options: {
  torrent: MediaDetailPageProps['torrent'];
  baseUrl: string;
  headers: Record<string, string>;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  setPlayStatus?: (status: 'idle' | 'adding' | 'downloading' | 'ready' | 'error' | 'buffering') => void;
  pollTorrentProgress?: (infoHash: string) => void;
  progressPollIntervalRef?: { current: number | null };
  PROGRESS_POLL_INTERVAL_MS?: number;
  setTorrentStats?: (stats: ClientTorrentStats | null) => void;
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
    setTorrentStats,
  } = options;

  if (!torrent._externalLink) {
    throw new Error('Aucune URL externe disponible pour télécharger le fichier .torrent');
  }

  // Construire l'URL de l'endpoint externe avec les paramètres nécessaires
  const externalUrl = new URL(`${baseUrl}/api/torrents/external/download`);
  externalUrl.searchParams.set('url', torrent._externalLink);
  externalUrl.searchParams.set('torrentName', torrent.name);
  
  // Ajouter les informations de l'indexer si disponibles (gérer les deux formats: camelCase et snake_case)
  const indexerId = (torrent as any).indexerId || (torrent as any).indexer_id;
  const indexerName = (torrent as any).indexerName || (torrent as any).indexer_name;
  
  if (indexerId) {
    externalUrl.searchParams.set('indexerId', String(indexerId));
  }
  if (indexerName) {
    externalUrl.searchParams.set('indexerName', indexerName);
  }
  if (torrent._guid) {
    externalUrl.searchParams.set('guid', torrent._guid);
  }
  // ID du torrent pour les indexeurs REST (template downloadUrlTemplate) : ex. external_ygg-api_1420257 → 1420257
  const torrentIdFromVariant = torrent.id?.includes('_')
    ? torrent.id.split('_').pop()
    : torrent.id;
  if (torrentIdFromVariant) {
    externalUrl.searchParams.set('torrentId', torrentIdFromVariant);
  }
  // indexerTypeId pour fallback quand indexer_id obsolète (ex. indexer recréé) : external_ygg-api_1420257 → ygg-api
  const indexerTypeIdFromVariant =
    torrent.id?.match(/^external_(.+?)_\d+$/)?.[1];
  if (indexerTypeIdFromVariant) {
    externalUrl.searchParams.set('indexerTypeId', indexerTypeIdFromVariant);
  }

  if (setPlayStatus) {
    setPlayStatus('adding');
  }

  // Télécharger le fichier .torrent depuis l'indexer externe
  // L'endpoint ajoute directement le torrent au client et retourne une réponse JSON avec info_hash
  const response = await fetch(externalUrl.toString(), { headers });
  
  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Impossible de télécharger le fichier .torrent depuis l'indexer externe (${response.status})`;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error) {
        errorMessage = errorJson.error;
      }
    } catch {
      // Ignorer l'erreur de parsing
    }
    throw new Error(errorMessage);
  }

  // Le backend peut suggérer une sync si les données en cache sont obsolètes (indexer recréé)
  const suggestSync = response.headers.get('X-Popcorn-Suggest-Sync') === 'true';
  if (suggestSync) {
    addNotification(
      'info',
      "Données en cache obsolètes. Une synchronisation des torrents est recommandée (Paramètres > Synchronisation) pour actualiser les références aux indexeurs.",
    );
  }

  // Vérifier le content-type pour déterminer si c'est JSON ou un fichier .torrent
  const contentType = response.headers.get('content-type') || '';
  
  if (contentType.includes('application/json')) {
    // L'endpoint a ajouté le torrent au client et retourne une réponse JSON
    const jsonResponse = await response.json();
    
    if (jsonResponse.success && jsonResponse.data?.info_hash) {
      const infoHash = jsonResponse.data.info_hash;
      persistDownloadMeta(infoHash, torrent);
      addNotification('success', 'Torrent téléchargé depuis l\'indexer externe et ajouté au client avec succès !');
      window.dispatchEvent(new CustomEvent('torrentAdded', { detail: { infoHash, name: torrent.name } }));
      setTorrentStats?.(createInitialTorrentStats(infoHash, torrent.name));
      startProgressPolling(infoHash, {
        torrent,
        pollTorrentProgress,
        progressPollIntervalRef,
        PROGRESS_POLL_INTERVAL_MS,
        setPlayStatus,
      });
      return;
    } else if (jsonResponse.isMagnet && jsonResponse.magnetUri) {
      // Cas spécial : l'endpoint retourne un magnet link
      const forStreaming = false;
      const downloadType = torrent.tmdbType === 'movie' ? 'film' : (torrent.tmdbType === 'tv' ? 'serie' : 'film');
      const result = await clientApi.addMagnetLink(jsonResponse.magnetUri, torrent.name, forStreaming, downloadType);
      addNotification('success', 'Torrent ajouté au client via magnet link !');
      const infoHashMagnet2 = result?.info_hash ?? torrent.infoHash ?? '';
      if (infoHashMagnet2) {
        persistDownloadMeta(infoHashMagnet2, torrent);
        bindDownloadIfTmdb(infoHashMagnet2, torrent);
      }
      window.dispatchEvent(new CustomEvent('torrentAdded', { detail: { infoHash: infoHashMagnet2, name: torrent.name } }));

      if (result?.info_hash) {
        setTorrentStats?.(createInitialTorrentStats(result.info_hash, torrent.name));
        startProgressPolling(result.info_hash, {
          torrent,
          pollTorrentProgress,
          progressPollIntervalRef,
          PROGRESS_POLL_INTERVAL_MS,
          setPlayStatus,
        });
      } else if (jsonResponse.info_hash) {
        setTorrentStats?.(createInitialTorrentStats(jsonResponse.info_hash, torrent.name));
        startProgressPolling(jsonResponse.info_hash, {
          torrent,
          pollTorrentProgress,
          progressPollIntervalRef,
          PROGRESS_POLL_INTERVAL_MS,
          setPlayStatus,
        });
      }
      return;
    } else {
      throw new Error(jsonResponse.error || 'Réponse inattendue du serveur');
    }
  } else {
    // L'endpoint retourne le fichier .torrent en binaire (cas de fallback)
    const blob = await response.blob();
    const file = new File([blob], `${torrent.name}.torrent`, { type: 'application/x-bittorrent' });
    const forStreaming = false;
    const downloadType = torrent.tmdbType === 'movie' ? 'film' : (torrent.tmdbType === 'tv' ? 'serie' : 'film');
    
    const result = await clientApi.addTorrentFile(file, forStreaming, downloadType);
    addNotification('success', 'Torrent téléchargé depuis l\'indexer externe et ajouté au client avec succès !');
    const infoHashFile = result?.info_hash ?? torrent.infoHash ?? '';
    if (infoHashFile) {
      persistDownloadMeta(infoHashFile, torrent);
      bindDownloadIfTmdb(infoHashFile, torrent);
    }
    window.dispatchEvent(new CustomEvent('torrentAdded', { detail: { infoHash: infoHashFile, name: torrent.name } }));

    if (result?.info_hash) {
      setTorrentStats?.(createInitialTorrentStats(result.info_hash, torrent.name));
      startProgressPolling(result.info_hash, {
        torrent,
        pollTorrentProgress,
        progressPollIntervalRef,
        PROGRESS_POLL_INTERVAL_MS,
        setPlayStatus,
      });
    } else if (torrent.infoHash) {
      setTorrentStats?.(createInitialTorrentStats(torrent.infoHash, torrent.name));
      startProgressPolling(torrent.infoHash, {
        torrent,
        pollTorrentProgress,
        progressPollIntervalRef,
        PROGRESS_POLL_INTERVAL_MS,
        setPlayStatus,
      });
    }
  }
}

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
  const infoHashMagnet3 = result?.info_hash ?? torrent.infoHash ?? '';
  if (infoHashMagnet3) {
    persistDownloadMeta(infoHashMagnet3, torrent);
    bindDownloadIfTmdb(infoHashMagnet3, torrent);
  }
  window.dispatchEvent(new CustomEvent('torrentAdded', { detail: { infoHash: infoHashMagnet3, name: torrent.name } }));

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
  setTorrentStats?: (stats: ClientTorrentStats | null) => void;
}): Promise<void> {
  const {
    torrent,
    baseUrl,
    headers,
    addNotification,
    pollTorrentProgress,
    progressPollIntervalRef,
    PROGRESS_POLL_INTERVAL_MS = 2000,
    setTorrentStats,
  } = options;

  // Le serveur attend un info_hash (DB torrents), pas l'id externe (ex: external_c411_xxx)
  const downloadId = torrent.infoHash ?? (torrent.id?.startsWith('external_') ? torrent.id.replace(/^external_[^_]+_/, '') : null) ?? torrent.id;
  const response = await fetch(`${baseUrl}/api/torrents/${encodeURIComponent(downloadId)}/download`, { headers });
  if (!response.ok) {
    throw new Error(`Impossible de télécharger le fichier torrent (${response.status})`);
  }
  
  const blob = await response.blob();
  const file = new File([blob], `${torrent.name}.torrent`, { type: 'application/x-bittorrent' });
  const forStreaming = false;
  const downloadType = torrent.tmdbType === 'movie' ? 'film' : (torrent.tmdbType === 'tv' ? 'serie' : 'film');
  const result = await clientApi.addTorrentFile(file, forStreaming, downloadType);
  addNotification('success', 'Torrent ajouté au client avec succès !');
  const infoHashLocal = result?.info_hash ?? torrent.infoHash ?? '';
  if (infoHashLocal) {
    persistDownloadMeta(infoHashLocal, torrent);
    bindDownloadIfTmdb(infoHashLocal, torrent);
  }
  window.dispatchEvent(new CustomEvent('torrentAdded', { detail: { infoHash: infoHashLocal, name: torrent.name } }));

  if (result?.info_hash) {
    setTorrentStats?.(createInitialTorrentStats(result.info_hash, torrent.name));
    startProgressPolling(result.info_hash, {
      torrent,
      pollTorrentProgress,
      progressPollIntervalRef,
      PROGRESS_POLL_INTERVAL_MS,
    });
  } else if (torrent.infoHash) {
    setTorrentStats?.(createInitialTorrentStats(torrent.infoHash, torrent.name));
    startProgressPolling(torrent.infoHash, {
      torrent,
      pollTorrentProgress,
      progressPollIntervalRef,
      PROGRESS_POLL_INTERVAL_MS,
    });
  }
}