/**
 * Sync cloud → instance : préférence de langue (locale).
 */

import { PreferencesManager } from '../client/storage.js';
import type { SyncResult } from './types.js';

export async function applyLanguageFromCloud(
  language: string | null | undefined,
  _onProgress?: (message: string) => void
): Promise<SyncResult> {
  if (!language || !['fr', 'en'].includes(language)) {
    return { type: 'language', success: true };
  }
  PreferencesManager.updatePreferences({ language: language as 'fr' | 'en' });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('language-changed', { detail: { language } }));
  }
  return { type: 'language', success: true };
}
