/**
 * Sync cloud → instance : emplacement de téléchargement (préférence locale).
 */

import { PreferencesManager } from '../client/storage.js';
import type { SyncResult } from './types.js';

export async function applyDownloadLocationFromCloud(
  downloadLocation: string | null | undefined,
  _onProgress?: (message: string) => void
): Promise<SyncResult> {
  if (!downloadLocation?.trim()) {
    return { type: 'downloadLocation', success: true };
  }
  PreferencesManager.setDownloadLocation(downloadLocation.trim());
  return { type: 'downloadLocation', success: true };
}
