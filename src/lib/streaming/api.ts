import { webtorrentClient } from '../torrent/webtorrent-client';
import type { TorrentFile } from '../../components/torrents/MediaDetailPage/hooks/useVideoFiles';

/**
 * Récupère la liste de tous les fichiers vidéo depuis WebTorrent
 */
export async function getLocalFiles(): Promise<TorrentFile[]> {
  try {
    // Récupérer tous les torrents depuis WebTorrent
    const torrents = await webtorrentClient.listTorrents();
    const allFiles: TorrentFile[] = [];

    for (const torrent of torrents) {
      const files = webtorrentClient.getTorrentFiles(torrent.info_hash);
      for (const file of files) {
        if (file.is_video) {
          allFiles.push({
            path: file.path || file.name,
            name: file.name,
            size: file.length,
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
 * Construit une Blob URL pour un fichier du torrent depuis WebTorrent
 */
export async function getLocalHlsPlaylistUrl(filePath: string, infoHash: string, fileIndex: number): Promise<string | null> {
  try {
    const blobUrl = await webtorrentClient.createBlobUrl(infoHash, fileIndex);
    return blobUrl;
  } catch (error) {
    console.error('Erreur lors de la création de la Blob URL:', error);
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
  // Pas de gestion de cache côté serveur avec WebTorrent
  // Les fichiers sont en mémoire
}

/**
 * Désenregistre une vidéo (pour compatibilité)
 */
export async function unregisterActiveVideo(fileId: string): Promise<void> {
  // Pas de nettoyage nécessaire avec WebTorrent
}
