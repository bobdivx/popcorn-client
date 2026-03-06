/**
 * Sync cloud → instance : paramètres de lecture (localStorage playerConfig).
 */

import type { UserConfig } from '../api/popcorn-web.js';
import type { SyncResult } from './types.js';
import { DEFAULT_PLAYER_CONFIG } from '../../components/streaming/hls-player/hooks/usePlayerConfig';

const PLAYER_CONFIG_KEY = 'playerConfig';

export async function applyPlaybackSettingsFromCloud(
  config: Pick<UserConfig, 'playbackSettings'>,
  _onProgress?: (message: string) => void
): Promise<SyncResult> {
  const ps = config.playbackSettings;
  if (!ps || typeof ps !== 'object') return { type: 'playbackSettings', success: true };

  if (typeof window === 'undefined') return { type: 'playbackSettings', success: true };

  try {
    const stored = localStorage.getItem(PLAYER_CONFIG_KEY);
    const current = stored ? (JSON.parse(stored) as Record<string, unknown>) : {};
    const merged = { ...DEFAULT_PLAYER_CONFIG, ...current };

    if (typeof ps.skipIntroEnabled === 'boolean') merged.skipIntroEnabled = ps.skipIntroEnabled;
    if (typeof ps.nextEpisodeButtonEnabled === 'boolean') merged.nextEpisodeButtonEnabled = ps.nextEpisodeButtonEnabled;
    if (typeof ps.introSkipSeconds === 'number') merged.introSkipSeconds = ps.introSkipSeconds;
    if (typeof ps.nextEpisodeCountdownSeconds === 'number') merged.nextEpisodeCountdownSeconds = ps.nextEpisodeCountdownSeconds;
    if (ps.streamingMode === 'hls' || ps.streamingMode === 'direct' || ps.streamingMode === 'lucie') merged.streamingMode = ps.streamingMode;

    localStorage.setItem(PLAYER_CONFIG_KEY, JSON.stringify(merged));
    return { type: 'playbackSettings', success: true };
  } catch {
    return { type: 'playbackSettings', success: false, error: 'Erreur import paramètres de lecture' };
  }
}
