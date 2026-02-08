import { useState, useEffect } from 'preact/hooks';
import { LayoutGrid, Cloud, CloudOff } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { TokenManager } from '../../lib/client/storage';
import {
  getLibraryDisplayConfig,
  loadLibraryDisplayFromCloud,
  saveLibraryDisplayConfig,
  type LibraryDisplayConfig,
} from '../../lib/utils/library-display-config';

const LANGUAGES = [
  { id: 'FRENCH', label: 'Français' },
  { id: 'MULTI', label: 'Multi' },
  { id: 'VOSTFR', label: 'VOSTFR' },
  { id: 'VOST', label: 'VOST' },
  { id: 'VO', label: 'VO' },
  { id: 'ENGLISH', label: 'English' },
  { id: 'SUBFRENCH', label: 'Sous-titré FR' },
];

const QUALITIES = [
  { id: '', label: 'Toutes' },
  { id: '480p', label: '480p' },
  { id: '720p', label: '720p' },
  { id: '1080p', label: '1080p' },
  { id: '2160p', label: '2160p / 4K' },
];

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

export default function LibraryDisplaySettingsPanel() {
  const { t } = useI18n();
  const [config, setConfig] = useState<LibraryDisplayConfig>(() => getLibraryDisplayConfig());
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasCloud, setHasCloud] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setHasCloud(!!TokenManager.getCloudAccessToken());
      const loaded = await loadLibraryDisplayFromCloud();
      if (!cancelled) {
        setConfig(loaded);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleChange = async (updates: Partial<LibraryDisplayConfig>) => {
    const next = { ...config, ...updates };
    setConfig(next);
    await saveLibraryDisplayConfig(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const toggleLanguage = (id: string) => {
    const next = config.mediaLanguages.includes(id)
      ? config.mediaLanguages.filter((l) => l !== id)
      : [...config.mediaLanguages, id];
    handleChange({ mediaLanguages: next });
  };

  if (loading) return null;

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6 mt-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
        <LayoutGrid className="w-5 h-5 text-primary-400" />
        {t('interfaceSettings.librarySection')}
        {hasCloud ? (
          <Cloud className="w-4 h-4 text-green-400" title="Synchronisé avec le cloud" />
        ) : (
          <CloudOff className="w-4 h-4 text-gray-500" title="Non synchronisé" />
        )}
      </h3>
      {saved && (
        <p className="text-sm text-green-400 mb-4">
          {t('common.success')} {hasCloud && '(synchronisé cloud)'}
        </p>
      )}

      <div className="space-y-6">
        <div>
          <p className="text-sm text-gray-400 mb-2">{t('interfaceSettings.showZeroSeedTorrentsDescription')}</p>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="toggle toggle-primary"
              checked={config.showZeroSeedTorrents}
              onChange={(e) => handleChange({ showZeroSeedTorrents: (e.target as HTMLInputElement).checked })}
            />
            <span className="text-white font-medium">{t('interfaceSettings.showZeroSeedTorrents')}</span>
          </label>
        </div>

        <div>
          <p className="text-sm text-gray-400 mb-2">
            Langues du média (vide = toutes). Cliquez pour activer/désactiver.
          </p>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => toggleLanguage(id)}
                className={`px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition-all ${
                  config.mediaLanguages.includes(id)
                    ? 'border-primary-500 bg-primary-500/20 text-white'
                    : 'border-white/10 text-gray-400 hover:border-white/20'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {config.mediaLanguages.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Actives: {config.mediaLanguages.join(', ')}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">Qualité minimale (vide = toutes)</label>
          <select
            value={config.minQuality}
            onChange={(e) => handleChange({ minQuality: (e.target as HTMLSelectElement).value })}
            className="select select-bordered bg-white/5 border-white/20 text-white max-w-xs"
          >
            {QUALITIES.map(({ id, label }) => (
              <option key={id || 'all'} value={id}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">{t('interfaceSettings.torrentsInitialLimitDescription')}</label>
          <input
            type="number"
            min={20}
            max={500}
            defaultValue={config.torrentsInitialLimit}
            onBlur={(e) => {
              const v = clampNumber(Number((e.target as HTMLInputElement).value), 20, 500);
              handleChange({ torrentsInitialLimit: v });
              (e.target as HTMLInputElement).value = String(v);
            }}
            className="input input-bordered w-24 bg-white/5 border-white/20 text-white"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">{t('interfaceSettings.torrentsLoadMoreLimitDescription')}</label>
          <input
            type="number"
            min={20}
            max={200}
            defaultValue={config.torrentsLoadMoreLimit}
            onBlur={(e) => {
              const v = clampNumber(Number((e.target as HTMLInputElement).value), 20, 200);
              handleChange({ torrentsLoadMoreLimit: v });
              (e.target as HTMLInputElement).value = String(v);
            }}
            className="input input-bordered w-24 bg-white/5 border-white/20 text-white"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-2">{t('interfaceSettings.torrentsRecentLimitDescription')}</label>
          <input
            type="number"
            min={20}
            max={200}
            defaultValue={config.torrentsRecentLimit}
            onBlur={(e) => {
              const v = clampNumber(Number((e.target as HTMLInputElement).value), 20, 200);
              handleChange({ torrentsRecentLimit: v });
              (e.target as HTMLInputElement).value = String(v);
            }}
            className="input input-bordered w-24 bg-white/5 border-white/20 text-white"
          />
        </div>
      </div>
    </section>
  );
}
