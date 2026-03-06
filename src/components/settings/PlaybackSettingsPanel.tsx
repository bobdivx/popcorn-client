import { useState, useEffect } from 'preact/hooks';
import { useI18n } from '../../lib/i18n';
import { PreferencesManager, TokenManager } from '../../lib/client/storage';
import { saveUserConfigMerge } from '../../lib/api/popcorn-web';
import { serverApi } from '../../lib/client/server-api';
import { SkipForward, ListVideo, Play, Download, HardDrive, ChevronRight, ArrowLeft } from 'lucide-preact';
import { DsCard, DsCardSection } from '../ui/design-system';
import { DEFAULT_PLAYER_CONFIG, type PlayerConfig } from '../streaming/hls-player/hooks/usePlayerConfig';
import { useSubscriptionMe } from '../torrents/MediaDetailPage/hooks/useSubscriptionMe';

const BASE_URL = '/settings?category=playback';
const ACCENT_ICON_BG = 'var(--ds-accent-violet-muted)';
const ACCENT_ICON_COLOR = 'var(--ds-accent-violet)';

const PLAYBACK_SUBS = ['autoplay', 'skipIntro', 'streamingDownloadFull', 'streamingRetention', 'streamingMode', 'nextEpisodeButton'] as const;
type PlaybackSub = (typeof PLAYBACK_SUBS)[number];

function getSubFromUrl(): PlaybackSub | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const sub = params.get('sub');
  return PLAYBACK_SUBS.includes(sub as PlaybackSub) ? (sub as PlaybackSub) : null;
}

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

  const [sub, setSub] = useState<PlaybackSub | null>(getSubFromUrl);
  useEffect(() => {
    setSub(getSubFromUrl());
  }, []);
  useEffect(() => {
    const update = () => setSub(getSubFromUrl());
    window.addEventListener('popstate', update);
    document.addEventListener('astro:page-load', update);
    return () => {
      window.removeEventListener('popstate', update);
      document.removeEventListener('astro:page-load', update);
    };
  }, []);

  type PlaybackItem = { id: PlaybackSub; titleKey: string; descriptionKey: string; cardDescriptionKey?: string; icon: typeof Play; subscriptionOnly?: boolean };
  const playbackItems: PlaybackItem[] = [
    { id: 'autoplay', titleKey: 'interfaceSettings.autoplay', descriptionKey: 'interfaceSettings.autoplayDescription', icon: Play },
    { id: 'skipIntro', titleKey: 'interfaceSettings.skipIntro', descriptionKey: 'interfaceSettings.skipIntroDescription', icon: SkipForward },
    { id: 'streamingDownloadFull', titleKey: 'interfaceSettings.streamingDownloadFull', descriptionKey: 'interfaceSettings.streamingDownloadFullDescription', cardDescriptionKey: 'interfaceSettings.streamingDownloadFullCardDescription', icon: Download, subscriptionOnly: true },
    ...(streamingTorrentActive ? [{ id: 'streamingRetention' as const, titleKey: 'interfaceSettings.streamingRetention', descriptionKey: 'interfaceSettings.streamingRetentionDescription', icon: HardDrive }] : []),
    { id: 'streamingMode', titleKey: 'interfaceSettings.streamingMode', descriptionKey: 'interfaceSettings.streamingModeDescription', icon: Play },
    { id: 'nextEpisodeButton', titleKey: 'interfaceSettings.nextEpisodeButton', descriptionKey: 'interfaceSettings.nextEpisodeButtonDescription', icon: ListVideo },
  ];

  if (sub && playbackItems.some((i) => i.id === sub)) {
    const item = playbackItems.find((i) => i.id === sub)!;
    const Icon = item.icon;
    const backAndFrame = (
      <div className="space-y-6">
        <a href={BASE_URL} data-astro-prefetch className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ds-accent-violet)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 rounded" aria-label={t('common.back')}>
          <ArrowLeft className="w-4 h-4" aria-hidden />
          <span>{t('common.back')}</span>
        </a>
        <div className="rounded-[var(--ds-radius-lg)] overflow-hidden bg-[var(--ds-surface-elevated)] border border-[var(--ds-border)]">
          <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-[var(--ds-border)] flex items-center gap-3">
            <span className="inline-flex w-10 h-10 rounded-xl flex-shrink-0 items-center justify-center" style={{ backgroundColor: ACCENT_ICON_BG, color: ACCENT_ICON_COLOR }} aria-hidden>
              <Icon className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div>
              <h2 className="ds-title-card text-[var(--ds-text-primary)]">{t(item.titleKey)}</h2>
              <span className="ds-text-tertiary text-sm line-clamp-2">{t(item.descriptionKey)}</span>
            </div>
          </div>
          <div className="p-4 sm:p-5 min-w-0">
            {saved && <div className="ds-status-badge ds-status-badge--success w-fit mb-4" role="status">{t('common.success')}</div>}
            {sub === 'autoplay' && (
              <>
                <p className="text-sm ds-text-secondary mb-4">{t('interfaceSettings.autoplayDescription')}</p>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" className="toggle toggle-primary" checked={autoplay} onChange={(e) => handleAutoplayChange((e.target as HTMLInputElement).checked)} />
                  <span className="font-medium text-[var(--ds-text-primary)]">{autoplay ? t('common.yes') : t('common.no')}</span>
                </label>
              </>
            )}
            {sub === 'skipIntro' && (
              <>
                <p className="text-sm ds-text-secondary mb-4">{t('interfaceSettings.skipIntroDescription')}</p>
                <label className="flex items-center gap-3 cursor-pointer mb-4">
                  <input type="checkbox" className="toggle toggle-primary" checked={config.skipIntroEnabled} onChange={(e) => handleSkipIntroEnabled((e.target as HTMLInputElement).checked)} />
                  <span className="font-medium text-[var(--ds-text-primary)]">{t('interfaceSettings.skipIntroAuto')}</span>
                </label>
                <p className="text-sm ds-text-secondary mb-2">{t('interfaceSettings.skipIntroAutoDescription')}</p>
                <div className="flex items-center gap-3 mt-2">
                  <label className="text-sm ds-text-secondary">{t('interfaceSettings.introSkipSeconds')}</label>
                  <input type="number" min={30} max={300} value={config.introSkipSeconds} onChange={(e) => handleIntroSkipSeconds(Number((e.target as HTMLInputElement).value))} className="w-24 px-3 py-2 rounded-lg bg-[var(--ds-surface)] border-[var(--ds-border)] text-[var(--ds-text-primary)] text-sm" />
                  <span className="ds-text-tertiary text-sm">s</span>
                </div>
                <p className="text-xs ds-text-tertiary mt-1">{t('interfaceSettings.introSkipSecondsDescription')}</p>
              </>
            )}
            {sub === 'streamingDownloadFull' && (
              <>
                <p className="text-sm ds-text-secondary mb-4">{t('interfaceSettings.streamingDownloadFullDescription')}</p>
                {!streamingTorrentActive && <p className="text-sm text-amber-400/90 mb-2">{t('interfaceSettings.streamingDownloadFullRequiresSubscription')}</p>}
                <label className={`flex items-center gap-3 ${streamingTorrentActive ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                  <input type="checkbox" className="toggle toggle-primary" checked={config.streamingDownloadFull ?? false} disabled={!streamingTorrentActive} onChange={(e) => streamingTorrentActive && handleStreamingDownloadFull((e.target as HTMLInputElement).checked)} />
                  <span className="font-medium text-[var(--ds-text-primary)]">{config.streamingDownloadFull ? t('common.yes') : t('common.no')}</span>
                </label>
              </>
            )}
            {sub === 'streamingRetention' && (
              <>
                <p className="text-sm ds-text-secondary mb-4">{t('interfaceSettings.streamingRetentionDescription')}</p>
                <div className="flex flex-wrap gap-2">
                  {RETENTION_OPTIONS.map((opt) => (
                    <button key={opt.value ?? 'keep'} type="button" onClick={() => handleRetentionChange(opt.value)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${retentionDays !== undefined && retentionDays === opt.value ? 'bg-[var(--ds-accent-violet)] text-[var(--ds-text-on-accent)]' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}>
                      {opt.value == null ? t('interfaceSettings.streamingRetentionKeep' as 'interfaceSettings.streamingRetentionKeep') : opt.value === 0 ? t('interfaceSettings.streamingRetentionDontKeep' as 'interfaceSettings.streamingRetentionDontKeep') : t('interfaceSettings.streamingRetentionDays' as 'interfaceSettings.streamingRetentionDays', { days: opt.days ?? opt.value })}
                    </button>
                  ))}
                </div>
              </>
            )}
            {sub === 'streamingMode' && (
              <>
                <p className="text-sm ds-text-secondary mb-4">{t('interfaceSettings.streamingModeDescription')}</p>
                <div className="flex flex-col gap-3">
                  {(['hls', 'lucie', 'direct'] as const).map((mode) => (
                    <label key={mode} className="flex items-center gap-3 cursor-pointer">
                      <input type="radio" name="streaming-mode" className="radio radio-primary" checked={config.streamingMode === mode} onChange={() => handleStreamingMode(mode)} />
                      <div className="flex flex-col">
                        <span className="font-medium text-[var(--ds-text-primary)]">{t(`interfaceSettings.streamingMode${mode.charAt(0).toUpperCase() + mode.slice(1)}`)}</span>
                        <span className="text-xs ds-text-tertiary">{t(`interfaceSettings.streamingMode${mode.charAt(0).toUpperCase() + mode.slice(1)}Description`)}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </>
            )}
            {sub === 'nextEpisodeButton' && (
              <>
                <p className="text-sm ds-text-secondary mb-4">{t('interfaceSettings.nextEpisodeButtonDescription')}</p>
                <label className="flex items-center gap-3 cursor-pointer mb-4">
                  <input type="checkbox" className="toggle toggle-primary" checked={config.nextEpisodeButtonEnabled} onChange={(e) => handleNextEpisodeButtonEnabled((e.target as HTMLInputElement).checked)} />
                  <span className="font-medium text-[var(--ds-text-primary)]">{t('interfaceSettings.nextEpisodeButton')}</span>
                </label>
                <div className="flex items-center gap-3 mt-2">
                  <label className="text-sm ds-text-secondary">{t('interfaceSettings.nextEpisodeCountdownSeconds')}</label>
                  <input type="number" min={30} max={300} value={config.nextEpisodeCountdownSeconds} onChange={(e) => handleNextEpisodeCountdownSeconds(Number((e.target as HTMLInputElement).value))} className="w-24 px-3 py-2 rounded-lg bg-[var(--ds-surface)] border-[var(--ds-border)] text-[var(--ds-text-primary)] text-sm" />
                  <span className="ds-text-tertiary text-sm">s</span>
                </div>
                <p className="text-xs ds-text-tertiary mt-1">{t('interfaceSettings.nextEpisodeCountdownDescription')}</p>
              </>
            )}
          </div>
        </div>
      </div>
    );
    return <div className="flex-1 py-4 px-4 sm:px-6 overflow-y-auto scrollbar-visible">{backAndFrame}</div>;
  }

  return (
    <div className="flex-1 py-4 px-4 sm:px-6 overflow-y-auto scrollbar-visible">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
        {playbackItems.map((item) => {
          const Icon = item.icon;
          return (
            <a key={item.id} href={`${BASE_URL}&sub=${item.id}`} data-astro-prefetch="hover" data-settings-card className="block min-w-0 rounded-[var(--ds-radius-lg)] overflow-hidden transition-all hover:scale-[1.01] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] focus-visible:overflow-visible">
              <DsCard variant="elevated" className="h-full">
                <DsCardSection className="flex flex-col h-full min-h-[120px]">
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex-shrink-0 items-center justify-center" style={{ backgroundColor: ACCENT_ICON_BG, color: ACCENT_ICON_COLOR }} aria-hidden>
                      <Icon className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.8} />
                    </span>
                    <ChevronRight className="w-5 h-5 text-[var(--ds-text-tertiary)] flex-shrink-0 mt-0.5" aria-hidden />
                  </div>
                  <h2 className="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg mt-3 truncate">{t(item.titleKey)}</h2>
                  <span className="ds-text-tertiary text-sm mt-3 line-clamp-2">{t(item.cardDescriptionKey ?? item.descriptionKey)}</span>
                  <span className="mt-auto pt-4 flex items-center gap-2 flex-wrap">
                    {item.subscriptionOnly && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-amber-500/20 text-amber-400/90" aria-hidden>
                        {t('settingsMenu.subscriptionOnlyBadge')}
                      </span>
                    )}
                    <span className="text-xs font-medium text-[var(--ds-accent-violet)] flex items-center gap-1" aria-hidden>{t('common.open')}</span>
                  </span>
                </DsCardSection>
              </DsCard>
            </a>
          );
        })}
      </div>
    </div>
  );
}
