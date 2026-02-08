import { useEffect, useState } from 'preact/hooks';
import { HardDrive, Loader2, RefreshCcw } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';

function formatGb(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  return gb < 0.01 && bytes > 0 ? '< 0.01' : gb.toFixed(2);
}

export default function StoragePanel() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<{
    used_bytes: number;
    total_bytes?: number;
    available_bytes?: number;
  } | null>(null);

  const fetchStorage = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await serverApi.getStorageStats();
      if (!res.success) {
        setError(res.message || res.error || t('settingsPages.storage.errorGeneric'));
        setData(null);
      } else if (res.data) {
        setData(res.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settingsPages.storage.errorGeneric'));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStorage();
  }, []);

  return (
    <div className="flex-1 py-4 px-4 sm:px-6 space-y-6 overflow-y-auto scrollbar-visible">
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
              <HardDrive className="w-5 h-5 text-primary-400" />
              {t('settingsPages.storage.title')}
            </h3>
            <p className="text-sm text-gray-400">{t('settingsPages.storage.subtitle')}</p>
          </div>
          <button
            type="button"
            className="btn btn-primary gap-2"
            onClick={fetchStorage}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCcw className="w-4 h-4" />
            )}
            {loading ? t('settingsPages.storage.checking') : t('settingsPages.storage.refresh')}
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3 mb-4">
            {error}
          </div>
        )}

        {data && (
          <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-gray-400">{t('settingsPages.storage.used')}</span>
              <span className="text-white font-medium">{formatGb(data.used_bytes)} GB</span>
              {data.total_bytes != null && (
                <>
                  <span className="text-gray-500">/</span>
                  <span className="text-white font-medium">{formatGb(data.total_bytes)} GB</span>
                </>
              )}
            </div>
            {data.total_bytes != null && data.total_bytes > 0 && (
              <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (data.used_bytes / data.total_bytes) * 100)}%`,
                  }}
                />
              </div>
            )}
            {data.available_bytes != null && (
              <p className="text-sm text-gray-400">
                {t('settingsPages.storage.available')}: {formatGb(data.available_bytes)} GB
              </p>
            )}
            <p className="text-sm text-gray-400">
              {t('settingsPages.storage.retentionLabel')}:{' '}
              {data.storage_retention_days != null && data.storage_retention_days > 0
                ? t('settingsPages.storage.retentionDays', { days: data.storage_retention_days })
                : t('settingsPages.storage.retentionDisabled')}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
