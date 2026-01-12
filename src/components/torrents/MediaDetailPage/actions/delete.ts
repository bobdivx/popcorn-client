import { clientApi } from '../../../../lib/client/api';
import type { MediaDetailPageProps } from '../types';

export interface DeleteOptions {
  torrent: MediaDetailPageProps['torrent'];
  setIsAvailableLocally: (value: boolean) => void;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  addDebugLog?: (type: 'success' | 'error', message: string, data?: any) => void;
}

/**
 * Supprime un torrent du client backend
 */
export async function handleDeleteMedia(
  infoHash: string,
  options: DeleteOptions
): Promise<void> {
  const { setIsAvailableLocally, addNotification, addDebugLog } = options;

  if (!infoHash) {
    addNotification('error', 'Impossible de supprimer : infoHash manquant');
    return;
  }

  const confirmed = window.confirm(
    'Êtes-vous sûr de vouloir supprimer ce torrent du client backend ?\n\nCette action est irréversible.'
  );

  if (!confirmed) {
    return;
  }

  try {
    await clientApi.removeTorrent(infoHash, true);
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
}
