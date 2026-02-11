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
  /** Série : saut du générique (bouton + option auto) */
  skipIntroEnabled: boolean;
  /** Série : bouton « Épisode suivant » peu avant la fin */
  nextEpisodeButtonEnabled: boolean;
  /** Durée du générique en secondes (affichage bouton + seek) */
  introSkipSeconds: number;
  /** Secondes avant la fin pour afficher le bouton « Épisode suivant » */
  nextEpisodeCountdownSeconds: number;
  /** Système de streaming: HLS (adaptatif) ou direct (range). */
  streamingMode: 'hls' | 'direct';
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
  autoFullscreen: false,
  autoplay: true,
  muted: false,
  volume: 1.0,
  skipIntroEnabled: true,
  nextEpisodeButtonEnabled: true,
  introSkipSeconds: 90,
  nextEpisodeCountdownSeconds: 90,
  streamingMode: 'hls',
};

export function usePlayerConfig(): PlayerConfig {
  const [config, setConfig] = useState<PlayerConfig>(DEFAULT_PLAYER_CONFIG);

  useEffect(() => {
    const savedConfig = localStorage.getItem('playerConfig');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig({ ...DEFAULT_PLAYER_CONFIG, ...parsed });
      } catch (err) {
        console.warn('[usePlayerConfig] Erreur lors du chargement de la configuration:', err);
      }
    }
  }, []);

  return config;
}
