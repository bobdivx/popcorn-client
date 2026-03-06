import { serverApi } from '../../../../lib/client/server-api';
import type { MediaDetailPageProps } from '../types';

export interface DownloadTorrentOptions {
  torrent: MediaDetailPageProps['torrent'];
  isExternal: boolean;
}

/**
 * Télécharge directement le fichier .torrent depuis la DB locale
 */
export function handleDownloadTorrent(options: DownloadTorrentOptions): void {
  const { torrent, isExternal } = options;
  const baseUrl = serverApi.getServerUrl();
  
  if (isExternal) {
    // Pour les torrents externes, utiliser l'infoHash depuis la DB locale
    if (torrent.infoHash) {
      // Télécharger depuis la DB locale avec l'infoHash
      window.location.href = `${baseUrl}/api/torrents/${torrent.infoHash}/download`;
    } else {
      console.warn('[downloadTorrent] Aucun infoHash disponible pour le torrent externe');
      alert('Impossible de télécharger le fichier .torrent : infoHash manquant');
    }
  } else {
    window.location.href = `${baseUrl}/api/torrents/${torrent.id}/download`;
  }
}
