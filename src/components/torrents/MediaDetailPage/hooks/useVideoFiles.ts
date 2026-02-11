import { useState, useRef } from 'preact/hooks';
import { clientApi } from '../../../../lib/client/api';

export interface TorrentFile {
  path: string;
  name: string;
  size: number;
  mime_type?: string;
  is_video: boolean;
  index?: number; // Index dans le torrent pour créer l'URL blob
}

interface UseVideoFilesOptions {
  torrentName: string;
  onError?: (error: Error) => void;
  filePath?: string | null; // Chemin spécifique du fichier (pour torrents multi-épisodes)
  torrent?: {
    infoHash?: string | null;
    downloadPath?: string | null;
  } | null; // Torrent complet pour accéder au downloadPath pour les médias locaux
}

export function useVideoFiles({ torrentName, onError, filePath, torrent }: UseVideoFilesOptions) {
  const [videoFiles, setVideoFiles] = useState<TorrentFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<TorrentFile | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  // Cache pour éviter les appels multiples pour le même infoHash
  const loadingCacheRef = useRef<Map<string, Promise<TorrentFile[]>>>(new Map());
  const filesCacheRef = useRef<Map<string, TorrentFile[]>>(new Map());
  // Garder une trace du dernier infoHash utilisé pour invalider le cache si nécessaire
  const lastInfoHashRef = useRef<string | null>(null);

  const loadVideoFiles = async (infoHash: string, retryCount: number = 0): Promise<TorrentFile[]> => {
    if (!infoHash) return [];

    // Si l'infoHash a changé, invalider le cache pour éviter d'utiliser les fichiers d'un autre torrent
    if (lastInfoHashRef.current && lastInfoHashRef.current !== infoHash) {
      console.warn('[useVideoFiles] ⚠️ InfoHash changé, invalidation du cache:', {
        previous: lastInfoHashRef.current,
        current: infoHash,
      });
      filesCacheRef.current.clear();
      loadingCacheRef.current.clear();
      setVideoFiles([]);
      setSelectedFile(null);
    }
    lastInfoHashRef.current = infoHash;

    console.log('[useVideoFiles] 🔍 Chargement des fichiers vidéo pour infoHash:', {
      infoHash,
      torrentName,
      filePath,
      retryCount,
    });

    // Pour les médias locaux, ne jamais utiliser le cache : toujours utiliser le downloadPath
    // actuel du torrent pour éviter d'afficher le mauvais fichier (ex. "Les Rats" avec le chemin de "The Fall Guy").
    const isLocalMedia = infoHash.startsWith('local_');
    const skipCacheForLocal = isLocalMedia && torrent?.downloadPath;

    // Vérifier le cache (mais ne pas utiliser le cache si c'est vide et qu'on réessaie)
    // IMPORTANT: Vérifier que le cache correspond bien à l'infoHash demandé
    if (!skipCacheForLocal && filesCacheRef.current.has(infoHash) && retryCount === 0) {
      const cached = filesCacheRef.current.get(infoHash)!;
      if (cached.length > 0) {
        // Vérifier que les fichiers en cache correspondent bien à cet infoHash
        // En vérifiant que le chemin ne contient pas un autre infoHash
        const cacheValid = cached.every(file => {
          const pathLower = file.path.toLowerCase();
          // Le chemin ne doit pas contenir un autre infoHash (format session_XXXXX ou XXXXX)
          // On vérifie que le chemin ne contient pas un infoHash différent
          const otherInfoHashPattern = /session_[a-f0-9]{40}|[a-f0-9]{40}/;
          const matches = pathLower.match(otherInfoHashPattern);
          if (matches) {
            // Extraire l'infoHash trouvé dans le chemin
            for (const match of matches) {
              const foundHash = match.replace('session_', '').toLowerCase();
              // Si l'infoHash trouvé ne correspond pas à celui demandé, le cache est invalide
              if (foundHash.length === 40 && foundHash !== infoHash.toLowerCase()) {
                console.warn('[useVideoFiles] ⚠️ Cache invalide détecté:', {
                  requestedInfoHash: infoHash,
                  foundInfoHash: foundHash,
                  filePath: file.path,
                });
                return false;
              }
            }
          }
          return true;
        });
        
        if (cacheValid) {
          console.log('[useVideoFiles] ✅ Utilisation du cache pour', infoHash);
          return cached;
        } else {
          // Cache invalide, le supprimer
          console.warn('[useVideoFiles] 🗑️ Suppression du cache invalide pour', infoHash);
          filesCacheRef.current.delete(infoHash);
        }
      }
    }

    // Éviter les appels simultanés pour le même infoHash (mais permettre les réessais)
    if (loadingCacheRef.current.has(infoHash) && retryCount === 0) {
      console.log('[useVideoFiles] ⏳ Appel en cours pour', infoHash, ', attente...');
      return loadingCacheRef.current.get(infoHash)!;
    }

    const loadPromise = (async () => {
      setLoadingFiles(true);
      try {
        // Détecter si c'est un média local (infoHash commence par "local_")
        const isLocalMedia = infoHash.startsWith('local_');
        
        // Pour les médias locaux, utiliser directement le downloadPath
        if (isLocalMedia && torrent?.downloadPath) {
          console.log('[useVideoFiles] 📁 Média local détecté, utilisation du chemin direct:', torrent.downloadPath);
          const fileName = torrentName || torrent.downloadPath.split(/[/\\]/).pop() || 'video';
          const localFile: TorrentFile = {
            path: torrent.downloadPath,
            name: fileName,
            size: 0, // Taille inconnue pour les médias locaux
            is_video: true,
          };
          
          const files = [localFile];
          filesCacheRef.current.set(infoHash, files);
          setVideoFiles(files);
          setSelectedFile(files[0]);
          setLoadingFiles(false);
          return files;
        }

        // Si on a un chemin bibliothèque (média "disponible localement"), l'utiliser sans appeler getTorrent
        // pour éviter un 404 quand le torrent n'est pas sur ce backend (ex. bibliothèque partagée / autre machine).
        if (torrent?.downloadPath) {
          console.log('[useVideoFiles] 📁 Utilisation du chemin bibliothèque (sans appel getTorrent):', torrent.downloadPath);
          const fileName = torrentName || torrent.downloadPath.split(/[/\\]/).pop() || 'video';
          const libraryFile: TorrentFile = {
            path: torrent.downloadPath,
            name: fileName,
            size: 0,
            is_video: true,
          };
          const files = [libraryFile];
          filesCacheRef.current.set(infoHash, files);
          setVideoFiles(files);
          setSelectedFile(files[0]);
          setLoadingFiles(false);
          return files;
        }
        
        // Pour les torrents normaux (sans chemin bibliothèque), vérifier si le torrent existe sur le backend
        const torrentStats = await clientApi.getTorrent(infoHash);
        if (!torrentStats) {
          console.warn('[useVideoFiles] ⚠️ Torrent non trouvé dans le backend');
          if (retryCount < 5) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return loadVideoFiles(infoHash, retryCount + 1);
          }
          setLoadingFiles(false);
          return [];
        }
        
        // Récupérer les fichiers depuis le backend
        const backendFiles = await clientApi.getTorrentFiles(infoHash);
        
        // Vérifier que les fichiers retournés correspondent bien à l'infoHash demandé
        // Filtrer les fichiers qui contiennent un autre infoHash dans leur chemin
        const infoHashLower = infoHash.toLowerCase();
        const validBackendFiles = backendFiles.filter(f => {
          const pathLower = f.path.toLowerCase();
          // Vérifier si le chemin contient un infoHash différent
          const otherInfoHashPattern = /session_([a-f0-9]{40})|([a-f0-9]{40})/;
          const matches = pathLower.match(otherInfoHashPattern);
          if (matches) {
            for (const match of matches) {
              const foundHash = match.replace('session_', '').toLowerCase();
              // Si l'infoHash trouvé ne correspond pas à celui demandé, exclure ce fichier
              if (foundHash.length === 40 && foundHash !== infoHashLower) {
                console.warn('[useVideoFiles] ⚠️ Fichier exclu (infoHash différent dans le chemin):', {
                  filePath: f.path,
                  requestedInfoHash: infoHash,
                  foundInfoHash: foundHash,
                });
                return false;
              }
            }
          }
          return true;
        });
        
        console.log('[useVideoFiles] Fichiers filtrés par infoHash:', {
          total: backendFiles.length,
          valides: validBackendFiles.length,
          exclus: backendFiles.length - validBackendFiles.length,
        });
        
        if (validBackendFiles.length === 0) {
          console.warn('[useVideoFiles] ⚠️ Aucun fichier trouvé dans le torrent', {
            infoHash,
            retryCount,
            total_bytes: torrentStats.total_bytes,
            state: torrentStats.state,
          });
          
          // Si le torrent a des métadonnées (total_bytes > 0) mais pas de fichiers,
          // cela signifie que les fichiers n'ont pas encore été chargés
          // Réessayer jusqu'à 10 fois (10 secondes)
          if (torrentStats.total_bytes > 0 && retryCount < 10) {
            console.log('[useVideoFiles] 🔄 Réessai dans 1 seconde...', {
              retryCount: retryCount + 1,
              maxRetries: 10,
            });
            await new Promise(resolve => setTimeout(resolve, 1000));
            setLoadingFiles(false);
            return loadVideoFiles(infoHash, retryCount + 1);
          }
          
          setLoadingFiles(false);
          return [];
        }

        // Convertir en format TorrentFile
        console.log('[useVideoFiles] Fichiers bruts du backend (après filtrage infoHash):', validBackendFiles.map(f => ({
          path: f.path,
          size: f.size,
          is_video: f.is_video,
        })));
        
        let files: TorrentFile[] = validBackendFiles
          .filter((f) => f.is_video)
          .map((f, index) => ({
            path: f.path,
            name: f.path.split('/').pop() || f.path.split('\\').pop() || f.path,
            size: f.size,
            mime_type: f.mime_type,
            is_video: true,
            index,
          }));
        
        console.log('[useVideoFiles] Fichiers convertis:', files.map(f => ({
          path: f.path,
          name: f.name,
        })));

        // Si un filePath spécifique est fourni (torrent multi-épisodes), l'utiliser directement
        if (filePath && files.length > 1) {
          console.log('[useVideoFiles] Utilisation du filePath spécifique:', filePath);
          const matchingFile = files.find((f) => {
            const normalizedFilePath = filePath.replace(/\\/g, '/').toLowerCase();
            const normalizedFile = f.path.replace(/\\/g, '/').toLowerCase();
            return (
              normalizedFile.endsWith(normalizedFilePath) ||
              normalizedFile.includes(normalizedFilePath) ||
              normalizedFilePath.includes(normalizedFile.split('/').pop() || '')
            );
          });

          if (matchingFile) {
            files = [matchingFile];
          }
        }

        // Détecter si c'est une série (plusieurs fichiers vidéo de taille similaire)
        // ou un film (un seul gros fichier vidéo)
        const isLikelySeries =
          files.length > 1 && files.every((f) => f.size < 500_000_000); // Tous < 500MB = probablement des épisodes

        if (files.length === 0) {
          console.warn('[useVideoFiles] ⚠️ Aucun fichier vidéo trouvé dans le torrent');
          setLoadingFiles(false);
          return [];
        }

        // Pour les films, ne garder que le fichier principal (le plus gros)
        if (!isLikelySeries && files.length > 1) {
          const torrentNameLower = torrentName.toLowerCase();
          const torrentWords = torrentNameLower
            .split(/[\s\.\-_\(\)\[\]]+/)
            .filter(
              (w) =>
                w.length > 3 &&
                !['the', 'and', 'of', 'for', 'with', 'multi', '1080p', 'web', 'h265', 'tyhd'].includes(
                  w
                )
            );

          // Chercher le fichier qui correspond le mieux au nom du torrent
          const matchingFile = files.find((f) => {
            const fileNameLower = f.name.toLowerCase();
            const matchingWords = torrentWords.filter((word) => fileNameLower.includes(word));
            return matchingWords.length >= 2;
          });

          if (matchingFile) {
            files = [matchingFile];
          } else {
            // Sinon, prendre le plus gros fichier vidéo
            const largestFile = files.reduce((prev, current) =>
              current.size > prev.size ? current : prev
            );
            files = [largestFile];
          }
        }

        console.log('[useVideoFiles] Fichiers vidéo filtrés:', {
          count: files.length,
          is_likely_series: isLikelySeries,
          files: files.map((f) => ({ path: f.path, size: f.size })),
        });

        setVideoFiles(files);

        if (files.length > 0) {
          // Essayer de sélectionner le fichier qui correspond au nom du torrent
          const torrentNameLower = torrentName.toLowerCase();
          const torrentWords = torrentNameLower
            .split(/[\s\.\-_\(\)\[\]]+/)
            .filter(
              (w) =>
                w.length > 3 &&
                !['the', 'and', 'of', 'for', 'with', 'multi', '1080p', 'web', 'h265', 'tyhd'].includes(
                  w
                )
            );

          const matchingFile =
            files.find((v) => {
              const fileNameLower = v.name.toLowerCase();
              const matchingWords = torrentWords.filter((word) => fileNameLower.includes(word));
              return matchingWords.length >= 2;
            }) ||
            files.find((v) => {
              const fileNameLower = v.name.toLowerCase();
              return torrentWords.some((word) => fileNameLower.includes(word));
            }) ||
            files[0];

          setSelectedFile(matchingFile);
        }

        setLoadingFiles(false);

        // Mettre en cache le résultat
        filesCacheRef.current.set(infoHash, files);
        loadingCacheRef.current.delete(infoHash);

        return files;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Ne pas mettre en cache les erreurs
        loadingCacheRef.current.delete(infoHash);

        console.error('Erreur lors du chargement des fichiers:', error);
        if (onError && error instanceof Error) {
          onError(error);
        }
        setLoadingFiles(false);
        return [];
      }
    })();

    loadingCacheRef.current.set(infoHash, loadPromise);
    return loadPromise;
  };

  return {
    videoFiles,
    selectedFile,
    loadingFiles,
    setVideoFiles,
    setSelectedFile,
    loadVideoFiles,
  };
}
