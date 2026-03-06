/**
 * Sync cloud → instance : clé API TMDB.
 * N'envoie jamais une clé masquée au backend.
 */

import { serverApi } from '../client/server-api.js';
import { isTmdbKeyMaskedOrInvalid } from '../utils/tmdb-key.js';
import type { SyncResult } from './types.js';

export async function applyTmdbFromCloud(
  tmdbApiKey: string | null | undefined,
  _onProgress?: (message: string) => void
): Promise<SyncResult> {
  if (!tmdbApiKey?.trim()) {
    return { type: 'tmdb', success: true };
  }

  const cleanedKey = tmdbApiKey.trim().replace(/\s+/g, '');
  if (isTmdbKeyMaskedOrInvalid(tmdbApiKey)) {
    console.warn('[SYNC TMDB] Clé TMDB masquée ou invalide, ignorée');
    return { type: 'tmdb', success: true };
  }

  const res = await serverApi.saveTmdbKey(cleanedKey);
  if (!res.success) {
    console.warn('[SYNC TMDB] Import ignoré:', res.message || res.error);
    return { type: 'tmdb', success: true, message: res.message }; // Ne pas faire échouer l'import global
  }
  return { type: 'tmdb', success: true };
}
