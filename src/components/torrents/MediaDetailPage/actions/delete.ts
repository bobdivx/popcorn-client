import { clientApi } from '../../../../lib/client/api';
import { serverApi } from '../../../../lib/client/server-api';
import { isTorrentAlreadyGoneError } from '../../../../lib/torrents/isTorrentAlreadyGone';
import type { MediaDetailPageProps } from '../types';

export interface DeleteOptions {
  torrent: MediaDetailPageProps['torrent'];
  setIsAvailableLocally: (value: boolean) => void;
  addNotification: (type: 'success' | 'error' | 'info', message: string) => void;
  addDebugLog?: (type: 'success' | 'error', message: string, data?: any) => void;
  /** Obligatoire : la confirmation UI doit passer par ConfirmModal / Modal. */
  skipConfirm: boolean;
}

/** Média local (bibliothèque) : identifié par un infoHash préfixé "local_". */
export function isLocalMedia(infoHash: string | null | undefined): boolean {
  return Boolean(infoHash?.startsWith('local_'));
}

async function deleteLibraryEntryForInfoHash(
  infoHash: string,
  addDebugLog?: DeleteOptions['addDebugLog']
): Promise<boolean> {
  const hash = (infoHash || '').trim();
  if (!hash) return false;

  try {
    const res = await serverApi.findLocalMediaByInfoHash(hash);
    const item = res?.success ? (res.data as { id?: string; media_id?: string } | null) : null;
    const mediaId = item?.id || item?.media_id;
    if (!mediaId) {
      addDebugLog?.('success', 'Aucune entrée bibliothèque pour cet info_hash (déjà propre)');
      return false;
    }

    const delFile = await serverApi.deleteLibraryMediaFile(String(mediaId));
    if (delFile.success) {
      addDebugLog?.('success', 'Fichier bibliothèque + entrée DB supprimés', { mediaId });
      return true;
    }

    // Fichier peut-être déjà parti via removeTorrent(deleteFiles) : nettoyer au moins la DB.
    const delDb = await serverApi.deleteLibraryMedia(String(mediaId));
    if (delDb.success) {
      addDebugLog?.('success', 'Entrée bibliothèque supprimée (fichier déjà absent)', { mediaId });
      return true;
    }

    addDebugLog?.('error', 'Échec nettoyage bibliothèque', {
      mediaId,
      fileError: delFile.error || delFile.message,
      dbError: delDb.error || delDb.message,
    });
    return false;
  } catch (e) {
    addDebugLog?.('error', 'Erreur nettoyage bibliothèque', e);
    return false;
  }
}

/**
 * Supprime un torrent du client backend + le fichier bibliothèque associé.
 * Tolère « no such torrent in db » (session librqbit perdue) et continue le nettoyage disque/DB.
 * La confirmation doit être faite côté UI (ConfirmModal) avant l'appel.
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

  if (skipConfirm !== true) {
    console.warn(
      '[handleDeleteMedia] Appel sans confirmation UI (skipConfirm). Suppression annulée.'
    );
    addNotification('error', 'Confirmation requise avant suppression');
    return;
  }

  const isLocal = isLocalMedia(infoHash);
  let clientOk = false;
  let clientGone = false;
  let clientError: unknown = null;

  try {
    await clientApi.removeTorrent(infoHash, true);
    clientOk = true;
  } catch (error) {
    if (isTorrentAlreadyGoneError(error)) {
      clientGone = true;
      addDebugLog?.(
        'success',
        'Torrent déjà absent du client torrent — poursuite nettoyage bibliothèque'
      );
    } else {
      clientError = error;
      console.error('Erreur removeTorrent (on continue le nettoyage bibliothèque):', error);
      addDebugLog?.('error', 'Erreur removeTorrent', error);
    }
  }

  const libraryOk = await deleteLibraryEntryForInfoHash(infoHash, addDebugLog);

  if (clientOk || clientGone || libraryOk) {
    setIsAvailableLocally(false);
    addNotification(
      'success',
      isLocal ? 'Média local supprimé avec succès' : 'Torrent / fichier supprimé avec succès'
    );
    if (addDebugLog) {
      addDebugLog('success', isLocal ? 'Média local supprimé' : 'Torrent / fichier supprimé', {
        clientOk,
        clientGone,
        libraryOk,
      });
    }
    return;
  }

  const msg =
    clientError instanceof Error
      ? clientError.message
      : 'Impossible de supprimer le torrent ni le fichier bibliothèque';
  addNotification('error', `Erreur lors de la suppression : ${msg}`);
  if (addDebugLog) {
    addDebugLog('error', 'Erreur lors de la suppression du torrent', clientError);
  }
}
