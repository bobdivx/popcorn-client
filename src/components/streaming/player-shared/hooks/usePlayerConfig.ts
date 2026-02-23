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
  videoFillMode: 'contain',
};

export function usePlayerConfig(): PlayerConfig {
  const [config, setConfig] = useState<PlayerConfig>(DEFAULT_PLAYER_CONFIG);
  useEffect(() => {
    const savedConfig = localStorage.getItem('playerConfig');
    if (savedConfig) {
      try {
        setConfig({ ...DEFAULT_PLAYER_CONFIG, ...JSON.parse(savedConfig) });
      } catch (err) {
        console.warn('[usePlayerConfig] Erreur chargement config:', err);
      }
    }
  }, []);
  return config;
}
