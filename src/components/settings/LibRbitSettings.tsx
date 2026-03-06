import { useState, useEffect, useRef } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { clientApi } from '../../lib/client/api';
import { useI18n } from '../../lib/i18n/useI18n';
import { ExternalLink, Download, Upload, FileText, Settings, Database, X } from 'lucide-preact';

const REFRESH_STATS_MS = 5000;

function ActivityIcon(props: { className?: string; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.size ?? 20}
      height={props.size ?? 20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

export default function LibRbitSettings() {
  const { t } = useI18n();
  const [sessionStats, setSessionStats] = useState<Record<string, unknown> | null>(null);
  const [dhtStats, setDhtStats] = useState<Record<string, unknown> | null>(null);
  const [dhtTable, setDhtTable] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploadBps, setUploadBps] = useState<string>('');
  const [downloadBps, setDownloadBps] = useState<string>('');
  const [rustLog, setRustLog] = useState<string>('info');
  const [limitsSaving, setLimitsSaving] = useState(false);
  const [rustLogSaving, setRustLogSaving] = useState(false);
  const [limitsError, setLimitsError] = useState<string | null>(null);
  const [rustLogError, setRustLogError] = useState<string | null>(null);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logsConnecting, setLogsConnecting] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const logsAbortRef = useRef<AbortController | null>(null);
  const [webUiUrl, setWebUiUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      let base = '';
      try {
        const m = await import('../../lib/backend-config');
        base = (m.getBackendUrl?.() ?? '').trim();
      } catch {
        base = '';
      }
      if (!base) base = (serverApi.getServerUrl() ?? '').trim();
      base = base.replace(/\/$/, '');
      if (base) setWebUiUrl(`${base}/librqbit/web/`);
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const v = await clientApi.getLibrqbitSessionStats();
        if (!cancelled && v) setSessionStats(v);
      } catch {
        if (!cancelled) setError(t('settingsPages.librqbit.errorLoadSession'));
      }
    };
    run();
    const iv = setInterval(run, REFRESH_STATS_MS);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [t]);

  useEffect(() => {
    if (!showLogsModal) {
      logsAbortRef.current?.abort();
      logsAbortRef.current = null;
      return;
    }
    setLogLines([]);
    setLogsError(null);
    setLogsConnecting(true);
    const ctrl = new AbortController();
    logsAbortRef.current = ctrl;
    (async () => {
      try {
        const url = await clientApi.getLibrqbitStreamLogsUrl();
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) {
          setLogsError(`HTTP ${res.status}`);
          setLogsConnecting(false);
          return;
        }
        setLogsConnecting(false);
        const reader = res.body?.getReader();
        if (!reader) {
          setLogsError(t('settingsPages.librqbit.errorNoStream'));
          return;
        }
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() ?? '';
          if (lines.length) setLogLines(prev => [...prev, ...lines].slice(-2000));
        }
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return;
        setLogsError(e instanceof Error ? e.message : 'Error');
      } finally {
        setLogsConnecting(false);
        if (logsAbortRef.current === ctrl) logsAbortRef.current = null;
      }
    })();
    return () => ctrl.abort();
  }, [showLogsModal, t]);

  const handleSaveLimits = async () => {
    setLimitsError(null);
    setLimitsSaving(true);
    try {
      const up = uploadBps.trim() ? parseInt(uploadBps.trim(), 10) : undefined;
      const down = downloadBps.trim() ? parseInt(downloadBps.trim(), 10) : undefined;
      if ((up !== undefined && (isNaN(up) || up < 0)) || (down !== undefined && (isNaN(down) || down < 0))) {
        setLimitsError(t('settingsPages.librqbit.errorInvalidValues'));
        return;
      }
      await clientApi.postLibrqbitLimits(up, down);
    } catch (e) {
      setLimitsError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLimitsSaving(false);
    }
  };

  const handleSaveRustLog = async () => {
    setRustLogError(null);
    setRustLogSaving(true);
    try {
      await clientApi.postLibrqbitRustLog(rustLog.trim() || 'info');
    } catch (e) {
      setRustLogError(e instanceof Error ? e.message : 'Error');
    } finally {
      setRustLogSaving(false);
    }
  };

  const loadDhtStats = async () => {
    const v = await clientApi.getLibrqbitDhtStats();
    setDhtStats(v ?? null);
  };

  const loadDhtTable = async () => {
    const v = await clientApi.getLibrqbitDhtTable();
    setDhtTable(v ?? null);
  };

  const down = (sessionStats?.download_speed as { human_readable?: string } | undefined)?.human_readable;
  const up = (sessionStats?.upload_speed as { human_readable?: string } | undefined)?.human_readable;
  const uptime = typeof sessionStats?.uptime_seconds === 'number' ? (sessionStats.uptime_seconds as number) : null;
  const uptimeMin = uptime != null ? Math.floor(uptime / 60) : 0;

  const sectionCard = 'rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-5 md:p-6 transition-colors hover:border-white/15';
  const sectionTitle = 'text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4 flex items-center gap-2';
  const inputBase = 'w-full sm:w-36 rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-white text-sm focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all';
  const btnPrimary = 'rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors';
  const btnSecondary = 'rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm text-gray-300 hover:bg-white/10 transition-colors';

  return (
    <div className="space-y-4 sm:space-y-6">
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200 text-sm" role="alert">
          {error}
        </div>
      )}

      {/* Web UI - Hero CTA */}
      {webUiUrl && (
        <section className={`${sectionCard} bg-gradient-to-br from-cyan-500/5 to-transparent`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h3 className={`${sectionTitle} text-cyan-400`}>
                <ExternalLink className="h-5 w-5 flex-shrink-0" size={20} />
                {t('settingsPages.librqbit.webUiCta')}
              </h3>
              <p className="text-sm text-gray-400">
                {t('settingsPages.librqbit.webUiDescription')}
              </p>
            </div>
            <a
              href={webUiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-500/50 bg-cyan-500/10 px-4 py-3 text-sm font-medium text-cyan-300 hover:bg-cyan-500/20 transition-colors flex-shrink-0"
            >
              <ExternalLink className="h-4 w-4" size={16} />
              {t('settingsPages.librqbit.openInNewTab')}
            </a>
          </div>
        </section>
      )}

      {/* Stats session */}
      <section className={sectionCard}>
        <h3 className={sectionTitle}>
          <ActivityIcon className="h-5 w-5 text-cyan-400 flex-shrink-0" size={20} />
          {t('settingsPages.librqbit.sessionStats')}
        </h3>
        <div className="flex flex-wrap gap-4 sm:gap-6 text-sm">
          {down != null && (
            <span className="flex items-center gap-1.5 text-gray-300">
              <Download className="h-4 w-4 text-blue-400 flex-shrink-0" size={16} />
              <span className="truncate">↓ {down}</span>
            </span>
          )}
          {up != null && (
            <span className="flex items-center gap-1.5 text-gray-300">
              <Upload className="h-4 w-4 text-green-400 flex-shrink-0" size={16} />
              <span className="truncate">↑ {up}</span>
            </span>
          )}
          {uptime != null && (
            <span className="text-gray-400">
              {t('settingsPages.librqbit.uptime')}: {t('settingsPages.librqbit.uptimeMinutes', { min: uptimeMin })}
            </span>
          )}
          {!sessionStats && !error && (
            <span className="text-gray-500">{t('settingsPages.librqbit.loading')}</span>
          )}
        </div>
      </section>

      {/* Limites + RUST_LOG - Grid responsive */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Limites */}
        <section className={sectionCard}>
          <h3 className={sectionTitle}>
            <Settings className="h-5 w-5 text-amber-400 flex-shrink-0" size={20} />
            {t('settingsPages.librqbit.limits')}
          </h3>
          <p className="text-xs text-gray-500 mb-3">{t('settingsPages.librqbit.limitsHint')}</p>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-4">
            <div className="flex-1 min-w-[120px]">
              <label className="block text-xs text-gray-400 mb-1">{t('settingsPages.librqbit.limitsUploadLabel')}</label>
              <input
                type="number"
                min={0}
                value={uploadBps}
                onInput={e => setUploadBps((e.target as HTMLInputElement).value)}
                className={inputBase}
                placeholder={t('settingsPages.librqbit.limitsOptional')}
                aria-label={t('settingsPages.librqbit.limitsUploadLabel')}
              />
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="block text-xs text-gray-400 mb-1">{t('settingsPages.librqbit.limitsDownloadLabel')}</label>
              <input
                type="number"
                min={0}
                value={downloadBps}
                onInput={e => setDownloadBps((e.target as HTMLInputElement).value)}
                className={inputBase}
                placeholder={t('settingsPages.librqbit.limitsOptional')}
                aria-label={t('settingsPages.librqbit.limitsDownloadLabel')}
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleSaveLimits}
                disabled={limitsSaving}
                className={`${btnPrimary} w-full sm:w-auto`}
              >
                {limitsSaving ? '…' : t('common.apply')}
              </button>
            </div>
          </div>
          {limitsError && <p className="mt-2 text-sm text-red-400" role="alert">{limitsError}</p>}
        </section>

        {/* RUST_LOG */}
        <section className={sectionCard}>
          <h3 className={sectionTitle}>
            <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" size={20} />
            {t('settingsPages.librqbit.rustLog')}
          </h3>
          <p className="text-xs text-gray-500 mb-3">{t('settingsPages.librqbit.rustLogHint')}</p>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <input
              type="text"
              value={rustLog}
              onInput={e => setRustLog((e.target as HTMLInputElement).value)}
              className={`${inputBase} flex-1 min-w-0`}
              placeholder={t('settingsPages.librqbit.rustLogPlaceholder')}
              aria-label={t('settingsPages.librqbit.rustLog')}
            />
            <button
              onClick={handleSaveRustLog}
              disabled={rustLogSaving}
              className={`${btnPrimary} w-full sm:w-auto flex-shrink-0`}
            >
              {rustLogSaving ? '…' : t('common.apply')}
            </button>
          </div>
          {rustLogError && <p className="mt-2 text-sm text-red-400" role="alert">{rustLogError}</p>}
        </section>
      </div>

      {/* Logs + DHT - Grid responsive */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Logs */}
        <section className={sectionCard}>
          <h3 className={sectionTitle}>
            <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" size={20} />
            {t('settingsPages.librqbit.logs')}
          </h3>
          <button
            onClick={() => setShowLogsModal(true)}
            className={btnSecondary}
          >
            {t('settingsPages.librqbit.viewLogs')}
          </button>
        </section>

        {/* DHT */}
        <section className={sectionCard}>
          <h3 className={sectionTitle}>
            <Database className="h-5 w-5 text-purple-400 flex-shrink-0" size={20} />
            {t('settingsPages.librqbit.dht')}
          </h3>
          <div className="flex flex-wrap gap-2">
            <button onClick={loadDhtStats} className={btnSecondary}>
              {t('settingsPages.librqbit.dhtStats')}
            </button>
            <button onClick={loadDhtTable} className={btnSecondary}>
              {t('settingsPages.librqbit.dhtTable')}
            </button>
          </div>
          {(dhtStats != null || dhtTable != null) && (
            <pre className="mt-4 overflow-auto max-h-48 rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-gray-300 whitespace-pre-wrap font-mono">
              {JSON.stringify(dhtStats ?? dhtTable, null, 2)}
            </pre>
          )}
        </section>
      </div>

      {/* Modal Logs */}
      {showLogsModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={e => e.target === e.currentTarget && setShowLogsModal(false)}
          onKeyDown={e => (e.key === 'Escape' || e.key === 'Backspace') && setShowLogsModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="logs-modal-title"
        >
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-6 max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 id="logs-modal-title" className="text-lg font-semibold text-white">
                {t('settingsPages.librqbit.logs')}
              </h3>
              <button
                onClick={() => setShowLogsModal(false)}
                className="text-gray-400 hover:text-white p-1 rounded focus:ring-2 focus:ring-cyan-500 focus:outline-none transition-colors"
                aria-label={t('settingsPages.librqbit.logsClose')}
              >
                <X className="h-5 w-5" size={20} />
              </button>
            </div>
            {logsConnecting && logLines.length === 0 ? (
              <p className="text-gray-400 py-8 text-center">{t('settingsPages.librqbit.logsConnecting')}</p>
            ) : logsError ? (
              <p className="text-red-400 py-4">{logsError}</p>
            ) : (
              <pre className="flex-1 overflow-auto rounded-lg border border-white/10 bg-black/30 p-4 text-xs text-gray-300 whitespace-pre-wrap font-mono min-h-[200px]">
                {logLines.length === 0 && !logsConnecting ? t('settingsPages.librqbit.logsEmpty') : logLines.join('\n')}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
