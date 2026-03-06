import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { DiscoverSlider } from '../../lib/client/server-api/requests';
import { useI18n } from '../../lib/i18n/useI18n';
import { Sliders, RefreshCw } from 'lucide-preact';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';

export default function DiscoverSlidersManager() {
  const { t } = useI18n();
  const [sliders, setSliders] = useState<DiscoverSlider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSliders = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await serverApi.listDiscoverSliders();
      if (res.success && res.data) {
        setSliders(res.data);
      } else {
        setError(res.message || t('requests.errorLoad'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('requests.errorLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSliders();
  }, []);

  const handleInitialize = async () => {
    try {
      const res = await serverApi.initializeDiscoverSliders();
      if (res.success) {
        await loadSliders();
      } else {
        setError(res.message || t('requests.errorLoad'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('requests.errorLoad'));
    }
  };

  if (loading) {
    return (
      <div class="flex justify-center items-center min-h-[200px]">
        <HLSLoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div class="space-y-6 min-w-0">
      <h1 class="text-lg sm:text-2xl font-bold text-white truncate">{t('discover.sliders')}</h1>

      <div class="glass-panel rounded-xl p-4 sm:p-6 text-gray-300 text-sm sm:text-base leading-relaxed min-w-0 overflow-hidden">
        <p class="break-words">{t('discover.slidersExplanation')}</p>
      </div>

      <button
        onClick={handleInitialize}
        class="btn btn-primary btn-sm w-full sm:w-auto min-w-0 inline-flex items-center justify-center gap-2"
      >
        <RefreshCw class="w-4 h-4 flex-shrink-0" />
        <span class="truncate">{t('discover.initializeDefaults')}</span>
      </button>

      {error && (
        <div class="alert alert-error flex flex-col sm:flex-row sm:items-center gap-2 min-w-0 overflow-hidden">
          <span class="break-words flex-1 min-w-0">{error}</span>
          <button class="btn btn-sm btn-ghost flex-shrink-0" onClick={loadSliders}>
            {t('common.retry')}
          </button>
        </div>
      )}

      {sliders.length === 0 && (
        <p class="text-gray-400 break-words">{t('discover.noSliders')}</p>
      )}

      <div class="space-y-4 min-w-0">
        {sliders.map((s) => (
          <div
            key={s.id}
            class="glass-panel rounded-xl p-4 sm:p-6 flex items-center gap-4 min-w-0 overflow-hidden"
          >
            <Sliders class="w-5 h-5 text-primary-400 flex-shrink-0" />
            <div class="flex-1 min-w-0 overflow-hidden">
              <p class="font-medium text-white truncate">{s.title}</p>
              <p class="text-sm text-gray-400 truncate">
                {s.slider_type} · Position {s.position} · {s.enabled ? t('discover.enabled') : t('discover.disabled')}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
