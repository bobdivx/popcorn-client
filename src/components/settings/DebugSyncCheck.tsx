/**
 * Composant provisoire de debug : teste si un torrent est réellement téléchargeable
 * (GET + Range, premier octet bencode). Utilise l'endpoint /api/debug/check-torrent-download.
 */
import { useState, useEffect } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { useI18n } from '../../lib/i18n/useI18n';
import type { Indexer } from '../../lib/client/types';
import { Search, CheckCircle, XCircle, Loader2 } from 'lucide-preact';

interface CheckResult {
  downloadable: boolean;
  status_code: number;
  message: string;
  first_byte?: string;
}

export default function DebugSyncCheck() {
  const { t } = useI18n();
  const [indexers, setIndexers] = useState<Indexer[]>([]);
  const [indexerId, setIndexerId] = useState('');
  const [torrentId, setTorrentId] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingIndexers, setLoadingIndexers] = useState(true);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadingIndexers(true);
    serverApi
      .getIndexers()
      .then((res) => {
        if (cancelled || !res.success || !res.data) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setIndexers(list);
        if (list.length && !indexerId) setIndexerId(list[0].id ?? '');
      })
      .finally(() => setLoadingIndexers(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCheck = async () => {
    if (!indexerId.trim() || !torrentId.trim()) {
      setError(t('settingsPages.debugSync.fillBoth'));
      setResult(null);
      return;
    }
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await serverApi.checkTorrentDownload(indexerId.trim(), torrentId.trim());
      if (res.success && res.data) {
        setResult(res.data as CheckResult);
      } else {
        setError(res.message || res.error || t('settingsPages.debugSync.errorGeneric'));
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="glass-panel rounded-xl p-4 sm:p-6 border border-white/10">
      <h2 class="text-lg font-semibold text-white mb-1">
        {t('settingsPages.debugSync.title')}
      </h2>
      <p class="text-sm text-gray-400 mb-4">
        {t('settingsPages.debugSync.subtitle')}
      </p>

      <div class="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4">
        <div class="flex-1 min-w-0">
          <label class="block text-xs text-gray-400 mb-1">
            {t('settingsPages.debugSync.indexerId')}
          </label>
          <select
            class="input input-bordered w-full bg-black/30 border-white/20 text-white"
            value={indexerId}
            onInput={(e) => setIndexerId((e.target as HTMLSelectElement).value)}
            disabled={loadingIndexers}
          >
            {loadingIndexers ? (
              <option>{t('settingsPages.debugSync.loadingIndexers')}</option>
            ) : (
              indexers.map((idx) => (
                <option key={idx.id} value={idx.id ?? ''}>
                  {idx.name ?? idx.id}
                </option>
              ))
            )}
          </select>
        </div>
        <div class="flex-1 min-w-0">
          <label class="block text-xs text-gray-400 mb-1">
            {t('settingsPages.debugSync.torrentId')}
          </label>
          <input
            type="text"
            class="input input-bordered w-full bg-black/30 border-white/20 text-white"
            placeholder={t('settingsPages.debugSync.torrentIdPlaceholder')}
            value={torrentId}
            onInput={(e) => setTorrentId((e.target as HTMLInputElement).value)}
            disabled={loading}
          />
        </div>
      </div>

      <div class="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          class="btn btn-primary gap-2"
          onClick={handleCheck}
          disabled={loading || loadingIndexers}
        >
          {loading ? (
            <Loader2 class="w-4 h-4 animate-spin" />
          ) : (
            <Search class="w-4 h-4" />
          )}
          {loading ? t('settingsPages.debugSync.checking') : t('settingsPages.debugSync.check')}
        </button>
      </div>

      {error && (
        <div class="rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3 mb-4">
          {error}
        </div>
      )}

      {result && (
        <div
          class={`rounded-lg border p-4 ${
            result.downloadable
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-amber-500/10 border-amber-500/30'
          }`}
        >
          <div class="flex items-center gap-2 mb-2">
            {result.downloadable ? (
              <CheckCircle class="w-5 h-5 text-emerald-400" />
            ) : (
              <XCircle class="w-5 h-5 text-amber-400" />
            )}
            <span
              class={
                result.downloadable ? 'text-emerald-300 font-medium' : 'text-amber-300 font-medium'
              }
            >
              {result.downloadable
                ? t('settingsPages.debugSync.downloadable')
                : t('settingsPages.debugSync.notDownloadable')}
            </span>
          </div>
          <p class="text-sm text-gray-300 mb-1">{result.message}</p>
          <p class="text-xs text-gray-500">
            HTTP {result.status_code}
            {result.first_byte != null && result.first_byte !== '' && (
              <> · Premier octet : {result.first_byte}</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
