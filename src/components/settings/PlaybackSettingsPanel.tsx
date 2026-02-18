import { useState, useEffect } from 'preact/hooks';
import { useI18n } from '../../lib/i18n';
import { PreferencesManager, TokenManager } from '../../lib/client/storage';
import { saveUserConfigMerge } from '../../lib/api/popcorn-web';
import { serverApi } from '../../lib/client/server-api';
import { SkipForward, ListVideo, Play, Download, HardDrive } from 'lucide-preact';
import { DEFAULT_PLAYER_CONFIG, type PlayerConfig } from '../streaming/hls-player/hooks/usePlayerConfig';
import { useSubscriptionMe } from '../torrents/MediaDetailPage/hooks/useSubscriptionMe';

const PLAYER_CONFIG_KEY = 'playerConfig';

type PlaybackConfigStored = Pick<
  PlayerConfig,
  | 'skipIntroEnabled'
  | 'nextEpisodeButtonEnabled'
  | 'introSkipSeconds'
  | 'nextEpisodeCountdownSeconds'
  | 'streamingMode'
  | 'streamingDownloadFull'
>;

function getPlaybackConfig(): PlaybackConfigStored {
  if (typeof window === 'undefined') {
    return {
      skipIntroEnabled: DEFAULT_PLAYER_CONFIG.skipIntroEnabled,
      nextEpisodeButtonEnabled: DEFAULT_PLAYER_CONFIG.nextEpisodeButtonEnabled,
      introSkipSeconds: DEFAULT_PLAYER_CONFIG.introSkipSeconds,
      nextEpisodeCountdownSeconds: DEFAULT_PLAYER_CONFIG.nextEpisodeCountdownSeconds,
      streamingMode: DEFAULT_PLAYER_CONFIG.streamingMode,
      streamingDownloadFull: DEFAULT_PLAYER_CONFIG.streamingDownloadFull ?? false,
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
          parsed.streamingMode === 'direct' || parsed.streamingMode === 'hls' || parsed.streamingMode === 'lucie'
            ? parsed.streamingMode
            : DEFAULT_PLAYER_CONFIG.streamingMode,
        streamingDownloadFull: parsed.streamingDownloadFull === true,
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
    streamingDownloadFull: DEFAULT_PLAYER_CONFIG.streamingDownloadFull ?? false,
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
  const { streamingTorrentActive } = useSubscriptionMe();
  const [config, setConfig] = useState(getPlaybackConfig);
  const [autoplay, setAutoplay] = useState(() => PreferencesManager.getPreferences().autoplay ?? false);
  const [saved, setSaved] = useState(false);
  const [retentionDays, setRetentionDays] = useState<number | null | undefined>(undefined);

  useEffect(() => {
    setConfig(getPlaybackConfig());
  }, []);

  useEffect(() => {
    if (streamingTorrentActive) {
      serverApi.getStorageStats().then((res) => {
        if (res.success && res.data) {
          setRetentionDays(res.data.storage_retention_days ?? null);
        }
      });
    }
  }, [streamingTorrentActive]);

  const showSaved = () => {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const savePlaybackSettingsToCloud = (next: PlaybackConfigStored) => {
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
          streamingDownloadFull: next.streamingDownloadFull,
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

  const handleStreamingMode = (value: 'hls' | 'direct' | 'lucie') => {
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

  const handleStreamingDownloadFull = (value: boolean) => {
    const next = { ...config, streamingDownloadFull: value };
    setConfig(next);
    savePlaybackToLocalStorage(next);
    savePlaybackSettingsToCloud(next);
    showSaved();
  };

  const RETENTION_OPTIONS: { value: number | null; labelKey: string; days?: number }[] = [
    { value: null, labelKey: 'interfaceSettings.streamingRetentionKeep' },
    { value: 0, labelKey: 'interfaceSettings.streamingRetentionDontKeep' },
    { value: 7, labelKey: 'interfaceSettings.streamingRetentionDays', days: 7 },
    { value: 14, labelKey: 'interfaceSettings.streamingRetentionDays', days: 14 },
    { value: 30, labelKey: 'interfaceSettings.streamingRetentionDays', days: 30 },
    { value: 90, labelKey: 'interfaceSettings.streamingRetentionDays', days: 90 },
  ];

  const handleRetentionChange = async (value: number | null) => {
    const res = await serverApi.patchStorageRetention(value);
    if (res.success && res.data) {
      setRetentionDays(res.data.storage_retention_days ?? null);
      const cloudToken = TokenManager.getCloudAccessToken();
      if (cloudToken) {
        saveUserConfigMerge(
          { playbackSettings: { streamingRetentionDays: value } },
          cloudToken
        ).catch(() => {});
      }
      showSaved();
    }
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

      {/* Téléchargement complet en mode streaming (réservé abonnés) */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
          <Download className="w-5 h-5 text-primary-400" />
          {t('interfaceSettings.streamingDownloadFull')}
        </h3>
        <p className="text-sm text-gray-400 mb-4">{t('interfaceSettings.streamingDownloadFullDescription')}</p>
        {!streamingTorrentActive ? (
          <p className="text-sm text-amber-400/90 mb-2">{t('interfaceSettings.streamingDownloadFullRequiresSubscription')}</p>
        ) : null}
        <label className={`flex items-center gap-3 ${streamingTorrentActive ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
          <input
            type="checkbox"
            className="toggle toggle-primary"
            checked={config.streamingDownloadFull ?? false}
            disabled={!streamingTorrentActive}
            onChange={(e) => streamingTorrentActive && handleStreamingDownloadFull((e.target as HTMLInputElement).checked)}
          />
          <span className="text-white font-medium">
            {config.streamingDownloadFull ? t('common.yes') : t('common.no')}
          </span>
        </label>
      </section>

      {/* Rétention des torrents (abonnement streaming actif) */}
      {streamingTorrentActive && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
            <HardDrive className="w-5 h-5 text-primary-400" />
            {t('interfaceSettings.streamingRetention')}
          </h3>
          <p className="text-sm text-gray-400 mb-4">{t('interfaceSettings.streamingRetentionDescription')}</p>
          <div className="flex flex-wrap gap-2">
            {RETENTION_OPTIONS.map((opt) => (
              <button
                key={opt.value ?? 'keep'}
                type="button"
                onClick={() => handleRetentionChange(opt.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  retentionDays !== undefined && retentionDays === opt.value
                    ? 'bg-primary-500 text-white'
                    : 'bg-white/10 text-white/80 hover:bg-white/20'
                }`}
              >
                {opt.value == null
                  ? t('interfaceSettings.streamingRetentionKeep' as 'interfaceSettings.streamingRetentionKeep')
                  : opt.value === 0
                    ? t('interfaceSettings.streamingRetentionDontKeep' as 'interfaceSettings.streamingRetentionDontKeep')
                    : t('interfaceSettings.streamingRetentionDays' as 'interfaceSettings.streamingRetentionDays', {
                        days: opt.days ?? opt.value,
                      })}
              </button>
            ))}
          </div>
        </section>
      )}

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
            <div className="flex flex-col">
              <span className="text-white font-medium">{t('interfaceSettings.streamingModeHls')}</span>
              <span className="text-xs text-gray-500">{t('interfaceSettings.streamingModeHlsDescription')}</span>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="streaming-mode"
              className="radio radio-primary"
              checked={config.streamingMode === 'lucie'}
              onChange={() => handleStreamingMode('lucie')}
            />
            <div className="flex flex-col">
              <span className="text-white font-medium">{t('interfaceSettings.streamingModeLucie')}</span>
              <span className="text-xs text-gray-500">{t('interfaceSettings.streamingModeLucieDescription')}</span>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="streaming-mode"
              className="radio radio-primary"
              checked={config.streamingMode === 'direct'}
              onChange={() => handleStreamingMode('direct')}
            />
            <div className="flex flex-col">
              <span className="text-white font-medium">{t('interfaceSettings.streamingModeDirect')}</span>
              <span className="text-xs text-gray-500">{t('interfaceSettings.streamingModeDirectDescription')}</span>
            </div>
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
