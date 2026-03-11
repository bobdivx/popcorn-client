import { Wrench, Sliders, Activity, ChevronRight, ArrowLeft, FileText, Power, Server } from 'lucide-preact';
import { useState, useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import { serverApi } from '../../lib/client/server-api';
import { DsCard, DsCardSection } from '../ui/design-system';
import ResourceMonitorDev from './ResourceMonitorDev';

const BASE_URL = '/settings/maintenance/';
const ACCENT_ICON_BG = 'var(--ds-accent-violet-muted)';
const ACCENT_ICON_COLOR = 'var(--ds-accent-violet)';

const MIN_MAX_TRANSCODINGS = 1;
const MAX_MAX_TRANSCODINGS = 16;

const MAINTENANCE_SUBS = ['forceCleanup', 'transcodingConfig', 'restartBackend', 'hardReset', 'resources', 'logs'] as const;
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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleRestart = async () => {
    if (loading) return;
    setMessage(null);
    const ok =
      typeof window !== 'undefined' ? window.confirm(t('settingsMenu.maintenance.restartBackend.confirm')) : true;
    if (!ok) return;
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

  if (embedded) return <div className="min-w-0">{content}</div>;
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
        <Power className="w-5 h-5 text-primary-400" />
        {t('settingsMenu.maintenance.restartBackend.title')}
      </h3>
      {content}
    </section>
  );
}

function HardResetSection({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleHardReset = async () => {
    if (loading) return;
    const ok =
      typeof window !== 'undefined' ? window.confirm(t('versionInfo.hardResetConfirm')) : true;
    if (!ok) return;

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

  if (embedded) return <div className="min-w-0">{content}</div>;
  return (
    <section className="rounded-xl border border-red-900/30 bg-white/5 overflow-hidden">
      <div className="p-4 sm:p-6">
        <p className="text-sm font-semibold text-red-300 mb-2">{t('versionInfo.hardResetTitle')}</p>
        {content}
      </div>
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
  { id: 'resources', titleKey: 'settingsMenu.maintenance.resources.title', descriptionKey: 'settingsMenu.maintenance.resources.description', icon: Activity },
  { id: 'logs', titleKey: 'settingsMenu.maintenance.serverLogs.title', descriptionKey: 'settingsMenu.maintenance.serverLogs.description', icon: FileText },
];

function SubPageFrame({
  item,
  children,
}: {
  item: MaintenanceItem;
  children: ComponentChildren;
}) {
  const { t } = useI18n();
  const Icon = item.icon;
  return (
    <div className="space-y-6">
      <a
        href={BASE_URL}
        data-astro-prefetch
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ds-accent-violet)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 rounded"
        aria-label={t('common.back')}
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        <span>{t('common.back')}</span>
      </a>
      <div className="rounded-[var(--ds-radius-lg)] overflow-hidden bg-[var(--ds-surface-elevated)] border border-[var(--ds-border)]">
        <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-[var(--ds-border)] flex items-center gap-3">
          <span
            className="inline-flex w-10 h-10 rounded-xl flex-shrink-0 items-center justify-center"
            style={{ backgroundColor: ACCENT_ICON_BG, color: ACCENT_ICON_COLOR }}
            aria-hidden
          >
            <Icon className="w-5 h-5" strokeWidth={1.8} />
          </span>
          <div>
            <h2 className="ds-title-card text-[var(--ds-text-primary)]">{t(item.titleKey)}</h2>
            <span className="ds-text-tertiary text-sm line-clamp-2">{t(item.descriptionKey)}</span>
          </div>
        </div>
        <div className="p-4 sm:p-5 min-w-0">{children}</div>
      </div>
    </div>
  );
}

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
    if (sub === 'forceCleanup') return <SubPageFrame item={item}><ForceCleanupSection embedded /></SubPageFrame>;
    if (sub === 'transcodingConfig') return <SubPageFrame item={item}><TranscodingConfigSection embedded /></SubPageFrame>;
    if (sub === 'restartBackend') return <SubPageFrame item={item}><RestartBackendSection embedded /></SubPageFrame>;
    if (sub === 'hardReset') return <SubPageFrame item={item}><HardResetSection embedded /></SubPageFrame>;
    if (sub === 'resources') return <SubPageFrame item={item}><ResourceMonitorDev embedded /></SubPageFrame>;
    if (sub === 'logs') return <SubPageFrame item={item}><ServerLogsSection embedded /></SubPageFrame>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
      {MAINTENANCE_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <a
            key={item.id}
            href={`${BASE_URL}?sub=${item.id}`}
            data-astro-prefetch="hover"
            data-settings-card
            className="block min-w-0 rounded-[var(--ds-radius-lg)] overflow-hidden transition-all hover:scale-[1.01] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] focus-visible:overflow-visible"
          >
            <DsCard variant="elevated" className="h-full">
              <DsCardSection className="flex flex-col h-full min-h-[120px]">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="inline-flex w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex-shrink-0 items-center justify-center"
                    style={{ backgroundColor: ACCENT_ICON_BG, color: ACCENT_ICON_COLOR }}
                    aria-hidden
                  >
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.8} />
                  </span>
                  <ChevronRight className="w-5 h-5 text-[var(--ds-text-tertiary)] flex-shrink-0 mt-0.5" aria-hidden />
                </div>
                <h2 className="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg mt-3 truncate">
                  {t(item.titleKey)}
                </h2>
                <span className="ds-text-tertiary text-sm mt-3 line-clamp-2">{t(item.descriptionKey)}</span>
                <span className="mt-auto pt-4 text-xs font-medium text-[var(--ds-accent-violet)] flex items-center gap-1" aria-hidden>
                  {t('common.open')}
                </span>
              </DsCardSection>
            </DsCard>
          </a>
        );
      })}
      <a
        href="/settings/server"
        data-astro-prefetch="hover"
        data-settings-card
        className="block min-w-0 rounded-[var(--ds-radius-lg)] overflow-hidden transition-all hover:scale-[1.01] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] focus-visible:overflow-visible"
      >
        <DsCard variant="elevated" className="h-full">
          <DsCardSection className="flex flex-col h-full min-h-[120px]">
            <div className="flex items-start justify-between gap-3">
              <span
                className="inline-flex w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex-shrink-0 items-center justify-center"
                style={{ backgroundColor: ACCENT_ICON_BG, color: ACCENT_ICON_COLOR }}
                aria-hidden
              >
                <Server className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.8} />
              </span>
              <ChevronRight className="w-5 h-5 text-[var(--ds-text-tertiary)] flex-shrink-0 mt-0.5" aria-hidden />
            </div>
            <h2 className="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg mt-3 truncate">
              {t('serverSettings.title')}
            </h2>
            <span className="ds-text-tertiary text-sm mt-3 line-clamp-2">
              {t('serverSettings.storageInfo')}
            </span>
            <span className="mt-auto pt-4 text-xs font-medium text-[var(--ds-accent-violet)] flex items-center gap-1" aria-hidden>
              {t('common.open')}
            </span>
          </DsCardSection>
        </DsCard>
      </a>
    </div>
  );
}
