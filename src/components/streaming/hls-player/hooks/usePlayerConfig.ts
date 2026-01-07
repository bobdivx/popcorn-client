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
}

const DEFAULT_CONFIG: PlayerConfig = {
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
  autoFullscreen: false,
  autoplay: true,
  muted: false,
  volume: 1.0,
};

export function usePlayerConfig(): PlayerConfig {
  const [config, setConfig] = useState<PlayerConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    const savedConfig = localStorage.getItem('playerConfig');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig({ ...DEFAULT_CONFIG, ...parsed });
      } catch (err) {
        console.warn('[usePlayerConfig] Erreur lors du chargement de la configuration:', err);
      }
    }
  }, []);

  return config;
}
