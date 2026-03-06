/**
 * Sync cloud → instance : indexers.
 * Applique les indexers de la config cloud vers le backend (évite les doublons).
 */

import { serverApi } from '../client/server-api.js';
import type { UserConfig } from '../api/popcorn-web.js';
import type { SyncResult, SyncProgressCallback } from './types.js';

export async function applyIndexersFromCloud(
  config: Pick<UserConfig, 'indexers'>,
  onProgress: SyncProgressCallback
): Promise<SyncResult> {
  const indexers = config.indexers;
  if (!indexers?.length) {
    return { type: 'indexers', success: true, count: 0 };
  }

  let existing: any[] = [];
  try {
    const listRes = await serverApi.getIndexers();
    if (listRes.success && Array.isArray(listRes.data)) existing = listRes.data as any[];
  } catch {
    // ignore
  }

  let created = 0;
  for (const indexer of indexers) {
    onProgress(`Import indexer: ${indexer.name}…`, 1);

    const alreadyExists = existing.some(
      (e: any) =>
        (e?.name || '').toLowerCase() === (indexer.name || '').toLowerCase() &&
        (e?.baseUrl || '') === (indexer.baseUrl || '')
    );
    if (!alreadyExists) {
      const res = await serverApi.createIndexer({
        name: indexer.name,
        baseUrl: indexer.baseUrl ?? '',
        apiKey: indexer.apiKey ?? '',
        jackettIndexerName: indexer.jackettIndexerName ?? '',
        isEnabled: indexer.isEnabled !== false,
        isDefault: indexer.isDefault || false,
        priority: indexer.priority || 0,
        indexerTypeId: indexer.indexerTypeId || undefined,
        configJson: indexer.configJson || undefined,
      });
      if (!res.success) {
        return {
          type: 'indexers',
          success: false,
          error: res.message || res.error || `Erreur import indexer: ${indexer.name}`,
          count: created,
        };
      }
      created++;
    }
  }

  return { type: 'indexers', success: true, count: indexers.length };
}
