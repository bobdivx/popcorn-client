/**
 * Configuration d'affichage de la bibliothèque (Films/Séries)
 * Fusionne cloud (UserConfig) et localStorage. Vide = tout afficher.
 */

import { PreferencesManager } from '../client/storage';
import { getUserConfig, saveUserConfigMerge } from '../api/popcorn-web';
import { TokenManager } from '../client/storage';
import type { UserConfig } from '../api/popcorn-web';

export interface LibraryDisplayConfig {
  showZeroSeedTorrents: boolean;
  torrentsInitialLimit: number;
  torrentsLoadMoreLimit: number;
  torrentsRecentLimit: number;
  /** Langues acceptées. Vide = toutes */
  mediaLanguages: string[];
  /** Qualité minimale. Vide = toutes */
  minQuality: string;
}

const DEFAULTS: LibraryDisplayConfig = {
  showZeroSeedTorrents: true,
  torrentsInitialLimit: 250,
  torrentsLoadMoreLimit: 100,
  torrentsRecentLimit: 50,
  mediaLanguages: [],
  minQuality: '',
};

/**
 * Récupère la config effective (cloud prioritaire si connecté, sinon local)
 * Vide / non défini = tout afficher
 */
export function getLibraryDisplayConfig(): LibraryDisplayConfig {
  const local = PreferencesManager.getPreferences();
  return {
    showZeroSeedTorrents: local.showZeroSeedTorrents ?? DEFAULTS.showZeroSeedTorrents,
    torrentsInitialLimit: local.torrentsInitialLimit ?? DEFAULTS.torrentsInitialLimit,
    torrentsLoadMoreLimit: local.torrentsLoadMoreLimit ?? DEFAULTS.torrentsLoadMoreLimit,
    torrentsRecentLimit: local.torrentsRecentLimit ?? DEFAULTS.torrentsRecentLimit,
    mediaLanguages: Array.isArray(local.mediaLanguages) ? local.mediaLanguages : DEFAULTS.mediaLanguages,
    minQuality: local.minQuality ?? DEFAULTS.minQuality,
  };
}

/**
 * Charge la config depuis le cloud et merge avec local
 */
export async function loadLibraryDisplayFromCloud(): Promise<LibraryDisplayConfig> {
  const local = PreferencesManager.getPreferences();
  const token = TokenManager.getCloudAccessToken();
  if (!token) {
    return getLibraryDisplayConfig();
  }
  try {
    const cloud = await getUserConfig(token);
    const lib = cloud?.syncSettings?.libraryDisplay;
    if (lib) {
      const merged = {
        showZeroSeedTorrents: lib.showZeroSeedTorrents ?? local.showZeroSeedTorrents ?? DEFAULTS.showZeroSeedTorrents,
        torrentsInitialLimit: lib.torrentsInitialLimit ?? local.torrentsInitialLimit ?? DEFAULTS.torrentsInitialLimit,
        torrentsLoadMoreLimit: lib.torrentsLoadMoreLimit ?? local.torrentsLoadMoreLimit ?? DEFAULTS.torrentsLoadMoreLimit,
        torrentsRecentLimit: lib.torrentsRecentLimit ?? local.torrentsRecentLimit ?? DEFAULTS.torrentsRecentLimit,
        mediaLanguages: Array.isArray(lib.mediaLanguages) && lib.mediaLanguages.length > 0
          ? lib.mediaLanguages
          : (local.mediaLanguages ?? DEFAULTS.mediaLanguages),
        minQuality: lib.minQuality ?? local.minQuality ?? DEFAULTS.minQuality,
      };
      PreferencesManager.updatePreferences(merged);
      return merged;
    }
  } catch {
    // Ignorer erreur réseau
  }
  return getLibraryDisplayConfig();
}

/**
 * Sauvegarde la config (local + cloud si connecté)
 */
export async function saveLibraryDisplayConfig(config: Partial<LibraryDisplayConfig>): Promise<void> {
  const current = getLibraryDisplayConfig();
  const merged = { ...current, ...config };
  PreferencesManager.updatePreferences(merged);

  const token = TokenManager.getCloudAccessToken();
  if (token) {
    try {
      const cloud = await getUserConfig(token);
      const syncSettings = {
        ...cloud?.syncSettings,
        libraryDisplay: {
          ...cloud?.syncSettings?.libraryDisplay,
          showZeroSeedTorrents: merged.showZeroSeedTorrents,
          torrentsInitialLimit: merged.torrentsInitialLimit,
          torrentsLoadMoreLimit: merged.torrentsLoadMoreLimit,
          torrentsRecentLimit: merged.torrentsRecentLimit,
          mediaLanguages: merged.mediaLanguages.length > 0 ? merged.mediaLanguages : undefined,
          minQuality: merged.minQuality || undefined,
        },
      };
      await saveUserConfigMerge({ syncSettings }, token);
    } catch {
      // Ne pas bloquer si cloud indisponible
    }
  }
}
