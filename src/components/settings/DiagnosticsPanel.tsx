import { useEffect, useState } from 'preact/hooks';
import { Activity, CheckCircle, XCircle, Loader2, RefreshCcw } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';
import DebugSyncCheck from './DebugSyncCheck';

interface HealthResult {
  reachable: boolean;
  latency?: number;
  version?: string;
  build?: number;
  download_dir?: string;
  ffmpeg_available?: boolean;
  torrent_client_reachable?: boolean;
  librqbit_version?: string;
}

export default function DiagnosticsPanel() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<HealthResult | null>(null);

  const runHealthCheck = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await serverApi.checkServerHealth();
      if (!res.success || !res.data) {
        setError(res.message || res.error || t('settingsPages.diagnostics.errorGeneric'));
        setResult({ reachable: false });
      } else {
        setResult(res.data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settingsPages.diagnostics.errorGeneric'));
      setResult({ reachable: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runHealthCheck();
  }, []);

  return (
    <div className="flex-1 py-4 px-4 sm:px-6 space-y-6 overflow-y-auto scrollbar-visible">
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Activity className="w-5 h-5 text-primary-400" />
              {t('settingsPages.diagnostics.healthTitle')}
            </h3>
            <p className="text-sm text-gray-400">
              {t('settingsPages.diagnostics.healthSubtitle')}
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary gap-2"
            onClick={runHealthCheck}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCcw className="w-4 h-4" />
            )}
            {loading ? t('settingsPages.diagnostics.checking') : t('settingsPages.diagnostics.check')}
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm p-3 mb-4">
            {error}
          </div>
        )}

        {result && (
          <div
            className={`rounded-lg border p-4 ${
              result.reachable
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-amber-500/10 border-amber-500/30'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              {result.reachable ? (
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              ) : (
                <XCircle className="w-5 h-5 text-amber-400" />
              )}
              <span
                className={
                  result.reachable ? 'text-emerald-300 font-medium' : 'text-amber-300 font-medium'
                }
              >
                {result.reachable
                  ? t('settingsPages.diagnostics.backendReachable')
                  : t('settingsPages.diagnostics.backendUnreachable')}
              </span>
            </div>
            <div className="text-sm text-gray-300 space-y-1">
              {typeof result.latency === 'number' && (
                <div>
                  {t('settingsPages.diagnostics.latency')}: {Math.round(result.latency)} ms
                </div>
              )}
              {(result.version || result.build != null) && (
                <div>
                  {t('settingsPages.diagnostics.version')}:{' '}
                  {[result.version, result.build != null ? `#${result.build}` : null]
                    .filter(Boolean)
                    .join(' ')}
                </div>
              )}
              {result.download_dir && (
                <div>
                  {t('settingsPages.diagnostics.downloadDir')}: {result.download_dir}
                </div>
              )}
              {typeof result.ffmpeg_available === 'boolean' && (
                <div>
                  {t('settingsPages.diagnostics.ffmpeg')}:{' '}
                  {result.ffmpeg_available
                    ? t('settingsPages.diagnostics.ok')
                    : t('settingsPages.diagnostics.ko')}
                </div>
              )}
              {typeof result.torrent_client_reachable === 'boolean' && (
                <div>
                  {t('settingsPages.diagnostics.torrentClient')}:{' '}
                  {result.torrent_client_reachable
                    ? t('settingsPages.diagnostics.ok')
                    : t('settingsPages.diagnostics.ko')}
                </div>
              )}
              {result.librqbit_version && (
                <div>
                  {t('settingsPages.diagnostics.librqbitVersion')}: {result.librqbit_version}
                </div>
              )}
              {!result.librqbit_version && typeof result.torrent_client_reachable === 'boolean' && (
                <div>
                  {t('settingsPages.diagnostics.librqbitVersion')}: {t('settingsPages.diagnostics.unknown')}
                </div>
              )}
              <div className="text-xs text-gray-500">
                {t('settingsPages.diagnostics.ffmpegHint')}
              </div>
            </div>
          </div>
        )}
      </section>

      <DebugSyncCheck />
    </div>
  );
}
