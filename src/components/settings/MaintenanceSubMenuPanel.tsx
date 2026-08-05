import { Wrench, Sliders, Activity, FileText, Power, Server, ShieldAlert, Database } from 'lucide-preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import { serverApi } from '../../lib/client/server-api';
import ResourceMonitorDev from './ResourceMonitorDev';
import { SettingsNavCard } from './SettingsNavCard';
import { SettingsSubPageFrame } from './SettingsSubPageFrame';
import { useConfirmDialog } from '../ui/useConfirmDialog';

const BASE_URL = '/settings/maintenance/';

const MIN_MAX_TRANSCODINGS = 1;
const MAX_MAX_TRANSCODINGS = 16;

const MAINTENANCE_SUBS = ['forceCleanup', 'transcodingConfig', 'restartBackend', 'hardReset', 'repairApp', 'resources', 'logs', 'tmdbCoverage'] as const;
type MaintenanceSub = (typeof MAINTENANCE_SUBS)[number];

function getSubFromUrl(): MaintenanceSub | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const sub = params.get('sub');
  return MAINTENANCE_SUBS.includes(sub as MaintenanceSub) ? (sub as MaintenanceSub) : null;
}

function ServerLogsSection({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const [lines, setLines] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const preRef = useRef<HTMLPreElement>(null);

  const fetchLogs = async () => {
    try {
      const res = await serverApi.getServerLogs({ limit: 500 });
      if (res.success && res.data) {
        setLines(res.data.lines);
        setError(null);
      } else {
        setError(res.message || t('errors.generic'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    if (paused) return;
    const interval = setInterval(fetchLogs, 3000);
    return () => clearInterval(interval);
  }, [paused]);

  useEffect(() => {
    if (preRef.current && lines.length) {
      preRef.current.scrollTop = preRef.current.scrollHeight;
    }
  }, [lines]);

  const content = (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-sm ds-text-tertiary">{t('settingsMenu.maintenance.serverLogs.description')}</span>
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          className="btn btn-sm btn-ghost"
          data-focusable
          tabIndex={0}
        >
          {paused ? t('settingsMenu.maintenance.serverLogs.resume') : t('settingsMenu.maintenance.serverLogs.pause')}
        </button>
        <button type="button" onClick={() => fetchLogs()} className="btn btn-sm btn-ghost" data-focusable tabIndex={0}>
          {t('common.refresh')}
        </button>
      </div>
      {error && <p className="text-sm text-red-400 mb-2">{error}</p>}
      <pre
        ref={preRef}
        className="bg-[var(--ds-surface)] border border-[var(--ds-border)] rounded-lg p-3 text-xs font-mono text-left overflow-auto max-h-[60vh] min-h-[200px] whitespace-pre-wrap break-all"
        role="log"
        aria-label={t('settingsMenu.maintenance.serverLogs.title')}
      >
        {loading && lines.length === 0 ? t('common.loading') : lines.join('\n') || t('settingsMenu.maintenance.serverLogs.empty')}
      </pre>
    </>
  );

  if (embedded) return <div className="min-w-0">{content}</div>;
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
        <FileText className="w-5 h-5 text-primary-400" />
        {t('settingsMenu.maintenance.serverLogs.title')}
      </h3>
      {content}
    </section>
  );
}

function ForceCleanupSection({ embedded = false }: { embedded?: boolean }) {
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

  const content = (
    <>
      <p className="text-sm ds-text-secondary mb-4">{t('settingsMenu.maintenance.forceCleanup.description')}</p>
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
    </>
  );

  if (embedded) return <div className="min-w-0">{content}</div>;
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
        <Wrench className="w-5 h-5 text-primary-400" />
        {t('settingsMenu.maintenance.forceCleanup.title')}
      </h3>
      {content}
    </section>
  );
}

function TranscodingConfigSection({ embedded = false }: { embedded?: boolean }) {
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

  const content = (
    <>
      <p className="text-sm ds-text-secondary mb-4">
        {t('settingsMenu.maintenance.transcodingConfig.description')}
      </p>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <label htmlFor="max-transcodings" className="text-sm text-[var(--ds-text-secondary)]">
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
            className="w-20 rounded-lg bg-[var(--ds-surface)] border-[var(--ds-border)] text-[var(--ds-text-primary)] px-3 py-2 text-sm"
            disabled={fetching}
          />
          <span className="text-xs ds-text-tertiary">
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
    </>
  );

  if (embedded) return <div className="min-w-0">{content}</div>;
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
        <Sliders className="w-5 h-5 text-primary-400" />
        {t('settingsMenu.maintenance.transcodingConfig.title')}
      </h3>
      {content}
    </section>
  );
}

function RestartBackendSection({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleRestart = async () => {
    if (loading) return;
    setMessage(null);
    if (
      !(await confirm({
        title: t('settingsMenu.maintenance.restartBackend.title') || 'Redémarrer',
        message: t('settingsMenu.maintenance.restartBackend.confirm'),
        danger: true,
      }))
    ) {
      return;
    }
    setLoading(true);
    try {
      const res = await serverApi.restartBackend();
      if (!res.success) {
        setMessage({ type: 'error', text: res.message || t('errors.generic') });
        return;
      }
      setMessage({ type: 'success', text: t('settingsMenu.maintenance.restartBackend.success') });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('errors.generic') });
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <>
      {!embedded && (
        <p className="text-sm ds-text-secondary mb-4">{t('settingsMenu.maintenance.restartBackend.description')}</p>
      )}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleRestart}
          disabled={loading}
          className="btn btn-primary self-start disabled:opacity-60 disabled:cursor-not-allowed"
          data-focusable
          tabIndex={0}
        >
          {loading ? t('common.loading') : t('settingsMenu.maintenance.restartBackend.action')}
        </button>
        {message && (
          <p className={`text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`} role="status">
            {message.text}
          </p>
        )}
      </div>
    </>
  );

  if (embedded)
    return (
      <div className="min-w-0">
        {content}
        {confirmDialog}
      </div>
    );
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
        <Power className="w-5 h-5 text-primary-400" />
        {t('settingsMenu.maintenance.restartBackend.title')}
      </h3>
      {content}
      {confirmDialog}
    </section>
  );
}

function HardResetSection({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleHardReset = async () => {
    if (loading) return;
    if (
      !(await confirm({
        title: t('versionInfo.hardReset') || 'Hard reset',
        message: t('versionInfo.hardResetConfirm'),
        danger: true,
        confirmLabel: t('common.confirm') || 'Confirmer',
      }))
    ) {
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const resetRes = await serverApi.resetBackendDatabase();
      if (!resetRes.success) {
        throw new Error(resetRes.message || t('errors.generic'));
      }
      setMessage({ type: 'success', text: t('versionInfo.hardResetInProgress') });
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : t('errors.generic'),
      });
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <>
      {!embedded && (
        <p className="text-sm ds-text-secondary mb-4">{t('versionInfo.hardResetDescription')}</p>
      )}
      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleHardReset}
          disabled={loading}
          className="btn btn-primary self-start disabled:opacity-60 disabled:cursor-not-allowed"
          data-focusable
          tabIndex={0}
        >
          {loading ? t('versionInfo.hardResetInProgress') : t('versionInfo.hardResetAction')}
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
    </>
  );

  if (embedded)
    return (
      <div className="min-w-0">
        {content}
        {confirmDialog}
      </div>
    );
  return (
    <section className="rounded-xl border border-red-900/30 bg-white/5 overflow-hidden">
      <div className="p-4 sm:p-6">
        <p className="text-sm font-semibold text-red-300 mb-2">{t('versionInfo.hardResetTitle')}</p>
        {content}
      </div>
      {confirmDialog}
    </section>
  );
}

function RepairAppSection({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [createBackup, setCreateBackup] = useState(true);
  const [runScan, setRunScan] = useState(true);
  const [confirmValue, setConfirmValue] = useState('');
  const [preview, setPreview] = useState<import('../../lib/client/server-api/system').RepairDatabaseResponse | null>(null);
  const [result, setResult] = useState<import('../../lib/client/server-api/system').RepairDatabaseResponse | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handlePreview = async () => {
    if (previewLoading || runLoading) return;
    setPreviewLoading(true);
    setMessage(null);
    try {
      const res = await serverApi.repairDatabase({ dry_run: true });
      if (!res.success || !res.data) {
        setMessage({ type: 'error', text: res.message || t('errors.generic') });
        return;
      }
      setPreview(res.data);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('errors.generic') });
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleRun = async () => {
    if (runLoading || previewLoading) return;
    if (confirmValue.trim() !== 'REPAIR_NOW') {
      setMessage({ type: 'error', text: t('settingsMenu.maintenance.repairApp.confirmError') });
      return;
    }
    setRunLoading(true);
    setMessage(null);
    try {
      const res = await serverApi.repairDatabase({
        dry_run: false,
        create_backup: createBackup,
        run_library_scan: runScan,
        enrich_existing: true,
        confirm_phrase: 'REPAIR_NOW',
      });
      if (!res.success || !res.data) {
        setMessage({ type: 'error', text: res.message || t('errors.generic') });
        return;
      }
      setResult(res.data);
      setMessage({ type: 'success', text: t('settingsMenu.maintenance.repairApp.runSuccess') });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('errors.generic') });
    } finally {
      setRunLoading(false);
    }
  };

  const tableEntries = Object.entries(preview?.preview?.table_counts || {});
  const resultEntries = Object.entries(result?.run_result?.deleted_rows_by_table || {});
  const seedDiagnostic = result?.seed_diagnostic ?? preview?.seed_diagnostic ?? null;

  const content = (
    <>
      <p className="text-sm ds-text-secondary mb-4">{t('settingsMenu.maintenance.repairApp.description')}</p>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 mb-4">
        {t('settingsMenu.maintenance.repairApp.warning')}
      </div>

      <div className="flex flex-col gap-3 mb-4">
        <label className="inline-flex items-center gap-2 text-sm text-white/90">
          <input type="checkbox" checked={createBackup} onChange={(e) => setCreateBackup((e.target as HTMLInputElement).checked)} />
          {t('settingsMenu.maintenance.repairApp.createBackup')}
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-white/90">
          <input type="checkbox" checked={runScan} onChange={(e) => setRunScan((e.target as HTMLInputElement).checked)} />
          {t('settingsMenu.maintenance.repairApp.runLibraryScan')}
        </label>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button type="button" className="btn btn-ghost" onClick={handlePreview} disabled={previewLoading || runLoading}>
          {previewLoading ? t('common.loading') : t('settingsMenu.maintenance.repairApp.previewAction')}
        </button>
      </div>

      {preview && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-3 mb-4">
          <p className="text-sm text-white font-medium mb-2">
            {t('settingsMenu.maintenance.repairApp.previewTotal', { count: preview.preview.total_rows })}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-white/70">
            {tableEntries.map(([table, count]) => (
              <div key={table} className="flex justify-between gap-2">
                <span className="font-mono">{table}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-red-900/40 bg-red-900/10 p-3 mb-3">
        <label className="block text-sm text-red-200 mb-2">
          {t('settingsMenu.maintenance.repairApp.confirmLabel')}
        </label>
        <input
          type="text"
          value={confirmValue}
          onInput={(e) => setConfirmValue((e.target as HTMLInputElement).value)}
          placeholder="REPAIR_NOW"
          className="w-full rounded-lg bg-[var(--ds-surface)] border border-red-900/50 text-white px-3 py-2 text-sm"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" onClick={handleRun} disabled={runLoading || previewLoading}>
          {runLoading ? t('common.loading') : t('settingsMenu.maintenance.repairApp.runAction')}
        </button>
      </div>

      {message && (
        <p className={`mt-3 text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`} role="status">
          {message.text}
        </p>
      )}

      {result && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-3 mt-4 text-xs text-white/70">
          <p className="text-sm text-white mb-2">
            {t('settingsMenu.maintenance.repairApp.resultDeleted', { count: result.run_result?.total_deleted_rows ?? 0 })}
          </p>
          {result.run_result?.backup_path && (
            <p className="mb-2">
              {t('settingsMenu.maintenance.repairApp.backupPath')}: <span className="font-mono">{result.run_result.backup_path}</span>
            </p>
          )}
          {result.scanned_local_media != null && (
            <p className="mb-2">{t('settingsMenu.maintenance.repairApp.scannedCount', { count: result.scanned_local_media })}</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {resultEntries.map(([table, count]) => (
              <div key={table} className="flex justify-between gap-2">
                <span className="font-mono">{table}</span>
                <span>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {seedDiagnostic && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3 mt-4 text-xs text-cyan-100">
          <p className="text-sm font-medium text-white mb-2">
            {t('settingsMenu.maintenance.repairApp.seedTitle')}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mb-2">
            <div>
              {t('settingsMenu.maintenance.repairApp.seedLibrqbit')}: {seedDiagnostic.librqbit_ok ? t('common.yes') : t('common.no')}
            </div>
            <div>
              {t('settingsMenu.maintenance.repairApp.seedRatioMode')}: {seedDiagnostic.ratio_mode_enabled ? t('common.yes') : t('common.no')}
            </div>
            <div>
              {t('settingsMenu.maintenance.repairApp.seedUpnp')}: {seedDiagnostic.upnp_enabled ? t('common.yes') : t('common.no')}
            </div>
            <div>
              {t('settingsMenu.maintenance.repairApp.seedPort')}: {seedDiagnostic.listen_port ?? '—'}
            </div>
            <div>
              {t('settingsMenu.maintenance.repairApp.seedActiveTorrents')}: {seedDiagnostic.active_torrents}
            </div>
            <div>
              {t('settingsMenu.maintenance.repairApp.seedSeedingTorrents')}: {seedDiagnostic.seeding_torrents}
            </div>
          </div>
          {seedDiagnostic.warnings.length > 0 && (
            <ul className="list-disc pl-5 space-y-1 text-amber-200">
              {seedDiagnostic.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );

  if (embedded) return <div className="min-w-0">{content}</div>;
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
        <ShieldAlert className="w-5 h-5 text-amber-300" />
        {t('settingsMenu.maintenance.repairApp.title')}
      </h3>
      {content}
    </section>
  );
}

function TmdbCoverageSection({ embedded = false }: { embedded?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<import('../../lib/client/server-api/system').TmdbCoverageResponse | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await serverApi.getTmdbCoverageStats();
      if (!res.success || !res.data) {
        setError(res.message || 'Impossible de charger les stats TMDB');
        return;
      }
      setData(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les stats TMDB');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const fmtPct = (v: number) => `${v.toFixed(1)}%`;
  const content = (
    <>
      <p className="text-sm ds-text-secondary mb-4">
        Vérifie la fiabilité réelle du matching TMDB par indexer (incluant C411).
      </p>
      <div className="flex items-center gap-2 mb-4">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()} data-focusable tabIndex={0}>
          Rafraîchir
        </button>
      </div>
      {loading && <p className="text-sm ds-text-tertiary">Chargement...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {data && !loading && (
        <div className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
            <div className="text-white font-medium">Couverture globale TMDB</div>
            <div className="text-white/80 mt-1">
              {data.global_with_tmdb}/{data.global_total} ({fmtPct(data.global_tmdb_rate_percent)})
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 divide-y divide-white/10">
            {data.indexers.map((row) => {
              const isC411 = row.indexer_name.toLowerCase().includes('c411');
              return (
                <div key={row.indexer_name} className={`p-3 text-xs sm:text-sm ${isC411 ? 'bg-indigo-500/10' : ''}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`font-semibold ${isC411 ? 'text-indigo-300' : 'text-white'}`}>{row.indexer_name}</span>
                    <span className="text-white/80">{row.with_tmdb}/{row.total_torrents} ({fmtPct(row.tmdb_rate_percent)})</span>
                  </div>
                  <div className="text-white/60">
                    indexer: {row.tmdb_from_indexer} · api: {row.tmdb_from_api} · cache cloud: {row.tmdb_from_cache_cloud} · cache local: {row.tmdb_from_cache_local}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );

  if (embedded) return <div className="min-w-0">{content}</div>;
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
        <Database className="w-5 h-5 text-primary-400" />
        Couverture TMDB par indexer
      </h3>
      {content}
    </section>
  );
}

type MaintenanceItem = {
  id: MaintenanceSub;
  titleKey: string;
  descriptionKey: string;
  icon: typeof Wrench;
};

const MAINTENANCE_ITEMS: MaintenanceItem[] = [
  { id: 'forceCleanup', titleKey: 'settingsMenu.maintenance.forceCleanup.title', descriptionKey: 'settingsMenu.maintenance.forceCleanup.description', icon: Wrench },
  { id: 'transcodingConfig', titleKey: 'settingsMenu.maintenance.transcodingConfig.title', descriptionKey: 'settingsMenu.maintenance.transcodingConfig.description', icon: Sliders },
  { id: 'restartBackend', titleKey: 'settingsMenu.maintenance.restartBackend.title', descriptionKey: 'settingsMenu.maintenance.restartBackend.description', icon: Power },
  { id: 'hardReset', titleKey: 'versionInfo.hardResetTitle', descriptionKey: 'versionInfo.hardResetDescription', icon: Power },
  { id: 'repairApp', titleKey: 'settingsMenu.maintenance.repairApp.title', descriptionKey: 'settingsMenu.maintenance.repairApp.description', icon: ShieldAlert },
  { id: 'tmdbCoverage', titleKey: 'Couverture TMDB', descriptionKey: 'Audit de fiabilité TMDB par indexer', icon: Database },
  { id: 'resources', titleKey: 'settingsMenu.maintenance.resources.title', descriptionKey: 'settingsMenu.maintenance.resources.description', icon: Activity },
  { id: 'logs', titleKey: 'settingsMenu.maintenance.serverLogs.title', descriptionKey: 'settingsMenu.maintenance.serverLogs.description', icon: FileText },
];


export default function MaintenanceSubMenuPanel() {
  const { t } = useI18n();
  const [sub, setSub] = useState<MaintenanceSub | null>(getSubFromUrl);

  useEffect(() => {
    setSub(getSubFromUrl());
  }, []);

  useEffect(() => {
    const update = () => setSub(getSubFromUrl());
    window.addEventListener('popstate', update);
    document.addEventListener('astro:page-load', update);
    return () => {
      window.removeEventListener('popstate', update);
      document.removeEventListener('astro:page-load', update);
    };
  }, []);

  if (!canAccess('settings.server' as any)) return null;

  if (sub) {
    const item = MAINTENANCE_ITEMS.find((i) => i.id === sub)!;
    if (sub === 'forceCleanup') return <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}><ForceCleanupSection embedded /></SettingsSubPageFrame>;
    if (sub === 'transcodingConfig') return <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}><TranscodingConfigSection embedded /></SettingsSubPageFrame>;
    if (sub === 'restartBackend') return <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}><RestartBackendSection embedded /></SettingsSubPageFrame>;
    if (sub === 'hardReset') return <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}><HardResetSection embedded /></SettingsSubPageFrame>;
    if (sub === 'repairApp') return <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}><RepairAppSection embedded /></SettingsSubPageFrame>;
    if (sub === 'tmdbCoverage') return <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={'Couverture TMDB'} description={'Audit de fiabilité TMDB par indexer'}><TmdbCoverageSection embedded /></SettingsSubPageFrame>;
    if (sub === 'resources') return <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}><ResourceMonitorDev embedded /></SettingsSubPageFrame>;
    if (sub === 'logs') return <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}><ServerLogsSection embedded /></SettingsSubPageFrame>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
      {MAINTENANCE_ITEMS.map((item) => (
        <SettingsNavCard
          key={item.id}
          href={`${BASE_URL}?sub=${item.id}`}
          icon={item.icon}
          title={item.id === 'tmdbCoverage' ? 'Couverture TMDB' : t(item.titleKey)}
          description={item.id === 'tmdbCoverage' ? 'Audit de fiabilité TMDB par indexer' : t(item.descriptionKey)}
        />
      ))}
      <SettingsNavCard
        href="/settings/server"
        icon={Server}
        title={t('serverSettings.title')}
        description={t('serverSettings.storageInfo')}
      />
    </div>
  );
}
