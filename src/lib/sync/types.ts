/**
 * Types partagés pour la synchronisation instance ↔ cloud.
 * Chaque module (indexers, tmdb, categories, etc.) applique les données cloud vers le backend/local.
 */

import type { UserConfig } from '../api/popcorn-web.js';

export type SyncType = 'indexers' | 'tmdb' | 'categories' | 'downloadLocation' | 'syncSettings' | 'language' | 'playbackSettings';

export interface SyncResult {
  type: SyncType;
  success: boolean;
  message?: string;
  error?: string;
  /** Nombre d'éléments traités (ex. nombre d'indexers créés) */
  count?: number;
}

export type SyncProgressCallback = (message: string, doneIncrement?: number) => void;

/** Configuration cloud à appliquer (sous-ensemble de UserConfig par type) */
export type SyncInput = UserConfig;
