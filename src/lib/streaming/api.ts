import { clientApi } from '../client/api';
import { serverApi } from '../client/server-api';
import type { TorrentFile } from '../../components/torrents/MediaDetailPage/hooks/useVideoFiles';

/**
 * Récupère la liste de tous les fichiers vidéo depuis le backend
 */
export async function getLocalFiles(): Promise<TorrentFile[]> {
  try {
    // Récupérer tous les torrents depuis le backend
    const torrents = await clientApi.listTorrents();
    const allFiles: TorrentFile[] = [];

    for (const torrent of torrents) {
      const files = await clientApi.getTorrentFiles(torrent.info_hash);
      for (const file of files) {
        if (file.is_video) {
          allFiles.push({
            path: file.path,
            name: file.path.split('/').pop() || file.path,
            size: file.size,
            mime_type: file.mime_type,
            is_video: true,
          });
        }
      }
    }

    return allFiles;
  } catch (error) {
    console.error('Erreur lors de la récupération des fichiers:', error);
    return [];
  }
}

/**
 * Construit une URL HLS pour un fichier du torrent depuis le backend
 */
export async function getLocalHlsPlaylistUrl(filePath: string, infoHash: string, fileIndex: number): Promise<string | null> {
  try {
    const baseUrl = serverApi.getServerUrl();
    // Le backend attend /api/local/stream/{filePath}/playlist.m3u8
    const encodedPath = encodeURIComponent(filePath);
    const hlsUrl = `${baseUrl}/api/local/stream/${encodedPath}/playlist.m3u8`;
    return hlsUrl;
  } catch (error) {
    console.error('Erreur lors de la création de l\'URL HLS:', error);
    return null;
  }
}

/**
 * Extrait le file_id depuis une URL (pour compatibilité)
 */
export function extractFileIdFromHlsUrl(hlsUrl: string): string | null {
  try {
    const match = hlsUrl.match(/blob:.*/);
    if (match) {
      return match[0];
    }
    return null;
  } catch (e) {
    return null;
  }
}

/**
 * Enregistre une vidéo comme active (pour compatibilité)
 */
export async function registerActiveVideo(fileId: string): Promise<void> {
  // Le backend gère le cache HLS automatiquement
}

/**
 * Désenregistre une vidéo (pour compatibilité)
 */
export async function unregisterActiveVideo(fileId: string): Promise<void> {
  // Le backend gère le nettoyage du cache HLS automatiquement
}
