import { Wrench, Sliders, Activity } from 'lucide-preact';
import { useState, useEffect } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import SubMenuPanel, { type SubMenuItem } from './SubMenuPanel';
import { serverApi } from '../../lib/client/server-api';
import ResourceMonitorDev from './ResourceMonitorDev';

const MIN_MAX_TRANSCODINGS = 1;
const MAX_MAX_TRANSCODINGS = 16;

function ForceCleanupSection() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleForceCleanup = async () => {
    if (loading) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await serverApi.forceCacheCleanup();
      if (!res.success) {
        setMessage({ type: 'error', text: res.message || t('errors.generic') });
        return;
      }
      const count = res.data?.cleaned_count ?? 0;
      setMessage({
        type: 'success',
        text: count > 0
          ? t('settingsMenu.maintenance.forceCleanup.successCount', { count })
          : t('settingsMenu.maintenance.forceCleanup.success'),
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : t('errors.generic'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
        <Wrench className="w-5 h-5 text-primary-400" />
        {t('settingsMenu.maintenance.forceCleanup.title')}
      </h3>
      <p className="text-sm text-gray-400 mb-4">{t('settingsMenu.maintenance.forceCleanup.description')}</p>
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleForceCleanup}
          disabled={loading}
          className="btn btn-primary self-start disabled:opacity-60 disabled:cursor-not-allowed"
          data-focusable
          tabIndex={0}
        >
          {loading ? t('common.loading') : t('settingsMenu.maintenance.forceCleanup.action')}
        </button>
        {message && (
          <p
            className={`text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}
            role="status"
          >
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}

function TranscodingConfigSection() {
  const { t } = useI18n();
  const [value, setValue] = useState<number>(2);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    serverApi.getTranscodingConfig().then((res) => {
      if (cancelled) return;
      setFetching(false);
      if (res.success && res.data) {
        setValue(
          Math.max(
            MIN_MAX_TRANSCODINGS,
            Math.min(MAX_MAX_TRANSCODINGS, res.data.max_concurrent_transcodings)
          )
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    if (loading) return;
    const n = Math.max(MIN_MAX_TRANSCODINGS, Math.min(MAX_MAX_TRANSCODINGS, value));
    setLoading(true);
    setMessage(null);
    try {
      const res = await serverApi.updateTranscodingConfig({ max_concurrent_transcodings: n });
      if (!res.success) {
        setMessage({ type: 'error', text: res.message || t('errors.generic') });
        return;
      }
      setValue(res.data?.max_concurrent_transcodings ?? n);
      setMessage({ type: 'success', text: t('settingsMenu.maintenance.transcodingConfig.saveSuccess') });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : t('errors.generic'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
        <Sliders className="w-5 h-5 text-primary-400" />
        {t('settingsMenu.maintenance.transcodingConfig.title')}
      </h3>
      <p className="text-sm text-gray-400 mb-4">
        {t('settingsMenu.maintenance.transcodingConfig.description')}
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label htmlFor="max-transcodings" className="text-sm text-gray-300">
            {t('settingsMenu.maintenance.transcodingConfig.maxLabel')}
          </label>
          <input
            id="max-transcodings"
            type="number"
            min={MIN_MAX_TRANSCODINGS}
            max={MAX_MAX_TRANSCODINGS}
            value={value}
            onInput={(e) => {
              const v = parseInt((e.target as HTMLInputElement).value, 10);
              if (!Number.isNaN(v)) setValue(v);
            }}
            className="w-20 rounded-lg bg-white/10 border border-white/20 text-white px-3 py-2 text-sm"
            disabled={fetching}
          />
          <span className="text-xs text-gray-500">
            {t('settingsMenu.maintenance.transcodingConfig.range', {
              min: MIN_MAX_TRANSCODINGS,
              max: MAX_MAX_TRANSCODINGS,
            })}
          </span>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading || fetching}
          className="btn btn-primary self-start disabled:opacity-60 disabled:cursor-not-allowed"
          data-focusable
          tabIndex={0}
        >
          {loading ? t('common.loading') : t('common.save')}
        </button>
        {message && (
          <p
            className={`text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}
            role="status"
          >
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}

const MAINTENANCE_ITEMS: SubMenuItem[] = [
  {
    id: 'force-cleanup',
    titleKey: 'settingsMenu.maintenance.forceCleanup.title',
    descriptionKey: 'settingsMenu.maintenance.forceCleanup.description',
    icon: Wrench,
    permission: 'settings.server',
    inlineContent: ForceCleanupSection,
  },
  {
    id: 'transcoding-config',
    titleKey: 'settingsMenu.maintenance.transcodingConfig.title',
    descriptionKey: 'settingsMenu.maintenance.transcodingConfig.description',
    icon: Sliders,
    permission: 'settings.server',
    inlineContent: TranscodingConfigSection,
  },
  {
    id: 'resources',
    titleKey: 'settingsMenu.maintenance.resources.title',
    descriptionKey: 'settingsMenu.maintenance.resources.description',
    icon: Activity,
    permission: 'settings.server',
    inlineContent: ResourceMonitorDev,
  },
];

export default function MaintenanceSubMenuPanel() {
  const visibleItems = MAINTENANCE_ITEMS.filter(
    (item) => !item.permission || canAccess(item.permission as any)
  );
  return <SubMenuPanel items={MAINTENANCE_ITEMS} visibleItems={visibleItems} />;
}
