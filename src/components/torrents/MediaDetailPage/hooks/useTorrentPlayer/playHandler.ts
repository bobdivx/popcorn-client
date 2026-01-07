import { webtorrentClient } from '../../../../../lib/torrent/webtorrent-client';
import { PROGRESS_POLL_INTERVAL_MS } from '../../utils/constants';
import type { PlayHandlerContext } from './types';

export function createHandlePlay(context: PlayHandlerContext) {
  const {
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
  } = context;

  return async () => {
    setErrorMessage(null);
    addDebugLog('info', '🎯 === DÉBUT: Clic sur bouton Lire ===', {
      hasInfoHash,
      isExternal,
      hasMagnetLink,
    });

    // Si on a déjà un infoHash, vérifier d'abord si les fichiers vidéo existent
    if (hasInfoHash && torrent.infoHash) {
      addDebugLog('info', '✅ InfoHash disponible, vérification des fichiers vidéo...');
      
      const videos = await loadVideoFiles(torrent.infoHash);
      if (videos.length > 0) {
        addDebugLog('success', '✅ Fichiers vidéo trouvés, démarrage direct de la lecture', {
          files_count: videos.length,
        });
        setVideoFiles(videos);
        setSelectedFile(videos[0]);
        setPlayStatus('ready');
        setProgressMessage('Lancement de la lecture...');
        setIsPlaying(true);
        setShowInfo(false);
        stopProgressPolling();
        
        try {
          const stats = await webtorrentClient.getTorrent(torrent.infoHash);
          if (stats) {
            setTorrentStats(stats);
          }
        } catch (err) {
          // Ignorer les erreurs
        }
        
        return;
      }
      
      // Si pas de fichiers, vérifier l'état du torrent
      try {
        const stats = await webtorrentClient.getTorrent(torrent.infoHash);
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

    // Torrent externe avec magnet link direct
    if (isExternal && hasMagnetLink && torrent._externalMagnetUri) {
      setPlayStatus('adding');
      setProgressMessage('Ajout du lien magnet...');
      addDebugLog('info', 'Utilisation du magnet link direct');

      try {
        const addResult = await webtorrentClient.addMagnetLink(torrent._externalMagnetUri, torrent.name);
        if (addResult.info_hash) {
          setPlayStatus('downloading');
          setProgressMessage('Recherche de peers...');

          loadVideoFiles(addResult.info_hash).catch(() => {});

          progressPollIntervalRef.current = window.setInterval(() => {
            pollTorrentProgress(addResult.info_hash);
          }, PROGRESS_POLL_INTERVAL_MS);
          pollTorrentProgress(addResult.info_hash);
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
