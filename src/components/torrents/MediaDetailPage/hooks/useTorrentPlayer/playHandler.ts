import { clientApi } from '../../../../../lib/client/api';
import { serverApi } from '../../../../../lib/client/server-api';
import { TokenManager } from '../../../../../lib/client/storage';
import { setStreamingInfoHash } from '../../../../../lib/streamingInfoHashStorage';
import { getCachedSubscription, loadSubscription } from '../../../../../lib/subscription-store';
import { PROGRESS_POLL_INTERVAL_MS } from '../../utils/constants';
import type { PlayHandlerContext } from './types';

/** En mode stream-torrent, attend que le flux soit prêt (déclencheur côté backend) avant d'ouvrir le lecteur. */
async function waitForStreamReady(
  streamingTorrentActive: boolean,
  infoHash: string,
  file: { index?: number; name: string },
  setProgressMessage: (m: string) => void,
  setPlayStatus: (s: string) => void,
  setErrorMessage: (e: string | null) => void,
  addDebugLog: (level: string, msg: string, data?: any) => void
): Promise<boolean> {
  if (!streamingTorrentActive) return true;
  // Médias de la bibliothèque (local_xxx) : pas d'API stream-torrent, lecture via HLS/local.
  if (infoHash.startsWith('local_')) {
    addDebugLog('info', 'Média bibliothèque (local_), pas d’appel stream-torrent/ready');
    return true;
  }
  const token = TokenManager.getCloudAccessToken();
  if (!token) {
    addDebugLog('warning', 'Stream torrent actif mais pas de token cloud');
    return true;
  }
  setProgressMessage('Préparation du flux…');
  try {
    await clientApi.streamTorrentReady(infoHash, file.index ?? 0, file.name, token);
    addDebugLog('success', 'Flux stream-torrent prêt');
    return true;
  } catch (e) {
    addDebugLog('error', 'Flux stream-torrent indisponible', e);
    setPlayStatus('error');
    setErrorMessage(
      'Le flux n\'est pas encore prêt (torrent en initialisation). Attendez 1 à 2 minutes puis réessayez.'
    );
    return false;
  }
}

/** Résout l'éligibilité streaming au moment du clic (lit le store, ou charge si pas encore fait). */
async function resolveStreamingActiveOnce(
  initial: boolean,
  cache: { value: boolean | null }
): Promise<boolean> {
  if (cache.value !== null) return cache.value;
  const cached = getCachedSubscription();
  if (cached !== null) {
    cache.value = cached.streamingTorrent === true;
    return cache.value;
  }
  try {
    const data = await loadSubscription();
    cache.value = data?.streamingTorrent === true;
  } catch {
    cache.value = initial;
  }
  return cache.value;
}

const PLAYER_CONFIG_KEY = 'playerConfig';

/** True si l'utilisateur a choisi de télécharger le média en entier en mode streaming (réglage Lecture). */
function getStreamingDownloadFull(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem(PLAYER_CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { streamingDownloadFull?: boolean };
      return parsed.streamingDownloadFull === true;
    }
  } catch {
    // ignore
  }
  return false;
}

/** Appelle updateOnlyFiles dès que le torrent peut l'accepter, avec réessais en cas de 502/503 (torrent en "initializing"). */
export function scheduleUpdateOnlyFilesWithRetry(infoHash: string, fileIndex: number) {
  // 503 = "Le torrent n'est pas encore prêt" (backend). Premier délai plus long pour laisser librqbit sortir de "initializing".
  const delays = [5000, 4000, 8000, 12000, 20000, 30000, 45000];
  let attempt = 0;
  const run = () => {
    clientApi.updateOnlyFiles(infoHash, [fileIndex]).catch(() => {
      attempt++;
      if (attempt < delays.length) {
        window.setTimeout(run, delays[attempt]);
      }
    });
  };
  window.setTimeout(run, delays[0]);
}

export function createHandlePlay(context: PlayHandlerContext) {
  const {
    torrent,
    isExternal,
    hasInfoHash,
    hasMagnetLink,
    streamingTorrentActive = false,
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
  } = context;

  return async () => {
    setErrorMessage(null);
    const streamingCache: { value: boolean | null } = { value: null };
    /** Marque ce torrent comme "en streaming" pour masquer la carte téléchargement quand on revient sur la page. */
    const markStreamingIfActive = async () => {
      const forStreaming = await resolveStreamingActiveOnce(streamingTorrentActive, streamingCache);
      if (forStreaming && torrent.infoHash) setStreamingInfoHash(torrent.infoHash);
    };
    addDebugLog('info', '🎯 === DÉBUT: Clic sur bouton Lire ===', {
      hasInfoHash,
      isExternal,
      hasMagnetLink,
    });

    // PRIORITÉ 0: Si on a déjà des fichiers vidéo chargés (ex. par useVideoFiles au montage), lancer la lecture directement.
    // Permet de lire même quand getTorrent renvoie 404 temporairement alors que les fichiers sont bien présents.
    if (hasInfoHash && torrent.infoHash && videoFiles.length > 0 && selectedFile) {
      addDebugLog('info', '✅ Fichiers vidéo déjà chargés, démarrage direct de la lecture', {
        files_count: videoFiles.length,
      });
      await markStreamingIfActive();
      if (streamingTorrentActive && !getStreamingDownloadFull()) {
        const idx = selectedFile.index ?? 0;
        scheduleUpdateOnlyFilesWithRetry(torrent.infoHash, idx);
      }
      const ok = await waitForStreamReady(
        streamingTorrentActive, torrent.infoHash, selectedFile,
        setProgressMessage, setPlayStatus, setErrorMessage, addDebugLog
      );
      if (!ok) return;
      setPlayStatus('ready');
      setProgressMessage('Lancement de la lecture...');
      setIsPlaying(true);
      setShowInfo(false);
      stopProgressPolling();
      return;
    }

    // PRIORITÉ 0.5: Média disponible en bibliothèque (fichier sur disque, torrent peut être absent du client) — charger depuis le chemin library puis lancer
    if (isAvailableLocally && hasInfoHash && torrent.infoHash) {
      addDebugLog('info', '📚 Média disponible localement, chargement des fichiers depuis la bibliothèque...');
      const libraryVideos = await loadVideoFiles(torrent.infoHash);
      if (libraryVideos.length > 0) {
        addDebugLog('success', '✅ Fichiers trouvés depuis la bibliothèque, lancement de la lecture', {
          files_count: libraryVideos.length,
        });
        setVideoFiles(libraryVideos);
        setSelectedFile(libraryVideos[0]);
        await markStreamingIfActive();
        const okLib = await waitForStreamReady(
          streamingTorrentActive, torrent.infoHash!, libraryVideos[0],
          setProgressMessage, setPlayStatus, setErrorMessage, addDebugLog
        );
        if (!okLib) return;
        setPlayStatus('ready');
        setProgressMessage('Lancement de la lecture...');
        setIsPlaying(true);
        setShowInfo(false);
        stopProgressPolling();
        return;
      }
    }

    // PRIORITÉ 1: Vérifier si le torrent existe dans le client (avec réessais en cas de 404 temporaire).
    // Variant externe avec lien .torrent ou magnet : on va l'ajouter, ne pas appeler getTorrent (évite 404 en console).
    const isExternalWillAdd = isExternal && (torrent._externalLink || torrent._externalMagnetUri);
    if (hasInfoHash && torrent.infoHash && !isExternalWillAdd) {
      try {
        let stats = await clientApi.getTorrent(torrent.infoHash);
        const maxGetTorrentRetries = 3;
        for (let r = 0; !stats && r < maxGetTorrentRetries - 1; r++) {
          addDebugLog('info', `🔄 getTorrent 404, réessai ${r + 2}/${maxGetTorrentRetries}...`);
          await new Promise(resolve => setTimeout(resolve, 600));
          stats = await clientApi.getTorrent(torrent.infoHash);
        }
        if (stats) {
          addDebugLog('info', '✅ Torrent déjà présent dans le client, vérification des fichiers vidéo...', {
            state: stats.state,
            progress: `${(stats.progress * 100).toFixed(1)}%`,
          });
          
          const isCompleted = stats.state === 'completed' || stats.state === 'seeding' || stats.progress >= 0.95;
          
          // Si le torrent est complété, essayer de charger les fichiers avec plusieurs tentatives
          if (isCompleted) {
            let videos: any[] = [];
            let retryCount = 0;
            const maxRetries = 10;
            
            // Essayer de charger les fichiers plusieurs fois (les fichiers peuvent ne pas être immédiatement disponibles)
            while (videos.length === 0 && retryCount < maxRetries) {
              videos = await loadVideoFiles(torrent.infoHash, retryCount);
              if (videos.length > 0) {
                break;
              }
              if (retryCount < maxRetries - 1) {
                addDebugLog('info', `🔄 Fichiers non disponibles, réessai ${retryCount + 1}/${maxRetries}...`, {
                  state: stats.state,
                  progress: `${(stats.progress * 100).toFixed(1)}%`,
                });
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
              retryCount++;
            }
            
            if (videos.length > 0) {
              addDebugLog('success', '✅ Fichiers vidéo trouvés, démarrage direct de la lecture', {
                files_count: videos.length,
                retries: retryCount,
              });
              setVideoFiles(videos);
              setSelectedFile(videos[0]);
              await markStreamingIfActive();
              const ok1 = await waitForStreamReady(
                streamingTorrentActive, torrent.infoHash!, videos[0],
                setProgressMessage, setPlayStatus, setErrorMessage, addDebugLog
              );
              if (!ok1) return;
              setPlayStatus('ready');
              setProgressMessage('Lancement de la lecture...');
              setIsPlaying(true);
              setShowInfo(false);
              stopProgressPolling();
              setTorrentStats(stats);
              return;
            } else {
              // Si le torrent est complété mais qu'aucun fichier n'est trouvé après plusieurs tentatives,
              // démarrer le polling pour attendre que les fichiers soient disponibles
              addDebugLog('warning', '⚠️ Torrent complété mais fichiers non disponibles, attente...', {
                state: stats.state,
                progress: `${(stats.progress * 100).toFixed(1)}%`,
              });
              setPlayStatus('downloading');
              setProgressMessage('Attente des fichiers...');
              setTorrentStats(stats);
              
              progressPollIntervalRef.current = window.setInterval(() => {
                pollTorrentProgress(torrent.infoHash!);
              }, PROGRESS_POLL_INTERVAL_MS);
              pollTorrentProgress(torrent.infoHash);
              return;
            }
          }
          
          // Si le torrent est en cours de téléchargement, démarrer le polling
          if (stats.state !== 'completed' && stats.progress < 0.95) {
            addDebugLog('info', '⏳ Torrent en cours de téléchargement, démarrage du polling...', {
              state: stats.state,
              progress: `${(stats.progress * 100).toFixed(1)}%`,
            });
            setPlayStatus('downloading');
            setProgressMessage('Recherche de peers...');
            setTorrentStats(stats);
            
            progressPollIntervalRef.current = window.setInterval(() => {
              pollTorrentProgress(torrent.infoHash!);
            }, PROGRESS_POLL_INTERVAL_MS);
            pollTorrentProgress(torrent.infoHash);
            return;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isNetworkError =
          msg.includes('fetch') ||
          msg.includes('Failed to fetch') ||
          msg.includes('NetworkError') ||
          msg.includes('CONNECTION_REFUSED') ||
          msg.includes('ERR_CONNECTION_REFUSED') ||
          msg.includes('ECONNREFUSED') ||
          msg.includes('network');
        if (isNetworkError) {
          setPlayStatus('error');
          setErrorMessage('Serveur inaccessible. Vérifiez que le backend est démarré.');
          addDebugLog('error', '❌ Impossible de joindre le serveur', { error: msg });
          return;
        }
        // Le torrent n'existe pas encore, continuer avec le téléchargement
        addDebugLog('info', 'ℹ️ Torrent non trouvé dans le client, téléchargement nécessaire');
      }
    }

    // Pour un torrent externe avec infoHash, prioriser le fichier .torrent s'il est disponible
    // car il contient tous les trackers (important pour les trackers privés comme C411)
    if (isExternal && hasInfoHash && torrent.infoHash) {
      addDebugLog('info', '🔍 Vérification des liens disponibles', {
        hasExternalLink: !!torrent._externalLink,
        externalLink: torrent._externalLink ? (torrent._externalLink.substring(0, 100) + '...') : null,
        hasExternalMagnetUri: !!torrent._externalMagnetUri,
        isMagnet: torrent._externalLink?.startsWith('magnet:') || false,
      });
      
      // PRIORITÉ 1: Vérifier si on a un fichier .torrent disponible (_externalLink qui n'est pas un magnet link)
      if (torrent._externalLink && torrent._externalLink.trim() && !torrent._externalLink.startsWith('magnet:')) {
        addDebugLog('info', '📥 Téléchargement du fichier .torrent depuis l\'API (contient les trackers)', {
          externalLink: torrent._externalLink,
          infoHash: torrent.infoHash,
        });
        
        setPlayStatus('adding');
        setProgressMessage('Téléchargement du fichier torrent...');

        try {
          // Télécharger le fichier .torrent via le backend comme proxy
          // (pour éviter les problèmes CORS avec les trackers externes comme C411)
          const baseUrl = serverApi.getServerUrl();
          const token = serverApi.getAccessToken();
          const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
          
          // Toujours utiliser le backend comme proxy pour éviter les problèmes CORS
          // Le backend fera la requête côté serveur et renverra le fichier .torrent
          // Passer indexerId, indexerName, torrentId, indexerTypeId pour le backend (template YGG etc.)
          const indexerId = (torrent as any).indexerId || (torrent as any).indexer_id;
          const indexerName = (torrent as any).indexerName || (torrent as any).indexer_name;
          const guid = torrent._guid || (torrent as any)._externalGuid || null; // GUID Torznab stocké lors de la synchronisation
          const torrentIdFromVariant = torrent.id?.includes('_') ? torrent.id.split('_').pop() : torrent.id;
          const indexerTypeIdFromVariant = torrent.id?.match(/^external_(.+?)_\d+$/)?.[1];
          const indexerIdParam = indexerId ? `&indexerId=${encodeURIComponent(indexerId)}` : '';
          const indexerNameParam = indexerName ? `&indexerName=${encodeURIComponent(indexerName)}` : '';
          const guidParam = guid ? `&guid=${encodeURIComponent(guid)}` : '';
          const torrentIdParam = torrentIdFromVariant ? `&torrentId=${encodeURIComponent(torrentIdFromVariant)}` : '';
          const indexerTypeIdParam = indexerTypeIdFromVariant ? `&indexerTypeId=${encodeURIComponent(indexerTypeIdFromVariant)}` : '';
          const downloadUrl = `${baseUrl}/api/torrents/external/download?url=${encodeURIComponent(torrent._externalLink)}&torrentName=${encodeURIComponent(torrent.name)}${indexerIdParam}${indexerNameParam}${guidParam}${torrentIdParam}${indexerTypeIdParam}`;
          
          addDebugLog('info', '📥 URL de téléchargement via proxy backend:', { 
            downloadUrl, 
            originalUrl: torrent._externalLink,
            indexerId,
            indexerName,
            guid,
          });
          const response = await fetch(downloadUrl, { headers });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const errorMsg = typeof errorData?.error === 'string' ? errorData.error : '';
            const isTorrentUnavailable = response.status === 404 || (response.status === 502 && (errorMsg.includes('indexer') || errorMsg.includes('404') || errorMsg.includes('indisponible')));
            // Si on a un magnet issu de la recherche (sync), l'utiliser en secours quand le .torrent est indisponible sur l'indexeur
            if (isTorrentUnavailable && (torrent._externalMagnetUri?.trim())) {
              addDebugLog('info', '📥 Fichier .torrent indisponible sur l\'indexeur, ajout via magnet (données de la recherche)', { hasMagnet: true });
              const forStreaming = await resolveStreamingActiveOnce(streamingTorrentActive, streamingCache);
              const downloadType = forStreaming ? undefined : (torrent.tmdbType === 'movie' ? 'film' : (torrent.tmdbType === 'tv' ? 'serie' : 'film'));
              const addResult = await clientApi.addMagnetLink(torrent._externalMagnetUri!, torrent.name, forStreaming, downloadType);
              if (addResult.info_hash) {
                if (forStreaming) setStreamingInfoHash(addResult.info_hash);
                if (typeof torrent.tmdbId === 'number' && (torrent.tmdbType === 'movie' || torrent.tmdbType === 'tv')) {
                  clientApi.bindDownloadToMedia(addResult.info_hash, torrent.tmdbId, torrent.tmdbType).catch(() => {});
                }
                setPlayStatus('adding');
                setProgressMessage('Récupération des métadonnées...');
                addDebugLog('info', '✅ Torrent ajouté via magnet (fallback), attente des métadonnées...', { infoHash: addResult.info_hash });

                let retryCount = 0;
                const maxRetries = 30;
                const checkMetadata = async () => {
                  try {
                    const stats = await clientApi.getTorrent(addResult.info_hash);
                    const hasMetadata = stats && stats.total_bytes > 0;
                    const files = await clientApi.getTorrentFiles(addResult.info_hash);
                    const hasFiles = files.length > 0;
                    if (hasMetadata || hasFiles) {
                      addDebugLog('success', '✅ Métadonnées disponibles', { total_bytes: stats?.total_bytes || 0, files_count: files.length });
                      setPlayStatus('downloading');
                      setProgressMessage('Recherche de peers...');
                      const videos = await loadVideoFiles(addResult.info_hash);
                      if (videos.length > 0) {
                        addDebugLog('success', '✅ Fichiers vidéo trouvés', { files_count: videos.length });
                        if (forStreaming && !getStreamingDownloadFull()) {
                          scheduleUpdateOnlyFilesWithRetry(addResult.info_hash, videos[0].index ?? 0);
                        }
                        setVideoFiles(videos);
                        setSelectedFile(videos[0]);
                        if (forStreaming) {
                          await markStreamingIfActive();
                          const okM = await waitForStreamReady(
                            streamingTorrentActive, addResult.info_hash, videos[0],
                            setProgressMessage, setPlayStatus, setErrorMessage, addDebugLog
                          );
                          if (!okM) return;
                          setPlayStatus('ready');
                          setProgressMessage('Lancement de la lecture...');
                          setIsPlaying(true);
                          setShowInfo(false);
                          stopProgressPolling();
                          return;
                        }
                        progressPollIntervalRef.current = window.setInterval(() => pollTorrentProgress(addResult.info_hash), PROGRESS_POLL_INTERVAL_MS);
                        pollTorrentProgress(addResult.info_hash);
                      } else if (retryCount < maxRetries) {
                        retryCount++;
                        setProgressMessage(`Récupération des métadonnées... (${retryCount}/${maxRetries})`);
                        setTimeout(checkMetadata, 1000);
                      } else {
                        setPlayStatus('downloading');
                        setProgressMessage('Recherche de peers...');
                        progressPollIntervalRef.current = window.setInterval(() => pollTorrentProgress(addResult.info_hash), PROGRESS_POLL_INTERVAL_MS);
                        pollTorrentProgress(addResult.info_hash);
                      }
                    } else if (retryCount < maxRetries) {
                      retryCount++;
                      setProgressMessage(`Récupération des métadonnées... (${retryCount}/${maxRetries})`);
                      setTimeout(checkMetadata, 1000);
                    } else {
                      setPlayStatus('downloading');
                      setProgressMessage('Recherche de peers...');
                      progressPollIntervalRef.current = window.setInterval(() => pollTorrentProgress(addResult.info_hash), PROGRESS_POLL_INTERVAL_MS);
                      pollTorrentProgress(addResult.info_hash);
                    }
                  } catch {
                    if (retryCount < maxRetries) {
                      retryCount++;
                      setTimeout(checkMetadata, 1000);
                    } else {
                      setPlayStatus('downloading');
                      progressPollIntervalRef.current = window.setInterval(() => pollTorrentProgress(addResult.info_hash), PROGRESS_POLL_INTERVAL_MS);
                      pollTorrentProgress(addResult.info_hash);
                    }
                  }
                };
                setTimeout(checkMetadata, 1000);
                return;
              }
            }
            if (isTorrentUnavailable) {
              setErrorMessage(errorMsg || 'Ce torrent n\'est plus disponible sur l\'indexeur. Choisissez une autre source.');
              setPlayStatus('idle');
              setProgressMessage(null);
              return;
            }
            // Si l'API retourne un magnet link en cas d'erreur, l'utiliser
            if (errorData.isMagnet && errorData.magnetUri) {
              addDebugLog('info', '📥 L\'API a retourné un magnet link (fallback)', { magnetUri: errorData.magnetUri });
              const forStreaming = await resolveStreamingActiveOnce(streamingTorrentActive, streamingCache);
              const downloadType = forStreaming ? undefined : (torrent.tmdbType === 'movie' ? 'film' : (torrent.tmdbType === 'tv' ? 'serie' : 'film'));
              const addResult = await clientApi.addMagnetLink(errorData.magnetUri, torrent.name, forStreaming, downloadType);
              if (addResult.info_hash) {
                if (forStreaming) setStreamingInfoHash(addResult.info_hash);
                if (typeof torrent.tmdbId === 'number' && (torrent.tmdbType === 'movie' || torrent.tmdbType === 'tv')) {
                  clientApi.bindDownloadToMedia(addResult.info_hash, torrent.tmdbId, torrent.tmdbType).catch(() => {});
                }
                setPlayStatus('adding');
                setProgressMessage('Récupération des métadonnées...');
                addDebugLog('info', '✅ Torrent ajouté via magnet link, attente des métadonnées...', {
                  infoHash: addResult.info_hash,
                });

                let retryCount = 0;
                const maxRetries = 30;
                
                const checkMetadata = async () => {
                  try {
                    const stats = await clientApi.getTorrent(addResult.info_hash);
                    const hasMetadata = stats && stats.total_bytes > 0;
                    const files = await clientApi.getTorrentFiles(addResult.info_hash);
                    const hasFiles = files.length > 0;
                    
                    if (hasMetadata || hasFiles) {
                      addDebugLog('success', '✅ Métadonnées disponibles', {
                        total_bytes: stats?.total_bytes || 0,
                        files_count: files.length,
                      });
                      
                      setPlayStatus('downloading');
                      setProgressMessage('Recherche de peers...');
                      
                      const videos = await loadVideoFiles(addResult.info_hash);
                      if (videos.length > 0) {
                        addDebugLog('success', '✅ Fichiers vidéo trouvés', { files_count: videos.length });
                        if (forStreaming && !getStreamingDownloadFull()) {
                          scheduleUpdateOnlyFilesWithRetry(addResult.info_hash, videos[0].index ?? 0);
                        }
                        setVideoFiles(videos);
                        setSelectedFile(videos[0]);
                        if (forStreaming) {
                          await markStreamingIfActive();
                          const okM = await waitForStreamReady(
                            streamingTorrentActive, addResult.info_hash, videos[0],
                            setProgressMessage, setPlayStatus, setErrorMessage, addDebugLog
                          );
                          if (!okM) return;
                          setPlayStatus('ready');
                          setProgressMessage('Lancement de la lecture...');
                          setIsPlaying(true);
                          setShowInfo(false);
                          stopProgressPolling();
                          return;
                        }
                      }
                      
                      progressPollIntervalRef.current = window.setInterval(() => {
                        pollTorrentProgress(addResult.info_hash);
                      }, PROGRESS_POLL_INTERVAL_MS);
                      pollTorrentProgress(addResult.info_hash);
                    } else if (retryCount < maxRetries) {
                      retryCount++;
                      setProgressMessage(`Récupération des métadonnées... (${retryCount}/${maxRetries})`);
                      setTimeout(checkMetadata, 1000);
                    } else {
                      addDebugLog('warning', '⚠️ Timeout: Métadonnées non disponibles après 30 secondes');
                      setPlayStatus('downloading');
                      setProgressMessage('Recherche de peers...');
                      progressPollIntervalRef.current = window.setInterval(() => {
                        pollTorrentProgress(addResult.info_hash);
                      }, PROGRESS_POLL_INTERVAL_MS);
                      pollTorrentProgress(addResult.info_hash);
                    }
                  } catch (err) {
                    console.error('Erreur lors de la vérification des métadonnées:', err);
                    if (retryCount < maxRetries) {
                      retryCount++;
                      setTimeout(checkMetadata, 1000);
                    } else {
                      setPlayStatus('downloading');
                      setProgressMessage('Recherche de peers...');
                      progressPollIntervalRef.current = window.setInterval(() => {
                        pollTorrentProgress(addResult.info_hash);
                      }, PROGRESS_POLL_INTERVAL_MS);
                      pollTorrentProgress(addResult.info_hash);
                    }
                  }
                };
                
                setTimeout(checkMetadata, 500);
                return;
              }
            }
            throw new Error(errorData.error || `Erreur ${response.status} lors du téléchargement du fichier torrent`);
          }

          // Télécharger le fichier .torrent et l'ajouter
          const blob = await response.blob();
          
          // Vérifier que c'est un fichier torrent valide avant de l'ajouter
          const arrayBuffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(arrayBuffer);
          
          addDebugLog('info', '📄 Vérification du fichier téléchargé:', {
            fileSize: blob.size,
            firstByte: uint8Array[0],
            contentType: response.headers.get('content-type'),
            expectedFirstByte: 0x64, // 'd' pour Bencode dictionary
            isTorrent: uint8Array.length > 0 && uint8Array[0] === 0x64,
            note: 'Le backend Rust gère tous les trackers (HTTP/HTTPS/WebSocket)',
          });
          
          // Vérifier que c'est un fichier torrent valide
          if (uint8Array.length === 0 || uint8Array[0] !== 0x64) {
            const firstBytes = String.fromCharCode(...uint8Array.slice(0, Math.min(100, uint8Array.length)));
            addDebugLog('error', '❌ Fichier téléchargé n\'est pas un torrent valide:', {
              size: uint8Array.length,
              firstByte: uint8Array[0],
              firstChars: firstBytes.substring(0, 100),
              isHTML: firstBytes.includes('<html') || firstBytes.includes('<!DOCTYPE'),
            });
            
            if (firstBytes.includes('<html') || firstBytes.includes('<!DOCTYPE')) {
              throw new Error('La réponse est une page HTML, pas un fichier torrent. L\'URL nécessite probablement une authentification C411 via l\'API Torznab.');
            } else {
              throw new Error(`Le fichier téléchargé n'est pas un fichier torrent valide. Premier octet: ${uint8Array[0]} (0x${uint8Array[0].toString(16)}), attendu: 100 (0x64, 'd' pour Bencode).`);
            }
          }
          
          const torrentFile = new File([blob], `${torrent.name}.torrent`, { type: 'application/x-bittorrent' });
          
          addDebugLog('success', '✅ Fichier .torrent téléchargé et validé, ajout au backend...', {
            fileSize: blob.size,
            infoHash: torrent.infoHash,
            firstByte: uint8Array[0],
          });
          
          setPlayStatus('adding');
          setProgressMessage('Ajout du fichier torrent...');
          
          const forStreaming = await resolveStreamingActiveOnce(streamingTorrentActive, streamingCache);
          const downloadType = forStreaming ? undefined : (torrent.tmdbType === 'movie' ? 'film' : (torrent.tmdbType === 'tv' ? 'serie' : 'film'));
          const addResult = await clientApi.addTorrentFile(torrentFile, forStreaming, downloadType);
          if (addResult.info_hash) {
            if (forStreaming) setStreamingInfoHash(addResult.info_hash);
            if (typeof torrent.tmdbId === 'number' && (torrent.tmdbType === 'movie' || torrent.tmdbType === 'tv')) {
              clientApi.bindDownloadToMedia(addResult.info_hash, torrent.tmdbId, torrent.tmdbType).catch(() => {});
            }
            setPlayStatus('downloading');
            setProgressMessage('Recherche de peers...');
            addDebugLog('success', '✅ Fichier .torrent ajouté avec succès au backend', {
              infoHash: addResult.info_hash,
              note: 'Le backend Rust gère tous les trackers (HTTP/HTTPS/WebSocket)',
            });
            
            // Les métadonnées sont généralement immédiatement disponibles avec un fichier .torrent
            const videos = await loadVideoFiles(addResult.info_hash);
            if (videos.length > 0) {
              if (forStreaming && !getStreamingDownloadFull()) {
                scheduleUpdateOnlyFilesWithRetry(addResult.info_hash, videos[0].index ?? 0);
              }
              addDebugLog('success', '✅ Fichiers vidéo trouvés', {
                files_count: videos.length,
              });
              setVideoFiles(videos);
              setSelectedFile(videos[0]);
              if (forStreaming) {
                await markStreamingIfActive();
                const okT = await waitForStreamReady(
                  streamingTorrentActive, addResult.info_hash, videos[0],
                  setProgressMessage, setPlayStatus, setErrorMessage, addDebugLog
                );
                if (!okT) return;
                setPlayStatus('ready');
                setProgressMessage('Lancement de la lecture...');
                setIsPlaying(true);
                setShowInfo(false);
                stopProgressPolling();
                return;
              }
            } else {
              // Même avec un fichier .torrent, parfois les fichiers ne sont pas immédiatement disponibles
              addDebugLog('info', '⏳ Fichiers vidéo non encore disponibles, démarrage du polling...');
            }
            
            progressPollIntervalRef.current = window.setInterval(() => {
              pollTorrentProgress(addResult.info_hash);
            }, PROGRESS_POLL_INTERVAL_MS);
            pollTorrentProgress(addResult.info_hash);
            
            return;
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          addDebugLog('warning', '⚠️ Erreur lors du téléchargement du fichier .torrent, tentative avec magnet link...', {
            error: errorMsg,
          });
          // Continuer avec le magnet link en fallback
        }
      }
      
      // PRIORITÉ 2: Vérifier si on a un magnet link (direct ou dans _externalLink)
      const magnetUri = torrent._externalMagnetUri || 
        (torrent._externalLink && torrent._externalLink.startsWith('magnet:') 
          ? torrent._externalLink 
          : null);
      
      if (magnetUri) {
        addDebugLog('info', '🔨 Construction du magnet link à partir de l\'infoHash (fallback)', {
          infoHash: torrent.infoHash,
          note: '⚠️ Les trackers peuvent ne pas être disponibles dans le magnet link construit',
        });
        const constructedMagnet = `magnet:?xt=urn:btih:${torrent.infoHash}&dn=${encodeURIComponent(torrent.name)}`;
        
        setPlayStatus('adding');
        setProgressMessage('Ajout du torrent via infoHash...');

        try {
          const forStreaming = await resolveStreamingActiveOnce(streamingTorrentActive, streamingCache);
          const downloadType = forStreaming ? undefined : (torrent.tmdbType === 'movie' ? 'film' : (torrent.tmdbType === 'tv' ? 'serie' : 'film'));
          const addResult = await clientApi.addMagnetLink(constructedMagnet, torrent.name, forStreaming, downloadType);
          if (addResult.info_hash) {
            if (forStreaming) setStreamingInfoHash(addResult.info_hash);
            if (typeof torrent.tmdbId === 'number' && (torrent.tmdbType === 'movie' || torrent.tmdbType === 'tv')) {
              clientApi.bindDownloadToMedia(addResult.info_hash, torrent.tmdbId, torrent.tmdbType).catch(() => {});
            }
            setPlayStatus('adding');
            setProgressMessage('Récupération des métadonnées...');
            addDebugLog('info', '✅ Torrent ajouté, attente des métadonnées...', {
              infoHash: addResult.info_hash,
            });

            // Attendre que les métadonnées soient disponibles avant de démarrer le polling
            // Réessayer toutes les secondes jusqu'à ce que les fichiers soient disponibles
            let retryCount = 0;
            const maxRetries = 30; // 30 secondes maximum
            
            const checkMetadata = async () => {
              try {
                const stats = await clientApi.getTorrent(addResult.info_hash);
                
                // Vérifier si les métadonnées sont disponibles (total_bytes > 0 ou fichiers disponibles)
                const hasMetadata = stats && stats.total_bytes > 0;
                const files = await clientApi.getTorrentFiles(addResult.info_hash);
                const hasFiles = files.length > 0;
                
                if (hasMetadata || hasFiles) {
                  // Les métadonnées sont disponibles, essayer de charger les fichiers
                  addDebugLog('success', '✅ Métadonnées disponibles', {
                    total_bytes: stats?.total_bytes || 0,
                    files_count: files.length,
                    hasMetadata,
                    hasFiles,
                  });
                  
                  setPlayStatus('downloading');
                  setProgressMessage('Recherche de peers...');
                  
                  // Essayer de charger les fichiers (peut prendre un peu de temps si pas encore prêts)
                  const videos = await loadVideoFiles(addResult.info_hash);
                  if (videos.length > 0) {
                    if (forStreaming && !getStreamingDownloadFull()) {
                      scheduleUpdateOnlyFilesWithRetry(addResult.info_hash, videos[0].index ?? 0);
                    }
                    addDebugLog('success', '✅ Fichiers vidéo trouvés', {
                      files_count: videos.length,
                    });
                    setVideoFiles(videos);
                    setSelectedFile(videos[0]);
                    if (forStreaming) {
                      await markStreamingIfActive();
                      const okMag = await waitForStreamReady(
                        streamingTorrentActive, addResult.info_hash, videos[0],
                        setProgressMessage, setPlayStatus, setErrorMessage, addDebugLog
                      );
                      if (!okMag) return;
                      setPlayStatus('ready');
                      setProgressMessage('Lancement de la lecture...');
                      setIsPlaying(true);
                      setShowInfo(false);
                      stopProgressPolling();
                      return;
                    }
                  } else if (hasFiles) {
                    // On a des fichiers mais pas encore de vidéo, réessayer après 1 seconde
                    addDebugLog('info', '⏳ Fichiers disponibles mais pas encore de vidéo, réessai...', {
                      files_count: files.length,
                    });
                    if (retryCount < maxRetries) {
                      retryCount++;
                      setTimeout(checkMetadata, 1000);
                      return;
                    }
                  }
                  
                  // Démarrer le polling
                  progressPollIntervalRef.current = window.setInterval(() => {
                    pollTorrentProgress(addResult.info_hash);
                  }, PROGRESS_POLL_INTERVAL_MS);
                  pollTorrentProgress(addResult.info_hash);
                } else if (retryCount < maxRetries) {
                  // Pas encore de métadonnées, réessayer
                  retryCount++;
                  const remaining = maxRetries - retryCount;
                  setProgressMessage(`Récupération des métadonnées... (${retryCount}/${maxRetries})`);
                  addDebugLog('info', `⏳ En attente des métadonnées... (${retryCount}/${maxRetries})`, {
                    infoHash: addResult.info_hash,
                    peers: stats?.peers_connected || 0,
                  });
                  setTimeout(checkMetadata, 1000);
                } else {
                  // Timeout après 30 secondes
                  addDebugLog('warning', '⚠️ Timeout: Métadonnées non disponibles après 30 secondes, démarrage du polling quand même', {
                    infoHash: addResult.info_hash,
                    total_bytes: stats?.total_bytes || 0,
                    peers: stats?.peers_connected || 0,
                  });
                  setPlayStatus('downloading');
                  setProgressMessage('Recherche de peers...');
                  // Démarrer le polling quand même, il pourra récupérer les fichiers plus tard
                  progressPollIntervalRef.current = window.setInterval(() => {
                    pollTorrentProgress(addResult.info_hash);
                  }, PROGRESS_POLL_INTERVAL_MS);
                  pollTorrentProgress(addResult.info_hash);
                }
              } catch (err) {
                console.error('Erreur lors de la vérification des métadonnées:', err);
                if (retryCount < maxRetries) {
                  retryCount++;
                  setProgressMessage(`Récupération des métadonnées... (${retryCount}/${maxRetries})`);
                  setTimeout(checkMetadata, 1000);
                } else {
                  // En cas d'erreur, démarrer le polling quand même
                  addDebugLog('warning', '⚠️ Erreur après 30 secondes, démarrage du polling quand même', {
                    error: err instanceof Error ? err.message : String(err),
                  });
                  setPlayStatus('downloading');
                  setProgressMessage('Recherche de peers...');
                  progressPollIntervalRef.current = window.setInterval(() => {
                    pollTorrentProgress(addResult.info_hash);
                  }, PROGRESS_POLL_INTERVAL_MS);
                  pollTorrentProgress(addResult.info_hash);
                }
              }
            };
            
            // Démarrer la vérification des métadonnées
            setTimeout(checkMetadata, 500);
            
            return;
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          addDebugLog('error', 'Erreur lors de l\'ajout du torrent via infoHash', errorMsg);
          setPlayStatus('error');
          setErrorMessage(errorMsg);
          return;
        }
      }
    }

    // Si on a déjà un infoHash (torrent local ou déjà ajouté), vérifier d'abord si les fichiers vidéo existent
    if (hasInfoHash && torrent.infoHash && !isExternal) {
      // Détecter si c'est un média local
      const isLocalMedia = torrent.infoHash.startsWith('local_');
      
      addDebugLog('info', '✅ InfoHash disponible, vérification des fichiers vidéo...');
      
      const videos = await loadVideoFiles(torrent.infoHash);
      if (videos.length > 0) {
        addDebugLog('success', '✅ Fichiers vidéo trouvés, démarrage direct de la lecture', {
          files_count: videos.length,
          isLocalMedia,
        });
        setVideoFiles(videos);
        setSelectedFile(videos[0]);
        await markStreamingIfActive();
        if (!isLocalMedia) {
          const okH = await waitForStreamReady(
            streamingTorrentActive, torrent.infoHash!, videos[0],
            setProgressMessage, setPlayStatus, setErrorMessage, addDebugLog
          );
          if (!okH) return;
        }
        setPlayStatus('ready');
        setProgressMessage('Lancement de la lecture...');
        setIsPlaying(true);
        setShowInfo(false);
        stopProgressPolling();
        
        // Pour les médias locaux, ne pas essayer de récupérer les stats depuis l'API
        if (!isLocalMedia) {
          try {
            const stats = await clientApi.getTorrent(torrent.infoHash);
            if (stats) {
              setTorrentStats(stats);
            }
          } catch (err) {
            // Ignorer les erreurs
          }
        }
        
        return;
      }
      
      // Si pas de fichiers, vérifier l'état du torrent (sauf pour les médias locaux)
      if (!isLocalMedia) {
        try {
        const stats = await clientApi.getTorrent(torrent.infoHash);
        if (stats) {
          addDebugLog('success', '✅ Torrent trouvé dans le client', {
            state: stats.state,
            progress: `${(stats.progress * 100).toFixed(1)}%`,
          });
          setTorrentStats(stats);

          if (stats.state === 'seeding' || stats.state === 'completed' || stats.progress >= 0.95) {
            addDebugLog('info', '📚 Torrent terminé, chargement des fichiers vidéo...');
            const videos2 = await loadVideoFiles(torrent.infoHash);
            if (videos2.length > 0) {
              setVideoFiles(videos2);
              setSelectedFile(videos2[0]);
              await markStreamingIfActive();
              const ok2 = await waitForStreamReady(
                streamingTorrentActive, torrent.infoHash!, videos2[0],
                setProgressMessage, setPlayStatus, setErrorMessage, addDebugLog
              );
              if (!ok2) return;
              setPlayStatus('ready');
              setProgressMessage('Lancement de la lecture...');
              setIsPlaying(true);
              setShowInfo(false);
              stopProgressPolling();
              return;
            }
          }

          // Si le torrent est en cours de téléchargement
          if (stats.state !== 'completed' && stats.progress < 0.95 && !isPlaying) {
            setPlayStatus('downloading');
            setProgressMessage('Recherche de peers...');

            await loadVideoFiles(torrent.infoHash);

            if (!isPlaying) {
              progressPollIntervalRef.current = window.setInterval(() => {
                pollTorrentProgress(torrent.infoHash!);
              }, PROGRESS_POLL_INTERVAL_MS);
              pollTorrentProgress(torrent.infoHash);
            }
            return;
          }
        }
      } catch (err) {
        addDebugLog('info', 'Torrent non trouvé dans le client, continuation avec la logique normale');
      }
      }
    }

    // Torrent externe ou indexeur avec magnet (sans infoHash) : ajouter via magnet puis lancer la lecture
    const magnetUri = torrent._externalMagnetUri || (torrent._externalLink?.startsWith('magnet:') ? torrent._externalLink : null);
    if ((isExternal || !hasInfoHash) && magnetUri) {
      setPlayStatus('adding');
      setProgressMessage('Ajout du lien magnet...');
      addDebugLog('info', 'Utilisation du magnet link direct');

      try {
        const forStreaming = await resolveStreamingActiveOnce(streamingTorrentActive, streamingCache);
        const downloadType = forStreaming ? undefined : (torrent.tmdbType === 'movie' ? 'film' : (torrent.tmdbType === 'tv' ? 'serie' : 'film'));
        const addResult = await clientApi.addMagnetLink(magnetUri, torrent.name, forStreaming, downloadType);
        if (addResult.info_hash) {
          if (forStreaming) setStreamingInfoHash(addResult.info_hash);
          if (typeof torrent.tmdbId === 'number' && (torrent.tmdbType === 'movie' || torrent.tmdbType === 'tv')) {
            clientApi.bindDownloadToMedia(addResult.info_hash, torrent.tmdbId, torrent.tmdbType).catch(() => {});
          }
          setPlayStatus('adding');
          setProgressMessage('Récupération des métadonnées...');
          addDebugLog('info', '✅ Torrent ajouté, attente des métadonnées...', {
            infoHash: addResult.info_hash,
          });

          // Attendre que les métadonnées soient disponibles
          let retryCount = 0;
          const maxRetries = 30;
          
          const checkMetadata = async () => {
            try {
              const stats = await clientApi.getTorrent(addResult.info_hash);
              
              // Vérifier si les métadonnées sont disponibles (total_bytes > 0 ou fichiers disponibles)
              const hasMetadata = stats && stats.total_bytes > 0;
              const files = await clientApi.getTorrentFiles(addResult.info_hash);
              const hasFiles = files.length > 0;
              
              if (hasMetadata || hasFiles) {
                // Les métadonnées sont disponibles, essayer de charger les fichiers
                addDebugLog('success', '✅ Métadonnées disponibles', {
                  total_bytes: stats?.total_bytes || 0,
                  files_count: files.length,
                  hasMetadata,
                  hasFiles,
                });
                
                setPlayStatus('downloading');
                setProgressMessage('Recherche de peers...');
                
                // Essayer de charger les fichiers (peut prendre un peu de temps si pas encore prêts)
                const videos = await loadVideoFiles(addResult.info_hash);
                if (videos.length > 0) {
                  if (forStreaming && !getStreamingDownloadFull()) {
                    scheduleUpdateOnlyFilesWithRetry(addResult.info_hash, videos[0].index ?? 0);
                  }
                  addDebugLog('success', '✅ Fichiers vidéo trouvés', {
                    files_count: videos.length,
                  });
                  setVideoFiles(videos);
                  setSelectedFile(videos[0]);
                  if (forStreaming) {
                    await markStreamingIfActive();
                    const okC = await waitForStreamReady(
                      streamingTorrentActive, addResult.info_hash, videos[0],
                      setProgressMessage, setPlayStatus, setErrorMessage, addDebugLog
                    );
                    if (!okC) return;
                    setPlayStatus('ready');
                    setProgressMessage('Lancement de la lecture...');
                    setIsPlaying(true);
                    setShowInfo(false);
                    stopProgressPolling();
                    return;
                  }
                } else if (hasFiles) {
                  // On a des fichiers mais pas encore de vidéo, réessayer après 1 seconde
                  addDebugLog('info', '⏳ Fichiers disponibles mais pas encore de vidéo, réessai...', {
                    files_count: files.length,
                  });
                  if (retryCount < maxRetries) {
                    retryCount++;
                    setTimeout(checkMetadata, 1000);
                    return;
                  }
                }
                
                progressPollIntervalRef.current = window.setInterval(() => {
                  pollTorrentProgress(addResult.info_hash);
                }, PROGRESS_POLL_INTERVAL_MS);
                pollTorrentProgress(addResult.info_hash);
              } else if (retryCount < maxRetries) {
                // Pas encore de métadonnées, réessayer
                retryCount++;
                setProgressMessage(`Récupération des métadonnées... (${retryCount}/${maxRetries})`);
                addDebugLog('info', `⏳ En attente des métadonnées... (${retryCount}/${maxRetries})`, {
                  infoHash: addResult.info_hash,
                  peers: stats?.peers_connected || 0,
                });
                setTimeout(checkMetadata, 1000);
              } else {
                // Timeout après 30 secondes
                addDebugLog('warning', '⚠️ Timeout: Métadonnées non disponibles après 30 secondes, démarrage du polling quand même', {
                  infoHash: addResult.info_hash,
                  total_bytes: stats?.total_bytes || 0,
                  peers: stats?.peers_connected || 0,
                });
                setPlayStatus('downloading');
                setProgressMessage('Recherche de peers...');
                progressPollIntervalRef.current = window.setInterval(() => {
                  pollTorrentProgress(addResult.info_hash);
                }, PROGRESS_POLL_INTERVAL_MS);
                pollTorrentProgress(addResult.info_hash);
              }
            } catch (err) {
              console.error('Erreur lors de la vérification des métadonnées:', err);
              if (retryCount < maxRetries) {
                retryCount++;
                setProgressMessage(`Récupération des métadonnées... (${retryCount}/${maxRetries})`);
                setTimeout(checkMetadata, 1000);
              } else {
                // En cas d'erreur, démarrer le polling quand même
                addDebugLog('warning', '⚠️ Erreur après 30 secondes, démarrage du polling quand même', {
                  error: err instanceof Error ? err.message : String(err),
                });
                setPlayStatus('downloading');
                setProgressMessage('Recherche de peers...');
                progressPollIntervalRef.current = window.setInterval(() => {
                  pollTorrentProgress(addResult.info_hash);
                }, PROGRESS_POLL_INTERVAL_MS);
                pollTorrentProgress(addResult.info_hash);
              }
            }
          };
          
          setTimeout(checkMetadata, 500);
        } else {
          throw new Error('Aucun infoHash retourné après ajout du magnet link');
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        addDebugLog('error', 'Erreur lors de l\'ajout du magnet link', errorMsg);
        setPlayStatus('error');
        setErrorMessage(errorMsg);
      }
    } else if (torrent.infoHash) {
      // Torrent local - vérifier si disponible localement
      if (isAvailableLocally) {
        addDebugLog('info', '📚 Torrent disponible localement, utilisation directe');
        setPlayStatus('ready');
        setProgressMessage('Chargement depuis la bibliothèque locale...');
        const videos = await loadVideoFiles(torrent.infoHash);
        if (videos.length > 0) {
          setVideoFiles(videos);
          setSelectedFile(videos[0]);
          await markStreamingIfActive();
          setTimeout(() => {
            setIsPlaying(true);
            setShowInfo(false);
          }, 500);
        } else {
          setPlayStatus('error');
          setErrorMessage('Aucun fichier vidéo trouvé dans le torrent');
        }
      } else {
        setPlayStatus('error');
        setErrorMessage('Le torrent n\'est pas disponible. Vérifiez qu\'il est bien téléchargé.');
      }
    } else {
      setPlayStatus('error');
      setErrorMessage('Ce torrent ne peut pas être streamé. Aucun lien disponible.');
    }
  };
}
