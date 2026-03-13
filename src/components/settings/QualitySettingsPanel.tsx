import { useState, useEffect } from 'preact/hooks';
import { Monitor, Film, Check } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { TokenManager } from '../../lib/client/storage';
import { saveUserConfigMerge } from '../../lib/api/popcorn-web';
import { DEFAULT_PLAYER_CONFIG } from '../streaming/hls-player/hooks/usePlayerConfig';
import {
  getLibraryDisplayConfig,
  loadLibraryDisplayFromCloud,
  saveLibraryDisplayConfig,
} from '../../lib/utils/library-display-config';

const PLAYER_CONFIG_KEY = 'playerConfig';

type PlayerDefaultQuality = 'auto' | 'highest' | 'lowest';

interface StoredPlayerQuality {
  defaultQuality: PlayerDefaultQuality;
}

const PLAYER_QUALITIES: { id: PlayerDefaultQuality; labelKey: string; descKey: string }[] = [
  {
    id: 'auto',
    labelKey: 'qualitySettings.playerQualityAuto',
    descKey: 'qualitySettings.playerQualityAutoDesc',
  },
  {
    id: 'highest',
    labelKey: 'qualitySettings.playerQualityHighest',
    descKey: 'qualitySettings.playerQualityHighestDesc',
  },
  {
    id: 'lowest',
    labelKey: 'qualitySettings.playerQualityLowest',
    descKey: 'qualitySettings.playerQualityLowestDesc',
  },
];

const MEDIA_QUALITIES: { id: string; labelKey: string; descKey: string }[] = [
  {
    id: '',
    labelKey: 'qualitySettings.mediaQualityAll',
    descKey: 'qualitySettings.mediaQualityAllDesc',
  },
  {
    id: '480p',
    labelKey: 'qualitySettings.mediaQuality480p',
    descKey: 'qualitySettings.mediaQuality480pDesc',
  },
  {
    id: '720p',
    labelKey: 'qualitySettings.mediaQuality720p',
    descKey: 'qualitySettings.mediaQuality720pDesc',
  },
  {
    id: '1080p',
    labelKey: 'qualitySettings.mediaQuality1080p',
    descKey: 'qualitySettings.mediaQuality1080pDesc',
  },
  {
    id: '2160p',
    labelKey: 'qualitySettings.mediaQuality4k',
    descKey: 'qualitySettings.mediaQuality4kDesc',
  },
];

function getStoredPlayerQuality(): PlayerDefaultQuality {
  if (typeof window === 'undefined') return DEFAULT_PLAYER_CONFIG.defaultQuality as PlayerDefaultQuality;
  try {
    const stored = localStorage.getItem(PLAYER_CONFIG_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      const q = parsed.defaultQuality;
      if (q === 'auto' || q === 'highest' || q === 'lowest') return q;
    }
  } catch {
    // ignore
  }
  const def = DEFAULT_PLAYER_CONFIG.defaultQuality;
  return (def === 'auto' || def === 'highest' || def === 'lowest') ? def : 'auto';
}

function savePlayerQualityToStorage(quality: PlayerDefaultQuality) {
  if (typeof window === 'undefined') return;
  try {
    const stored = localStorage.getItem(PLAYER_CONFIG_KEY);
    const current = stored ? (JSON.parse(stored) as Record<string, unknown>) : {};
    const merged = { ...DEFAULT_PLAYER_CONFIG, ...current, defaultQuality: quality, autoQuality: quality === 'auto' };
    localStorage.setItem(PLAYER_CONFIG_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
}

export default function QualitySettingsPanel() {
  const { t } = useI18n();
  const [playerQuality, setPlayerQuality] = useState<PlayerDefaultQuality>('auto');
  const [preferredQuality, setPreferredQuality] = useState('');
  const [saved, setSaved] = useState<'player' | 'media' | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPlayerQuality(getStoredPlayerQuality());
    let cancelled = false;
    (async () => {
      const config = await loadLibraryDisplayFromCloud();
      if (!cancelled) {
        setPreferredQuality(config.preferredQuality ?? '');
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showSaved = (type: 'player' | 'media') => {
    setSaved(type);
    window.setTimeout(() => setSaved(null), 1800);
  };

  const handlePlayerQuality = (quality: PlayerDefaultQuality) => {
    setPlayerQuality(quality);
    savePlayerQualityToStorage(quality);
    const cloudToken = TokenManager.getCloudAccessToken();
    if (cloudToken) {
      saveUserConfigMerge(
        { playbackSettings: { defaultQuality: quality, autoQuality: quality === 'auto' } },
        cloudToken
      ).catch(() => {});
    }
    showSaved('player');
  };

  const handlePreferredQuality = async (quality: string) => {
    setPreferredQuality(quality);
    await saveLibraryDisplayConfig({ preferredQuality: quality });
    showSaved('media');
  };

  return (
    <div className="space-y-8">
      {/* Section Qualité du lecteur vidéo */}
      <div class="sc-frame">
        <div class="sc-frame-header">
          <div class="sc-frame-icon">
            <Monitor className="w-5 h-5" strokeWidth={1.8} aria-hidden />
          </div>
          <div>
            <div class="sc-frame-title">{t('qualitySettings.playerQuality')}</div>
            <div class="sc-frame-desc">{t('qualitySettings.playerQualityDescription')}</div>
          </div>
        </div>
        <div class="sc-frame-body">
          {saved === 'player' && (
            <div className="ds-status-badge ds-status-badge--success w-fit mb-4 flex items-center gap-1.5" role="status">
              <Check className="w-3 h-3" />
              {t('common.success')}
            </div>
          )}
          <div className="flex flex-col gap-3">
            {PLAYER_QUALITIES.map((q) => (
              <label key={q.id} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="radio"
                  name="player-quality"
                  className="radio radio-primary flex-shrink-0"
                  checked={playerQuality === q.id}
                  onChange={() => handlePlayerQuality(q.id)}
                />
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-[var(--ds-text-primary)] group-hover:text-[var(--ds-accent-violet)] transition-colors">
                    {t(q.labelKey)}
                  </span>
                  <span className="text-xs ds-text-tertiary mt-0.5">{t(q.descKey)}</span>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Section Qualité préférée des médias */}
      <div class="sc-frame">
        <div class="sc-frame-header">
          <div class="sc-frame-icon">
            <Film className="w-5 h-5" strokeWidth={1.8} aria-hidden />
          </div>
          <div>
            <div class="sc-frame-title">{t('qualitySettings.mediaQuality')}</div>
            <div class="sc-frame-desc">{t('qualitySettings.mediaQualityDescription')}</div>
          </div>
        </div>
        <div class="sc-frame-body">
          {saved === 'media' && (
            <div className="ds-status-badge ds-status-badge--success w-fit mb-4 flex items-center gap-1.5" role="status">
              <Check className="w-3 h-3" />
              {t('common.success')}
            </div>
          )}
          <p className="text-sm ds-text-secondary mb-4">{t('qualitySettings.mediaQualityNote')}</p>
          {loading ? (
            <div className="flex items-center justify-center min-h-[80px]" aria-busy="true">
              <span className="loading loading-spinner loading-sm text-[var(--ds-accent-violet)]" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {MEDIA_QUALITIES.map((q) => {
                const isSelected = preferredQuality === q.id;
                return (
                  <button
                    key={q.id || 'all'}
                    type="button"
                    onClick={() => handlePreferredQuality(q.id)}
                    className={`relative flex flex-col gap-1 px-4 py-3 rounded-xl border-2 text-left transition-all focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 ${
                      isSelected
                        ? 'border-[var(--ds-accent-violet)] bg-[var(--ds-accent-violet-muted)]'
                        : 'border-[var(--ds-border)] bg-[var(--ds-surface)] hover:border-[var(--ds-accent-violet)]/50'
                    }`}
                    aria-pressed={isSelected}
                  >
                    {isSelected && (
                      <span className="absolute top-2 right-2 text-[var(--ds-accent-violet)]" aria-hidden>
                        <Check className="w-4 h-4" strokeWidth={2.5} />
                      </span>
                    )}
                    <span
                      className={`font-semibold text-sm ${isSelected ? 'text-[var(--ds-accent-violet)]' : 'text-[var(--ds-text-primary)]'}`}
                    >
                      {t(q.labelKey)}
                    </span>
                    <span className="text-xs ds-text-tertiary leading-snug">{t(q.descKey)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
