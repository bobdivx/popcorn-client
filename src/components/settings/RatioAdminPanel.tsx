import { useState, useEffect, useCallback } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { useI18n } from '../../lib/i18n/useI18n';
import { Shield, TrendingUp, RefreshCw, Zap, AlertCircle } from 'lucide-preact';
import PermissionGuard from '../ui/PermissionGuard';
import SubscriptionGuard from '../ui/SubscriptionGuard';
import DsPageHeader from '../ui/DsPageHeader';

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
  const [testSeedResult, setTestSeedResult] = useState<{
    success: boolean;
    tracker_url: string;
    uploaded_bytes: number;
    response_status: number;
    message: string;
    ratio_from_tracker?: number;
    min_ratio_required?: number;
    uploaded_from_tracker?: number;
    downloaded_from_tracker?: number;
  } | null>(null);
  const [testSeedLoading, setTestSeedLoading] = useState(false);
  const [testSeedMb, setTestSeedMb] = useState(1000);
  const [testSeedInfoHash, setTestSeedInfoHash] = useState('');
  const [testSeedTrackerUrl, setTestSeedTrackerUrl] = useState('');
  const [trackersForTorrent, setTrackersForTorrent] = useState<string[]>([]);
  const [trackersLoading, setTrackersLoading] = useState(false);
  const [trackersApiMissingKey, setTrackersApiMissingKey] = useState(false);
  const [addTrackerLoading, setAddTrackerLoading] = useState(false);
  const [addTrackerMessage, setAddTrackerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

  // Charger les trackers du torrent quand un info_hash de 40 caractères est sélectionné
  useEffect(() => {
    const hash = testSeedInfoHash.trim().toLowerCase();
    if (hash.length !== 40) {
      console.log('[Ratio] trackers: hash invalide ou vide, reset', { len: hash.length });
      setTrackersForTorrent([]);
      setTrackersApiMissingKey(false);
      setTestSeedTrackerUrl('');
      return;
    }
    console.log('[Ratio] trackers: chargement pour info_hash', hash.slice(0, 8) + '…');
    let cancelled = false;
    setTrackersLoading(true);
    serverApi.getRatioTorrentTrackers(hash).then((res) => {
      if (cancelled) {
        console.log('[Ratio] trackers: requête annulée (déjà un autre hash)');
        return;
      }
      setTrackersLoading(false);
      if (res.success && res.data) {
        const urls = res.data.tracker_urls || [];
        console.log('[Ratio] trackers: reçu', urls.length, 'URL(s)', urls);
        setTrackersForTorrent(urls);
        if (urls.length === 0) {
          setTestSeedTrackerUrl('');
          const keys = res.data.debug_librqbit_keys;
          setTrackersApiMissingKey(Array.isArray(keys) && !keys.includes('trackers'));
        } else {
          setTrackersApiMissingKey(false);
        }
      } else {
        console.log('[Ratio] trackers: échec ou pas de data', { success: res.success, message: res.message });
        setTrackersForTorrent([]);
        setTrackersApiMissingKey(false);
        setTestSeedTrackerUrl('');
      }
    }).catch((err) => {
      if (!cancelled) {
        console.warn('[Ratio] trackers: erreur réseau ou API', err);
        setTrackersLoading(false);
        setTrackersForTorrent([]);
        setTrackersApiMissingKey(false);
        setTestSeedTrackerUrl('');
      }
    });
    return () => { cancelled = true; };
  }, [testSeedInfoHash]);

  // Renseigner l'URL du tracker dès que la liste des trackers est reçue (évite race / flash)
  useEffect(() => {
    if (trackersForTorrent.length > 0) {
      const first = trackersForTorrent[0];
      console.log('[Ratio] trackers: mise à jour champ URL avec premier tracker', first?.slice(0, 60) + '…');
      setTestSeedTrackerUrl(first);
    }
  }, [trackersForTorrent]);

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

  const handleTestSeed = async () => {
    setTestSeedLoading(true);
    setTestSeedResult(null);
    setError(null);
    try {
      const res = await serverApi.postRatioTestSeed({
        uploaded_mb: testSeedMb,
        ...(testSeedInfoHash.trim() !== '' ? { info_hash: testSeedInfoHash.trim() } : {}),
        ...(testSeedTrackerUrl.trim() !== '' ? { tracker_url: testSeedTrackerUrl.trim() } : {}),
      });
      if (res.success && res.data) {
        const data = { ...res.data };
        if (
          (data.ratio_from_tracker == null || Number.isNaN(data.ratio_from_tracker)) &&
          typeof data.uploaded_from_tracker === 'number' &&
          typeof data.downloaded_from_tracker === 'number' &&
          data.downloaded_from_tracker > 0
        ) {
          data.ratio_from_tracker = data.uploaded_from_tracker / data.downloaded_from_tracker;
        }
        setTestSeedResult(data);
      } else {
        setError(res.message || t('ratioAdmin.errorTestSeed'));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTestSeedLoading(false);
    }
  };

  const handleAddTracker = async () => {
    const hash = testSeedInfoHash.trim();
    const url = testSeedTrackerUrl.trim();
    if (hash.length !== 40 || !url) return;
    setAddTrackerLoading(true);
    setAddTrackerMessage(null);
    try {
      const res = await serverApi.addClientTracker(hash, url);
      if (res.success) {
        setAddTrackerMessage({ type: 'success', text: t('ratioAdmin.addTrackerSuccess') });
        setTrackersForTorrent((prev) => (prev.includes(url) ? prev : [...prev, url]));
        setTimeout(() => setAddTrackerMessage(null), 4000);
      } else {
        setAddTrackerMessage({ type: 'error', text: res.message || res.error || t('ratioAdmin.addTrackerError') });
      }
    } catch (e) {
      setAddTrackerMessage({ type: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setAddTrackerLoading(false);
    }
  };

  return (
    <PermissionGuard permission="settings.server">
      <SubscriptionGuard>
      <div className="flex-1 py-4 px-4 sm:px-6 space-y-6 overflow-y-auto scrollbar-visible">
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

        {/* Mode tracker */}
        <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-2">
            <Shield className="w-5 h-5 text-primary-400" />
            {t('ratioAdmin.modeTitle')}
          </h3>
          <p className="text-sm text-gray-400 mb-4">{t('ratioAdmin.modeDescription')}</p>
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
        </section>

        {/* Stats ratio */}
        <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-2">
            <TrendingUp className="w-5 h-5 text-primary-400" />
            {t('ratioAdmin.statsTitle')}
          </h3>
          <p className="text-sm text-gray-400 mb-4">{t('ratioAdmin.statsDescription')}</p>
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
        </section>

        {/* Test */}
        <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-2">
            <Zap className="w-5 h-5 text-primary-400" />
            {t('ratioAdmin.testTitle')}
          </h3>
          <p className="text-sm text-gray-400 mb-4">{t('ratioAdmin.testDescription')}</p>
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
        </section>

        {/* Test seed — même format qu’une annonce client */}
        <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-2">
            <Zap className="w-5 h-5 text-primary-400" />
            {t('ratioAdmin.testSeedTitle')}
          </h3>
          <p className="text-sm text-gray-400 mb-4">{t('ratioAdmin.testSeedDescription')}</p>
          <p className="text-xs text-gray-500 mb-3">{t('ratioAdmin.testSeedHowToKnow')}</p>
          <div className="flex flex-wrap items-end gap-3 mb-3">
            <label className="form-control w-full max-w-xs">
              <span className="label-text text-gray-400">{t('ratioAdmin.testSeedQuantityLabel')}</span>
              <input
                type="number"
                min={1}
                max={10000}
                value={testSeedMb}
                onInput={(e) => {
                  const v = parseInt((e.target as HTMLInputElement).value, 10);
                  if (!Number.isNaN(v)) setTestSeedMb(Math.max(1, Math.min(10000, v)));
                }}
                className="input input-bordered w-full max-w-[140px]"
              />
            </label>
            <span className="text-sm text-gray-500">{t('ratioAdmin.testSeedQuantityUnit')}</span>
            {stats && stats.torrents.length > 0 && (
              <label className="form-control w-full max-w-md">
                <span className="label-text text-gray-400">{t('ratioAdmin.testSeedPickTorrentLabel')}</span>
                <select
                  className="select select-bordered w-full"
                  value={stats.torrents.some((t) => t.info_hash === testSeedInfoHash) ? testSeedInfoHash : ''}
                  onChange={(e) => setTestSeedInfoHash((e.target as HTMLSelectElement).value)}
                >
                  <option value="">{t('ratioAdmin.testSeedPickTorrentNone')}</option>
                  {stats.torrents.map((row) => (
                    <option key={row.info_hash} value={row.info_hash}>
                      {row.name.length > 50 ? `${row.name.slice(0, 47)}…` : row.name} ({row.info_hash.slice(0, 8)}…)
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="form-control w-full max-w-md">
              <span className="label-text text-gray-400">{t('ratioAdmin.testSeedInfoHashLabel')}</span>
              <input
                type="text"
                value={testSeedInfoHash}
                onInput={(e) => setTestSeedInfoHash((e.target as HTMLInputElement).value)}
                placeholder={t('ratioAdmin.testSeedInfoHashPlaceholder')}
                className="input input-bordered w-full font-mono text-sm"
                maxLength={40}
              />
            </label>
            {testSeedInfoHash.trim().length === 40 && (
              <label className="form-control w-full max-w-xl">
                <span className="label-text text-gray-400">{t('ratioAdmin.testSeedTrackerLabel')}</span>
                {trackersLoading ? (
                  <>
                    <select className="select select-bordered w-full font-mono text-sm" value="" disabled>
                      <option>{t('ratioAdmin.testSeedTrackersLoading')}</option>
                    </select>
                    <span className="label-text-alt text-gray-500 mt-1">{t('ratioAdmin.testSeedTrackersLoading')}</span>
                  </>
                ) : trackersForTorrent.length > 0 ? (
                  <select
                    className="select select-bordered w-full font-mono text-sm"
                    value={testSeedTrackerUrl}
                    onChange={(e) => setTestSeedTrackerUrl((e.target as HTMLSelectElement).value)}
                  >
                    <option value="">{t('ratioAdmin.testSeedTrackerNone')}</option>
                    {trackersForTorrent.map((url) => (
                      <option key={url} value={url}>
                        {url.length > 60 ? `${url.slice(0, 57)}…` : url}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-gray-500 mt-1">
                    {trackersApiMissingKey ? t('ratioAdmin.testSeedTrackersApiMissingKey') : t('ratioAdmin.testSeedTrackersNone')}
                  </p>
                )}
              </label>
            )}
            <label className="form-control w-full max-w-xl">
              <span className="label-text text-gray-400">{t('ratioAdmin.testSeedTrackerUrlManualLabel')}</span>
              <input
                type="text"
                value={testSeedTrackerUrl}
                onInput={(e) => setTestSeedTrackerUrl((e.target as HTMLInputElement).value)}
                placeholder={t('ratioAdmin.testSeedTrackerUrlManualPlaceholder')}
                className="input input-bordered w-full font-mono text-sm"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-secondary gap-2"
                onClick={handleTestSeed}
                disabled={testSeedLoading}
              >
                {testSeedLoading ? <span className="loading loading-spinner loading-sm" /> : <Zap className="w-4 h-4" />}
                {t('ratioAdmin.testSeedButton')}
              </button>
              {testSeedInfoHash.trim().length === 40 && testSeedTrackerUrl.trim() && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm gap-2"
                  onClick={handleAddTracker}
                  disabled={addTrackerLoading}
                  title={t('ratioAdmin.addTrackerButtonTitle')}
                >
                  {addTrackerLoading ? <span className="loading loading-spinner loading-sm" /> : <RefreshCw className="w-4 h-4" />}
                  {t('ratioAdmin.addTrackerButton')}
                </button>
              )}
            </div>
            {addTrackerMessage && (
              <p className={`text-sm mt-1 ${addTrackerMessage.type === 'success' ? 'text-green-400' : 'text-amber-400'}`}>
                {addTrackerMessage.text}
              </p>
            )}
          </div>
          {testSeedResult && (
            <div className={`mt-4 rounded-lg border p-4 space-y-2 text-sm ${testSeedResult.success ? 'border-green-500/40 bg-green-500/10' : 'border-amber-500/40 bg-amber-500/10'}`}>
              <p className={`font-medium flex items-center gap-2 ${testSeedResult.success ? 'text-green-400' : 'text-amber-400'}`}>
                <span className={`inline-block w-2 h-2 rounded-full ${testSeedResult.success ? 'bg-green-400' : 'bg-amber-400'}`} />
                {testSeedResult.success ? t('ratioAdmin.testSeedSuccess') : t('ratioAdmin.errorTestSeed')}
              </p>
              <p><span className="text-gray-500">{t('ratioAdmin.testSeedResponseStatus')}:</span> <span className={`font-mono ${testSeedResult.success ? 'text-green-300' : 'text-amber-300'}`}>{testSeedResult.response_status}{testSeedResult.success ? ' OK' : ''}</span></p>
              <p><span className="text-gray-500">{t('ratioAdmin.testSeedTracker')}:</span> {testSeedResult.tracker_url}</p>
              {(testSeedResult.ratio_from_tracker != null || testSeedResult.min_ratio_required != null) && (
                <p>
                  <span className="text-gray-500">{t('ratioAdmin.testSeedRatioFromTracker')}:</span>{' '}
                  <span className="font-mono">{testSeedResult.ratio_from_tracker ?? '—'}</span>
                  {testSeedResult.min_ratio_required != null && (
                    <> — {t('ratioAdmin.testSeedMinRatioRequired')}: <span className="font-mono">{testSeedResult.min_ratio_required}</span></>
                  )}
                </p>
              )}
              <p><span className="text-gray-500">{t('ratioAdmin.testSeedUploaded')}:</span> {formatBytes(testSeedResult.uploaded_bytes)}</p>
              <p><span className="text-gray-500">{t('ratioAdmin.testSeedMessage')}:</span> {testSeedResult.message}</p>
            </div>
          )}
        </section>

        {/* Liste torrents (résumée) */}
        {stats && stats.torrents.length > 0 && (
          <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6 overflow-hidden">
            <h3 className="text-lg font-semibold text-white mb-2">{t('ratioAdmin.torrentsList')}</h3>
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
          </section>
        )}
      </div>
      </SubscriptionGuard>
    </PermissionGuard>
  );
}
