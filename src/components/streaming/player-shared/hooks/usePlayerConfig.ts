import { useState, useEffect } from 'preact/hooks';

export interface PlayerConfig {
  defaultQuality: 'auto' | 'highest' | 'lowest' | number;
  autoQuality: boolean;
  defaultSubtitleLanguage: string;
  autoShowSubtitles: boolean;
  subtitleSize: 'small' | 'medium' | 'large';
  subtitleColor: string;
  subtitleBackground: boolean;
  defaultAudioLanguage: string;
  hardwareAcceleration: boolean;
  bufferSize: number;
  maxBufferSize: number;
  autoHideControls: boolean;
  controlsTimeout: number;
  showLogo: boolean;
  autoFullscreen: boolean;
  autoplay: boolean;
  muted: boolean;
  volume: number;
  skipIntroEnabled: boolean;
  nextEpisodeButtonEnabled: boolean;
  introSkipSeconds: number;
  nextEpisodeCountdownSeconds: number;
  streamingMode: 'hls' | 'direct' | 'lucie';
  /** 'contain' = bandes noires pour voir toute l'image, 'cover' = plein écran (recadrage possible). */
  videoFillMode: 'contain' | 'cover';
}

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  defaultQuality: 'auto',
  autoQuality: true,
  defaultSubtitleLanguage: 'none',
  autoShowSubtitles: false,
  subtitleSize: 'medium',
  subtitleColor: '#FFFFFF',
  subtitleBackground: true,
  defaultAudioLanguage: 'auto',
  hardwareAcceleration: true,
  bufferSize: 60,
  maxBufferSize: 120,
  autoHideControls: true,
  controlsTimeout: 3000,
  showLogo: true,
  autoFullscreen: true,
  autoplay: true,
  muted: false,
  volume: 1.0,
  skipIntroEnabled: true,
  nextEpisodeButtonEnabled: true,
  introSkipSeconds: 90,
  nextEpisodeCountdownSeconds: 90,
  streamingMode: 'hls',
  videoFillMode: 'cover',
};

const PLAYER_CONFIG_KEY = 'playerConfig';

/** Par défaut : plein écran sans bandes noires (cover). */
function getDefaultVideoFillMode(): 'contain' | 'cover' {
  return 'cover';
}

function readConfigFromStorage(): PlayerConfig {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PLAYER_CONFIG, videoFillMode: getDefaultVideoFillMode() };
  }
  try {
    const stored = localStorage.getItem(PLAYER_CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const savedFillMode = parsed.videoFillMode;
      const videoFillMode =
        savedFillMode === 'cover' || savedFillMode === 'contain'
          ? savedFillMode
          : getDefaultVideoFillMode();
      return { ...DEFAULT_PLAYER_CONFIG, ...parsed, videoFillMode };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_PLAYER_CONFIG, videoFillMode: getDefaultVideoFillMode() };
}

/** Persiste le format d'image (contain/cover) et notifie les composants qui utilisent usePlayerConfig. */
export function persistVideoFillMode(mode: 'contain' | 'cover'): void {
  if (typeof window === 'undefined') return;
  try {
    const stored = localStorage.getItem(PLAYER_CONFIG_KEY);
    const current = stored ? (JSON.parse(stored) as Record<string, unknown>) : {};
    const merged = { ...DEFAULT_PLAYER_CONFIG, ...current, videoFillMode: mode };
    localStorage.setItem(PLAYER_CONFIG_KEY, JSON.stringify(merged));
    window.dispatchEvent(new CustomEvent('playerConfigChange'));
  } catch {
    // ignore
  }
}

export function usePlayerConfig(): PlayerConfig {
  const [config, setConfig] = useState<PlayerConfig>(readConfigFromStorage);
  useEffect(() => {
    setConfig(readConfigFromStorage());
  }, []);
  useEffect(() => {
    const handler = () => setConfig(readConfigFromStorage());
    window.addEventListener('playerConfigChange', handler);
    return () => window.removeEventListener('playerConfigChange', handler);
  }, []);
  return config;
}
