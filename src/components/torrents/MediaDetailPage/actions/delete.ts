import { clientApi } from '../../../../lib/client/api';
import type { MediaDetailPageProps } from '../types';

export interface DeleteOptions {
  torrent: MediaDetailPageProps['torrent'];
  setIsAvailableLocally: (value: boolean) => void;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  addDebugLog?: (type: 'success' | 'error', message: string, data?: any) => void;
  /** Si true, ne pas afficher de boîte de confirmation (la confirmation a été faite via une modal). */
  skipConfirm?: boolean;
}

/** Média local (bibliothèque) : identifié par un infoHash préfixé "local_". */
export function isLocalMedia(infoHash: string | null | undefined): boolean {
  return Boolean(infoHash?.startsWith('local_'));
}

/**
 * Supprime un torrent du client backend
 */
export async function handleDeleteMedia(
  infoHash: string,
  options: DeleteOptions
): Promise<void> {
  const { setIsAvailableLocally, addNotification, addDebugLog, skipConfirm } = options;

  if (!infoHash) {
    addNotification('error', 'Impossible de supprimer : infoHash manquant');
    return;
  }

  const isLocal = isLocalMedia(infoHash);
  if (!skipConfirm) {
    const confirmed = window.confirm(
      isLocal
        ? 'Êtes-vous sûr de vouloir supprimer ce média local ?\n\nLe fichier sera supprimé de votre disque. Cette action est irréversible.'
        : 'Êtes-vous sûr de vouloir supprimer ce torrent du client backend ?\n\nCette action est irréversible.'
    );
    if (!confirmed) return;
  }

  try {
    await clientApi.removeTorrent(infoHash, true);
    setIsAvailableLocally(false);
    addNotification('success', isLocal ? 'Média local supprimé avec succès' : 'Torrent supprimé avec succès');
    if (addDebugLog) {
      addDebugLog('success', isLocal ? '🗑️ Média local supprimé' : '🗑️ Torrent supprimé');
    }
  } catch (error) {
    console.error('Erreur lors de la suppression du torrent:', error);
    addNotification('error', `Erreur lors de la suppression : ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    if (addDebugLog) {
      addDebugLog('error', '❌ Erreur lors de la suppression du torrent', error);
    }
  }
}
