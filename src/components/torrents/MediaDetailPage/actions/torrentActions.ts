import { webtorrentClient } from '../../../../lib/torrent/webtorrent-client';
import { serverApi } from '../../../../lib/client/server-api';
import type { MediaDetailPageProps } from '../types';

interface TorrentActionsOptions {
  torrent: MediaDetailPageProps['torrent'];
  isExternal: boolean;
  setDownloadingToClient: (value: boolean) => void;
  setMagnetCopied: (value: boolean) => void;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
}

export function createTorrentActions({
  torrent,
  isExternal,
  setDownloadingToClient,
  setMagnetCopied,
  addNotification,
}: TorrentActionsOptions) {
  const handleDownload = async () => {
    setDownloadingToClient(true);

    try {
      const baseUrl = serverApi.getServerUrl();
      const token = serverApi.getAccessToken();
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

      if (isExternal) {
        // Pour les torrents externes, utiliser le magnet link si disponible
        const magnetUri = torrent._externalMagnetUri || 
          (torrent._externalLink && torrent._externalLink.startsWith('magnet:') 
            ? torrent._externalLink 
            : null);

        if (magnetUri) {
          await webtorrentClient.addMagnetLink(magnetUri, torrent.name);
          addNotification('success', 'Torrent ajouté au client avec succès !');
          window.dispatchEvent(new CustomEvent('torrentAdded'));
          return;
        }

        // Si pas de magnet, essayer de télécharger via l'API backend
        if (torrent._externalLink) {
          const downloadUrl = `${baseUrl}/api/torrents/external/download?url=${encodeURIComponent(torrent._externalLink)}&torrentName=${encodeURIComponent(torrent.name)}`;
          const response = await fetch(downloadUrl, { headers });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            if (errorData.isMagnet && errorData.magnetUri) {
              await webtorrentClient.addMagnetLink(errorData.magnetUri, torrent.name);
              addNotification('success', 'Torrent ajouté au client avec succès !');
              window.dispatchEvent(new CustomEvent('torrentAdded'));
              return;
            }
            throw new Error(errorData.error || 'Erreur lors du téléchargement');
          }

          const blob = await response.blob();
          const file = new File([blob], `${torrent.name}.torrent`, { type: 'application/x-bittorrent' });
          await webtorrentClient.addTorrentFile(file);
          addNotification('success', 'Torrent ajouté au client avec succès !');
          window.dispatchEvent(new CustomEvent('torrentAdded'));
          return;
        }

        throw new Error('Aucun lien de téléchargement disponible pour ce torrent externe');
      } else if (torrent.infoHash) {
        // Pour les torrents locaux, télécharger depuis l'API backend
        const response = await fetch(`${baseUrl}/api/torrents/${torrent.id}/download`, { headers });
        if (!response.ok) {
          throw new Error(`Impossible de télécharger le fichier torrent (${response.status})`);
        }
        const blob = await response.blob();
        const file = new File([blob], `${torrent.name}.torrent`, { type: 'application/x-bittorrent' });
        await webtorrentClient.addTorrentFile(file);
        addNotification('success', 'Torrent ajouté au client avec succès !');
        window.dispatchEvent(new CustomEvent('torrentAdded'));
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
  };

  const handleDownloadTorrent = () => {
    const baseUrl = serverApi.getServerUrl();
    if (isExternal) {
      if (torrent._externalLink) {
        const downloadUrl = `${baseUrl}/api/torrents/external/download?url=${encodeURIComponent(torrent._externalLink)}&torrentName=${encodeURIComponent(torrent.name)}`;
        window.location.href = downloadUrl;
      }
    } else {
      window.location.href = `${baseUrl}/api/torrents/${torrent.id}/download`;
    }
  };

  const handleCopyMagnet = async () => {
    let magnetUri = torrent._externalMagnetUri || null;

    if (!magnetUri && torrent._externalLink && torrent._externalLink.startsWith('magnet:')) {
      magnetUri = torrent._externalLink;
    }

    if (magnetUri) {
      try {
        await navigator.clipboard.writeText(magnetUri);
        setMagnetCopied(true);
        setTimeout(() => setMagnetCopied(false), 2000);
      } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = magnetUri;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          setMagnetCopied(true);
          setTimeout(() => setMagnetCopied(false), 2000);
        } catch (e) {
          alert('Impossible de copier le lien magnet. Lien: ' + magnetUri);
        }
        document.body.removeChild(textarea);
      }
    } else {
      alert('Aucun lien magnet disponible pour ce torrent');
    }
  };

  const handleDeleteMedia = async (
    infoHash: string,
    setIsAvailableLocally: (value: boolean) => void,
    addDebugLog?: (type: 'success' | 'error', message: string, data?: any) => void
  ) => {
    if (!infoHash) {
      addNotification('error', 'Impossible de supprimer : infoHash manquant');
      return;
    }

    const confirmed = window.confirm(
      'Êtes-vous sûr de vouloir supprimer ce torrent du client WebTorrent ?\n\nCette action est irréversible.'
    );

    if (!confirmed) {
      return;
    }

    try {
      await webtorrentClient.removeTorrent(infoHash, true);
      setIsAvailableLocally(false);
      addNotification('success', 'Torrent supprimé avec succès');
      if (addDebugLog) {
        addDebugLog('success', '🗑️ Torrent supprimé');
      }
    } catch (error) {
      console.error('Erreur lors de la suppression du torrent:', error);
      addNotification('error', `Erreur lors de la suppression : ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
      if (addDebugLog) {
        addDebugLog('error', '❌ Erreur lors de la suppression du torrent', error);
      }
    }
  };

  return {
    handleDownload,
    handleDownloadTorrent,
    handleCopyMagnet,
    handleDeleteMedia,
  };
}
