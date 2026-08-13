import { useState, useEffect, useCallback } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { useI18n } from '../../lib/i18n/useI18n';
import { Shield, TrendingUp, RefreshCw, Zap, AlertCircle } from 'lucide-preact';
import PermissionGuard from '../ui/PermissionGuard';
import SubscriptionGuard from '../ui/SubscriptionGuard';
import DsPageHeader from '../ui/DsPageHeader';
import RatioBoostWizard from './RatioBoostWizard';
import { SettingsCard } from './SettingsCard';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatRatio(r: number): string {
  if (Number.isNaN(r) || !Number.isFinite(r)) return '—';
  return r.toFixed(2);
}

export default function RatioAdminPanel() {
  const { t } = useI18n();
  const [config, setConfig] = useState<{ mode_enabled: boolean; source: string } | null>(null);
  const [stats, setStats] = useState<{
    total_uploaded_bytes: number;
    total_downloaded_bytes: number;
    ratio: number;
    torrent_count: number;
    seeding_count: number;
    torrents: Array<{
      info_hash: string;
      name: string;
      state: string;
      progress: number;
      uploaded_bytes: number;
      downloaded_bytes: number;
      ratio: number;
    }>;
  } | null>(null);
  const [testResult, setTestResult] = useState<{
    mode_enabled: boolean;
    librqbit_ok: boolean;
    torrent_count: number;
    message: string;
  } | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [savingTxAlt, setSavingTxAlt] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    setError(null);
    try {
      const res = await serverApi.getRatioConfig();
      if (res.success && res.data) setConfig(res.data);
      else setError(res.message || t('ratioAdmin.errorLoad'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingConfig(false);
    }
  }, [t]);

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    setError(null);
    try {
      const res = await serverApi.getRatioStats();
      if (res.success && res.data) setStats(res.data);
      else if (!res.success) setError(res.message || t('ratioAdmin.errorLoad'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingStats(false);
    }
  }, [t]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);
  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const handleToggleTxAlt = async () => {
    if (!config) return;
    setSavingTxAlt(true);
    setError(null);
    try {
      const res = await serverApi.updateRatioConfig(!config.mode_enabled);
      if (res.success && res.data) {
        setConfig(res.data);
      } else {
        setError(res.message || t('ratioAdmin.errorSave'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingTxAlt(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const res = await serverApi.postRatioTest();
      if (res.success && res.data) setTestResult(res.data);
      else setError(res.message || t('ratioAdmin.errorTest'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };

  return (
    <PermissionGuard permission="settings.server">
      <SubscriptionGuard>
      <div className="flex-1 py-4 px-4 sm:px-6 sc-stack overflow-y-auto scrollbar-visible">
        <DsPageHeader
          titleKey="ratioAdmin.title"
          subtitleKey="ratioAdmin.subtitle"
        />

        {error && (
          <div className="rounded-xl border border-red-500/50 bg-red-500/10 p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-200">{error}</p>
          </div>
        )}

        <RatioBoostWizard />

        {/* Mode tracker */}
        <SettingsCard icon={Shield} title={t('ratioAdmin.modeTitle')} description={t('ratioAdmin.modeDescription')}>
          {loadingConfig ? (
            <span className="loading loading-spinner loading-sm text-primary-400" />
          ) : config ? (
            <div className="flex flex-wrap items-center gap-4">
              <label className="label cursor-pointer gap-2">
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={config.mode_enabled}
                  disabled={savingTxAlt}
                  onChange={handleToggleTxAlt}
                />
                <span className="label-text text-white">
                  {config.mode_enabled ? t('ratioAdmin.modeOn') : t('ratioAdmin.modeOff')}
                </span>
              </label>
              <span className="text-xs text-gray-500">
                ({t('ratioAdmin.source')}: {config.source})
              </span>
              {savingTxAlt && <span className="loading loading-spinner loading-xs" />}
            </div>
          ) : null}
        </SettingsCard>

        {/* Stats ratio */}
        <SettingsCard icon={TrendingUp} title={t('ratioAdmin.statsTitle')} description={t('ratioAdmin.statsDescription')}>
          {loadingStats ? (
            <span className="loading loading-spinner loading-sm text-primary-400" />
          ) : stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-xs text-gray-500 uppercase">{t('ratioAdmin.totalUpload')}</p>
                <p className="text-lg font-mono text-green-400">{formatBytes(stats.total_uploaded_bytes)}</p>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-xs text-gray-500 uppercase">{t('ratioAdmin.totalDownload')}</p>
                <p className="text-lg font-mono text-blue-400">{formatBytes(stats.total_downloaded_bytes)}</p>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-xs text-gray-500 uppercase">{t('ratioAdmin.ratio')}</p>
                <p className="text-lg font-mono text-white">{formatRatio(stats.ratio)}</p>
              </div>
              <div className="rounded-lg bg-white/5 p-3">
                <p className="text-xs text-gray-500 uppercase">{t('ratioAdmin.seedingCount')}</p>
                <p className="text-lg font-mono text-white">{stats.seeding_count} / {stats.torrent_count}</p>
              </div>
            </div>
          ) : null}
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-2"
            onClick={loadStats}
            disabled={loadingStats}
          >
            <RefreshCw className={`w-4 h-4 ${loadingStats ? 'animate-spin' : ''}`} />
            {t('ratioAdmin.refreshStats')}
          </button>
        </SettingsCard>

        {/* Test */}
        <SettingsCard icon={Zap} title={t('ratioAdmin.testTitle')} description={t('ratioAdmin.testDescription')}>
          <button
            type="button"
            className="btn btn-primary gap-2"
            onClick={handleTest}
            disabled={testing}
          >
            {testing ? <span className="loading loading-spinner loading-sm" /> : <Zap className="w-4 h-4" />}
            {t('ratioAdmin.runTest')}
          </button>
          {testResult && (
            <div className="mt-4 rounded-lg bg-white/5 p-4 space-y-2 text-sm">
              <p><span className="text-gray-500">{t('ratioAdmin.testMode')}:</span> {testResult.mode_enabled ? t('ratioAdmin.modeOn') : t('ratioAdmin.modeOff')}</p>
              <p><span className="text-gray-500">{t('ratioAdmin.testLibrqbit')}:</span> {testResult.librqbit_ok ? t('ratioAdmin.ok') : t('ratioAdmin.failed')}</p>
              <p><span className="text-gray-500">{t('ratioAdmin.testTorrents')}:</span> {testResult.torrent_count}</p>
              <p><span className="text-gray-500">{t('ratioAdmin.testMessage')}:</span> {testResult.message}</p>
            </div>
          )}
        </SettingsCard>

        {/* Liste torrents (résumée) */}
        {stats && stats.torrents.length > 0 && (
          <SettingsCard title={t('ratioAdmin.torrentsList')} className="overflow-hidden">
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="table table-zebra table-pin-rows table-xs">
                <thead>
                  <tr>
                    <th>{t('ratioAdmin.colName')}</th>
                    <th>{t('ratioAdmin.colState')}</th>
                    <th>{t('ratioAdmin.colUpload')}</th>
                    <th>{t('ratioAdmin.colDownload')}</th>
                    <th>{t('ratioAdmin.colRatio')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.torrents.map((row) => (
                    <tr key={row.info_hash}>
                      <td className="max-w-[200px] truncate" title={row.name}>{row.name}</td>
                      <td>{row.state}</td>
                      <td className="font-mono text-green-400">{formatBytes(row.uploaded_bytes)}</td>
                      <td className="font-mono text-blue-400">{formatBytes(row.downloaded_bytes)}</td>
                      <td className="font-mono">{formatRatio(row.ratio)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SettingsCard>
        )}
      </div>
      </SubscriptionGuard>
    </PermissionGuard>
  );
}
