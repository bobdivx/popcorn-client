import { useEffect, useState } from 'preact/hooks';
import type { TorrentFile } from '../../../torrents/MediaDetailPage/hooks/useVideoFiles';
import { buildStreamUrl } from '../utils/buildStreamUrl';

const STORAGE_INTRO_ALWAYS_SHOW = 'popcorn_intro_always_show';
const STORAGE_INTRO_SKIPPED = 'popcorn_intro_skipped';

interface UseStreamSourceInput {
  selectedFile?: TorrentFile;
  infoHash: string;
  directStreamUrl?: string | null;
  baseUrl: string;
  isDirectMode: boolean;
}

export function useStreamSource({
  selectedFile,
  infoHash,
  directStreamUrl,
  baseUrl,
  isDirectMode,
}: UseStreamSourceInput) {
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [hlsFilePath, setHlsFilePath] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    // Mode démo : URL directe du MP4 (pas de HLS)
    if (directStreamUrl) {
      setStreamUrl(directStreamUrl);
      setHlsFilePath('direct');
      setShowIntro(false);
      setIsLoading(false);
      return;
    }

    if (!selectedFile) {
      return;
    }

    if (!infoHash || infoHash.trim().length === 0) {
      setIsLoading(false);
      return;
    }

    const loadStreamUrl = async () => {
      try {
        setIsLoading(true);
        const filePath = selectedFile.path || selectedFile.name;

        const { streamUrl, normalizedPath, encodedPath, pathForUrl } = buildStreamUrl({
          baseUrl,
          infoHash,
          filePath,
          fileName: selectedFile.name,
          isDirectMode,
        });

        console.log('[VideoPlayerWrapper] Construction URL stream:', {
          filePath,
          normalizedPath,
          name: selectedFile.name,
          path: selectedFile.path,
          infoHash: infoHash.substring(0, 12) + '...',
          baseUrl,
          mode: isDirectMode ? 'direct' : 'hls',
        });

        console.log('[VideoPlayerWrapper] URL stream construite:', {
          encodedPath,
          streamUrl,
          normalizedPath,
          pathForUrl,
          infoHash: infoHash.substring(0, 12) + '...',
        });

        setStreamUrl(streamUrl);
        setHlsFilePath(isDirectMode ? 'direct' : normalizedPath);
        setIsLoading(false);

        if (!isDirectMode) {
          try {
            const alwaysShow = localStorage.getItem(STORAGE_INTRO_ALWAYS_SHOW) === '1';
            const introSkipped = localStorage.getItem(STORAGE_INTRO_SKIPPED) === '1';
            setShowIntro(alwaysShow || !introSkipped);
          } catch (e) {
            console.warn('[VideoPlayerWrapper] Erreur localStorage, affichage intro par défaut:', e);
            setShowIntro(true);
          }
        } else {
          setShowIntro(false);
        }
      } catch (error) {
        console.error('[VideoPlayerWrapper] Erreur lors de la création de l\'URL de stream:', error);
        setIsLoading(false);
      }
    };

    loadStreamUrl();
  }, [selectedFile, infoHash, directStreamUrl, baseUrl, isDirectMode]);

  return {
    streamUrl,
    hlsFilePath,
    isLoading,
    setIsLoading,
    showIntro,
    setShowIntro,
  };
}
