import { useState, useRef } from 'preact/hooks';
import { webtorrentClient, type WebTorrentFile } from '../../../../lib/torrent/webtorrent-client';

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
}

export function useVideoFiles({ torrentName, onError, filePath }: UseVideoFilesOptions) {
  const [videoFiles, setVideoFiles] = useState<TorrentFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<TorrentFile | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  // Cache pour éviter les appels multiples pour le même infoHash
  const loadingCacheRef = useRef<Map<string, Promise<TorrentFile[]>>>(new Map());
  const filesCacheRef = useRef<Map<string, TorrentFile[]>>(new Map());

  const loadVideoFiles = async (infoHash: string): Promise<TorrentFile[]> => {
    if (!infoHash) return [];

    console.log('[useVideoFiles] 🔍 Chargement des fichiers vidéo pour infoHash:', {
      infoHash,
      torrentName,
      filePath,
    });

    // Vérifier le cache
    if (filesCacheRef.current.has(infoHash)) {
      const cached = filesCacheRef.current.get(infoHash)!;
      if (cached.length > 0) {
        console.log('[useVideoFiles] ✅ Utilisation du cache pour', infoHash);
        return cached;
      }
    }

    // Éviter les appels simultanés pour le même infoHash
    if (loadingCacheRef.current.has(infoHash)) {
      console.log('[useVideoFiles] ⏳ Appel en cours pour', infoHash, ', attente...');
      return loadingCacheRef.current.get(infoHash)!;
    }

    const loadPromise = (async () => {
      setLoadingFiles(true);
      try {
        // Récupérer les fichiers depuis WebTorrent
        const webtorrentFiles = webtorrentClient.getTorrentFiles(infoHash);
        
        if (webtorrentFiles.length === 0) {
          console.warn('[useVideoFiles] ⚠️ Aucun fichier trouvé dans le torrent (peut être en cours de chargement)');
          setLoadingFiles(false);
          return [];
        }

        // Convertir en format TorrentFile
        let files: TorrentFile[] = webtorrentFiles
          .filter((f) => f.is_video)
          .map((f, index) => ({
            path: f.path || f.name,
            name: f.name,
            size: f.length,
            mime_type: f.mime_type,
            is_video: true,
            index,
          }));

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
