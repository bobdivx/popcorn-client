import { useState, useEffect } from 'preact/hooks';
import { useI18n } from '../../lib/i18n';
import { PreferencesManager, TokenManager } from '../../lib/client/storage';
import { saveUserConfigMerge } from '../../lib/api/popcorn-web';
import { SkipForward, ListVideo, Play } from 'lucide-preact';
import { DEFAULT_PLAYER_CONFIG, type PlayerConfig } from '../streaming/hls-player/hooks/usePlayerConfig';

const PLAYER_CONFIG_KEY = 'playerConfig';

function getPlaybackConfig(): Pick<
  PlayerConfig,
  | 'skipIntroEnabled'
  | 'nextEpisodeButtonEnabled'
  | 'introSkipSeconds'
  | 'nextEpisodeCountdownSeconds'
  | 'streamingMode'
> {
  if (typeof window === 'undefined') {
    return {
      skipIntroEnabled: DEFAULT_PLAYER_CONFIG.skipIntroEnabled,
      nextEpisodeButtonEnabled: DEFAULT_PLAYER_CONFIG.nextEpisodeButtonEnabled,
      introSkipSeconds: DEFAULT_PLAYER_CONFIG.introSkipSeconds,
      nextEpisodeCountdownSeconds: DEFAULT_PLAYER_CONFIG.nextEpisodeCountdownSeconds,
      streamingMode: DEFAULT_PLAYER_CONFIG.streamingMode,
    };
  }
  try {
    const stored = localStorage.getItem(PLAYER_CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<PlayerConfig>;
      return {
        skipIntroEnabled: parsed.skipIntroEnabled ?? DEFAULT_PLAYER_CONFIG.skipIntroEnabled,
        nextEpisodeButtonEnabled:
          parsed.nextEpisodeButtonEnabled ?? DEFAULT_PLAYER_CONFIG.nextEpisodeButtonEnabled,
        introSkipSeconds: parsed.introSkipSeconds ?? DEFAULT_PLAYER_CONFIG.introSkipSeconds,
        nextEpisodeCountdownSeconds:
          parsed.nextEpisodeCountdownSeconds ?? DEFAULT_PLAYER_CONFIG.nextEpisodeCountdownSeconds,
        streamingMode:
          parsed.streamingMode === 'direct' || parsed.streamingMode === 'hls'
            ? parsed.streamingMode
            : DEFAULT_PLAYER_CONFIG.streamingMode,
      };
    }
  } catch {
    // ignore
  }
  return {
    skipIntroEnabled: DEFAULT_PLAYER_CONFIG.skipIntroEnabled,
    nextEpisodeButtonEnabled: DEFAULT_PLAYER_CONFIG.nextEpisodeButtonEnabled,
    introSkipSeconds: DEFAULT_PLAYER_CONFIG.introSkipSeconds,
    nextEpisodeCountdownSeconds: DEFAULT_PLAYER_CONFIG.nextEpisodeCountdownSeconds,
    streamingMode: DEFAULT_PLAYER_CONFIG.streamingMode,
  };
}

function savePlaybackToLocalStorage(partial: Partial<PlayerConfig>) {
  if (typeof window === 'undefined') return;
  try {
    const stored = localStorage.getItem(PLAYER_CONFIG_KEY);
    const current = stored ? (JSON.parse(stored) as Record<string, unknown>) : {};
    const merged = { ...DEFAULT_PLAYER_CONFIG, ...current, ...partial };
    localStorage.setItem(PLAYER_CONFIG_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
}

export default function PlaybackSettingsPanel() {
  const { t } = useI18n();
  const [config, setConfig] = useState(getPlaybackConfig);
  const [autoplay, setAutoplay] = useState(() => PreferencesManager.getPreferences().autoplay ?? false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setConfig(getPlaybackConfig());
  }, []);

  const showSaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const savePlaybackSettingsToCloud = (next: ReturnType<typeof getPlaybackConfig>) => {
    const cloudToken = TokenManager.getCloudAccessToken();
    if (!cloudToken) return;
    saveUserConfigMerge(
      {
        playbackSettings: {
          skipIntroEnabled: next.skipIntroEnabled,
          nextEpisodeButtonEnabled: next.nextEpisodeButtonEnabled,
          introSkipSeconds: next.introSkipSeconds,
          nextEpisodeCountdownSeconds: next.nextEpisodeCountdownSeconds,
          streamingMode: next.streamingMode,
        },
      },
      cloudToken
    ).catch(() => {});
  };

  const handleSkipIntroEnabled = (value: boolean) => {
    const next = { ...config, skipIntroEnabled: value };
    setConfig(next);
    savePlaybackToLocalStorage(next);
    savePlaybackSettingsToCloud(next);
    showSaved();
  };

  const handleNextEpisodeButtonEnabled = (value: boolean) => {
    const next = { ...config, nextEpisodeButtonEnabled: value };
    setConfig(next);
    savePlaybackToLocalStorage(next);
    savePlaybackSettingsToCloud(next);
    showSaved();
  };

  const handleIntroSkipSeconds = (value: number) => {
    const clamped = Math.max(30, Math.min(300, value));
    const next = { ...config, introSkipSeconds: clamped };
    setConfig(next);
    savePlaybackToLocalStorage(next);
    savePlaybackSettingsToCloud(next);
    showSaved();
  };

  const handleNextEpisodeCountdownSeconds = (value: number) => {
    const clamped = Math.max(30, Math.min(300, value));
    const next = { ...config, nextEpisodeCountdownSeconds: clamped };
    setConfig(next);
    savePlaybackToLocalStorage(next);
    savePlaybackSettingsToCloud(next);
    showSaved();
  };

  const handleStreamingMode = (value: 'hls' | 'direct') => {
    const next = { ...config, streamingMode: value };
    setConfig(next);
    savePlaybackToLocalStorage(next);
    savePlaybackSettingsToCloud(next);
    showSaved();
  };

  const handleAutoplayChange = (value: boolean) => {
    PreferencesManager.updatePreferences({ autoplay: value });
    setAutoplay(value);
    showSaved();
  };

  return (
    <div className="flex-1 py-4 px-4 sm:px-6 space-y-6 overflow-y-auto scrollbar-visible">
      {saved && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-500/20 text-primary-400 text-sm">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          {t('common.success')}
        </div>
      )}

      {/* Lecture automatique */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
          <Play className="w-5 h-5 text-primary-400" />
          {t('interfaceSettings.autoplay')}
        </h3>
        <p className="text-sm text-gray-400 mb-4">{t('interfaceSettings.autoplayDescription')}</p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={autoplay}
            onChange={(e) => handleAutoplayChange((e.target as HTMLInputElement).checked)}
          />
          <span className="text-white font-medium">{autoplay ? t('common.yes') : t('common.no')}</span>
        </label>
      </section>

      {/* Saut du générique */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
          <SkipForward className="w-5 h-5 text-primary-400" />
          {t('interfaceSettings.skipIntro')}
        </h3>
        <p className="text-sm text-gray-400 mb-4">{t('interfaceSettings.skipIntroDescription')}</p>
        <label className="flex items-center gap-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={config.skipIntroEnabled}
            onChange={(e) => handleSkipIntroEnabled((e.target as HTMLInputElement).checked)}
          />
          <span className="text-white font-medium">{t('interfaceSettings.skipIntroAuto')}</span>
        </label>
        <p className="text-sm text-gray-400 mb-2">{t('interfaceSettings.skipIntroAutoDescription')}</p>
        <div className="flex items-center gap-3 mt-2">
          <label className="text-sm text-gray-400">{t('interfaceSettings.introSkipSeconds')}</label>
          <input
            type="number"
            min={30}
            max={300}
            value={config.introSkipSeconds}
            onChange={(e) => handleIntroSkipSeconds(Number((e.target as HTMLInputElement).value))}
            className="w-24 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
          />
          <span className="text-gray-500 text-sm">s</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">{t('interfaceSettings.introSkipSecondsDescription')}</p>
      </section>

      {/* Mode de streaming */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
          <Play className="w-5 h-5 text-primary-400" />
          {t('interfaceSettings.streamingMode')}
        </h3>
        <p className="text-sm text-gray-400 mb-4">{t('interfaceSettings.streamingModeDescription')}</p>
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="streaming-mode"
              className="radio radio-primary"
              checked={config.streamingMode === 'hls'}
              onChange={() => handleStreamingMode('hls')}
            />
            <span className="text-white font-medium">{t('interfaceSettings.streamingModeHls')}</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="streaming-mode"
              className="radio radio-primary"
              checked={config.streamingMode === 'direct'}
              onChange={() => handleStreamingMode('direct')}
            />
            <span className="text-white font-medium">{t('interfaceSettings.streamingModeDirect')}</span>
          </label>
        </div>
      </section>

      {/* Bouton Épisode suivant */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
          <ListVideo className="w-5 h-5 text-primary-400" />
          {t('interfaceSettings.nextEpisodeButton')}
        </h3>
        <p className="text-sm text-gray-400 mb-4">{t('interfaceSettings.nextEpisodeButtonDescription')}</p>
        <label className="flex items-center gap-3 cursor-pointer mb-4">
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={config.nextEpisodeButtonEnabled}
            onChange={(e) => handleNextEpisodeButtonEnabled((e.target as HTMLInputElement).checked)}
          />
          <span className="text-white font-medium">{t('interfaceSettings.nextEpisodeButton')}</span>
        </label>
        <div className="flex items-center gap-3 mt-2">
          <label className="text-sm text-gray-400">{t('interfaceSettings.nextEpisodeCountdownSeconds')}</label>
          <input
            type="number"
            min={30}
            max={300}
            value={config.nextEpisodeCountdownSeconds}
            onChange={(e) =>
              handleNextEpisodeCountdownSeconds(Number((e.target as HTMLInputElement).value))
            }
            className="w-24 px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
          />
          <span className="text-gray-500 text-sm">s</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">{t('interfaceSettings.nextEpisodeCountdownDescription')}</p>
      </section>
    </div>
  );
}
