/**
 * Synchronisation des utilisateurs locaux (invités) de popcorn-web vers le serveur Popcornn.
 *
 * Un invité qui a accepté son invitation existe d'abord dans popcorn-web (Turso). Pour pouvoir
 * se connecter au serveur du propriétaire, il doit aussi exister dans la base du serveur
 * (`local_users`), avec le MÊME id : c'est la clé du partage amis (`friend_access`) et de
 * l'identité de session (`X-User-ID`). Appelé par le compte principal (admin du serveur).
 */

import { getLocalUsers, getLocalUserForSync } from '../api/popcorn-web';
import { serverApi } from './server-api';
import { TokenManager } from './storage';

export interface LocalUsersSyncResult {
  synced: number;
  failed: number;
}

let inFlight: Promise<LocalUsersSyncResult> | null = null;

async function runSync(): Promise<LocalUsersSyncResult> {
  const result: LocalUsersSyncResult = { synced: 0, failed: 0 };
  if (!TokenManager.getCloudAccessToken()) return result;
  const cloudUserId = TokenManager.getUser()?.id;
  if (!cloudUserId) return result;

  const localUsers = await getLocalUsers();
  if (!localUsers || localUsers.length === 0) return result;

  for (const localUser of localUsers) {
    if (!localUser.isActive) continue;
    try {
      const existing = await serverApi.getLocalUser(localUser.id);
      if (existing.success && existing.data) continue;

      const syncResponse = await getLocalUserForSync(localUser.id);
      if (!syncResponse.success || !syncResponse.data) {
        result.failed++;
        continue;
      }
      const userData = syncResponse.data;
      const created = await serverApi.createLocalUser({
        id: userData.id || localUser.id,
        cloud_account_id: cloudUserId,
        email: userData.email,
        password_hash: userData.password_hash,
        display_name: userData.display_name || undefined,
      });
      if (created.success) result.synced++;
      else result.failed++;
    } catch {
      result.failed++;
    }
  }
  return result;
}

/**
 * Crée sur le serveur les invités activés qui n'y sont pas encore (idempotent, une seule
 * exécution à la fois). Ne lève jamais d'erreur.
 */
export function syncLocalUsersToBackend(): Promise<LocalUsersSyncResult> {
  if (typeof window === 'undefined') return Promise.resolve({ synced: 0, failed: 0 });
  if (!inFlight) {
    inFlight = runSync()
      .catch(() => ({ synced: 0, failed: 0 }))
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** Supprime aussi l'invité du serveur (best effort) après sa suppression dans popcorn-web. */
export async function removeLocalUserFromBackend(userId: string): Promise<void> {
  if (typeof window === 'undefined' || !userId) return;
  try {
    await serverApi.deleteLocalUser(userId);
  } catch {
    /* ignore : l'invité n'existait peut-être pas encore sur le serveur */
  }
}
