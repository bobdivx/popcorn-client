import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import type { BlacklistedItem } from '../../lib/client/server-api/requests';
import { useI18n } from '../../lib/i18n/useI18n';
import { Ban, Trash2 } from 'lucide-preact';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';

export default function BlacklistManager() {
  const { t } = useI18n();
  const [items, setItems] = useState<BlacklistedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadItems = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await serverApi.listBlacklist({ limit: 200 });
      if (res.success && res.data) {
        setItems(res.data);
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
    loadItems();
  }, []);

  const handleRemove = async (tmdbId: number, mediaType: string) => {
    try {
      const res = await serverApi.removeFromBlacklist(tmdbId, mediaType);
      if (res.success) {
        await loadItems();
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
      <h1 class="text-lg sm:text-2xl font-bold text-white truncate">{t('blacklist.title')}</h1>

      <div class="glass-panel rounded-xl p-4 sm:p-6 text-gray-300 text-sm sm:text-base leading-relaxed min-w-0 overflow-hidden">
        <p class="break-words">{t('blacklist.explanation')}</p>
      </div>

      {error && (
        <div class="alert alert-error flex flex-col sm:flex-row sm:items-center gap-2 min-w-0 overflow-hidden">
          <span class="break-words flex-1 min-w-0">{error}</span>
          <button class="btn btn-sm btn-ghost flex-shrink-0" onClick={loadItems}>
            {t('common.retry')}
          </button>
        </div>
      )}

      {items.length === 0 && (
        <p class="text-gray-400 break-words">{t('blacklist.noItems')}</p>
      )}

      <div class="space-y-4 min-w-0">
        {items.map((item) => (
          <div
            key={item.id}
            class="glass-panel rounded-xl p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0 overflow-hidden"
          >
            <div class="flex items-center gap-3 flex-1 min-w-0 overflow-hidden">
              <Ban class="w-5 h-5 text-red-400 flex-shrink-0" />
              <div class="min-w-0 overflow-hidden">
                <p class="font-medium text-white truncate">
                  TMDB #{item.tmdb_id} ({item.media_type})
                </p>
                {item.reason && (
                  <p class="text-sm text-gray-400 truncate">{item.reason}</p>
                )}
              </div>
            </div>
            <button
              onClick={() => handleRemove(item.tmdb_id, item.media_type)}
              class="btn btn-error btn-sm flex-shrink-0 min-w-[44px]"
              title={t('blacklist.removeFromBlacklist')}
              aria-label={t('blacklist.removeFromBlacklist')}
            >
              <Trash2 class="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
