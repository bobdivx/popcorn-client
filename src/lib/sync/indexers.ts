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

  const toCreate = indexers.filter(
    (indexer) =>
      !existing.some(
        (e: any) =>
          (e?.name || '').toLowerCase() === (indexer.name || '').toLowerCase() &&
          (e?.baseUrl || '') === (indexer.baseUrl || '')
      )
  );

  if (toCreate.length === 0) {
    return { type: 'indexers', success: true, count: 0 };
  }

  onProgress(`Import ${toCreate.length} indexer(s)…`, 0);

  // Créer tous les indexers manquants en parallèle
  const results = await Promise.all(
    toCreate.map((indexer) =>
      serverApi.createIndexer({
        name: indexer.name,
        baseUrl: indexer.baseUrl ?? '',
        apiKey: indexer.apiKey ?? '',
        jackettIndexerName: indexer.jackettIndexerName ?? '',
        isEnabled: indexer.isEnabled !== false,
        isDefault: indexer.isDefault || false,
        priority: indexer.priority || 0,
        indexerTypeId: indexer.indexerTypeId || undefined,
        configJson: indexer.configJson || undefined,
      })
    )
  );

  const firstError = results.find((r) => !r.success);
  if (firstError) {
    return {
      type: 'indexers',
      success: false,
      error: firstError.message || firstError.error || 'Erreur import indexer',
      count: results.filter((r) => r.success).length,
    };
  }

  return { type: 'indexers', success: true, count: toCreate.length };
}
