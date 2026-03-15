/**
 * Applique les demandes de médias cloud → backend.
 * Utilisé à l'import cloud (runAllFromCloud).
 */

import type { SyncResult } from './types.js';
import { getCloudMediaRequests } from '../api/popcorn-web.js';
import { serverApi } from '../client/server-api.js';

export async function applyMediaRequestsFromCloud(onProgress?: (msg: string) => void): Promise<SyncResult> {
  try {
    const requests = await getCloudMediaRequests();
    if (!requests || requests.length === 0) {
      onProgress?.('Aucune demande de média à importer');
      return { success: true, type: 'mediaRequests', message: 'Aucune demande' };
    }

    onProgress?.(`Import de ${requests.length} demande(s) de média…`);
    const existing = await serverApi.listMediaRequests({ limit: 1000 });
    const existingKeys = new Set(
      (existing.data ?? []).map((r) => `${r.tmdb_id}:${r.media_type}`)
    );

    const toCreate = requests.filter((r) => !existingKeys.has(`${r.tmdb_id}:${r.media_type}`));
    if (toCreate.length === 0) {
      return { success: true, type: 'mediaRequests', message: 'Aucune nouvelle demande' };
    }

    // Créer toutes les demandes manquantes en parallèle
    const results = await Promise.all(
      toCreate.map((r) => {
        let seasonNumbers: number[] | undefined;
        if (r.season_numbers && r.season_numbers.trim()) {
          try { seasonNumbers = JSON.parse(r.season_numbers) as number[]; } catch { /* ignore */ }
        }
        return serverApi.createMediaRequest({
          tmdb_id: r.tmdb_id,
          media_type: r.media_type,
          season_numbers: seasonNumbers,
        });
      })
    );

    const created = results.filter((r) => r.success && r.data).length;
    onProgress?.(`Demandes de média : ${created} créée(s)`);
    return {
      success: true,
      type: 'mediaRequests',
      message: `${created} demande(s) importée(s)`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur import demandes';
    return { success: false, type: 'mediaRequests', error: msg };
  }
}
