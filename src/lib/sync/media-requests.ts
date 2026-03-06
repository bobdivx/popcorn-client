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
    let created = 0;

    for (const r of requests) {
      const key = `${r.tmdb_id}:${r.media_type}`;
      if (existingKeys.has(key)) continue;
      let seasonNumbers: number[] | undefined;
      if (r.season_numbers && r.season_numbers.trim()) {
        try {
          seasonNumbers = JSON.parse(r.season_numbers) as number[];
        } catch {
          // ignore
        }
      }
      const res = await serverApi.createMediaRequest({
        tmdb_id: r.tmdb_id,
        media_type: r.media_type,
        season_numbers: seasonNumbers,
      });
      if (res.success && res.data) {
        existingKeys.add(key);
        created++;
      }
    }

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
