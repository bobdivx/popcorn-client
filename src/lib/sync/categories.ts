/**
 * Sync cloud → instance : catégories d'indexers.
 * À appeler après les indexers (pour avoir les id backend). Les clés cloud peuvent être id ou name.
 */

import { serverApi } from '../client/server-api.js';
import type { UserConfig } from '../api/popcorn-web.js';
import type { SyncResult } from './types.js';

export async function applyCategoriesFromCloud(
  config: Pick<UserConfig, 'indexers' | 'indexerCategories'>,
  onProgress: (message: string) => void
): Promise<SyncResult> {
  const { indexerCategories, indexers } = config;
  if (!indexerCategories || Object.keys(indexerCategories).length === 0) {
    return { type: 'categories', success: true, count: 0 };
  }

  // Récupérer la liste des indexers backend pour faire correspondre id/name
  let backendIndexers: { id: string; name?: string }[] = [];
  try {
    const listRes = await serverApi.getIndexers();
    if (listRes.success && Array.isArray(listRes.data)) {
      backendIndexers = (listRes.data as any[]).map((e) => ({ id: e.id, name: e.name }));
    }
  } catch {
    return { type: 'categories', success: true, count: 0 };
  }

  let applied = 0;
  for (const idx of backendIndexers) {
    const categories =
      indexerCategories[idx.id] ||
      (idx.name ? indexerCategories[idx.name] : undefined);
    if (!categories) continue;
    onProgress(`Import catégories pour ${idx.name || idx.id}…`);
    const res = await serverApi.updateIndexerCategories(idx.id, categories);
    if (res.success) applied++;
  }

  return { type: 'categories', success: true, count: applied };
}
