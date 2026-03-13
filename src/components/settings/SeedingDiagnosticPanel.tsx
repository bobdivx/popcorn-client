import { useState, useEffect, useCallback } from 'preact/hooks';
import { serverApi } from '../../lib/client/server-api';
import { useI18n } from '../../lib/i18n/useI18n';
import { Activity, CheckCircle, XCircle, ExternalLink, RefreshCw } from 'lucide-preact';

type Diagnostic = {
  upnp_enabled: boolean;
  ratio_mode_enabled: boolean;
  librqbit_ok: boolean;
  listen_port: number | null;
};

export default function SeedingDiagnosticPanel() {
  const { t } = useI18n();
  const [data, setData] = useState<Diagnostic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await serverApi.getSeedingDiagnostic();
      if (res.success && res.data) setData(res.data);
      else setError(res.message || t('settings.seedingDiagnostic.errorLoad'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="animate-pulse rounded-[var(--ds-radius-lg)] bg-[var(--ds-surface-elevated)] h-48" />
    );
  }

  return (
    <div className="space-y-4">
      <div class="sc-frame">
        <div class="sc-frame-body">
          <div className="flex items-center justify-between gap-3 mb-4">
            <span
              className="inline-flex w-11 h-11 rounded-xl flex-shrink-0 items-center justify-center"
              style={{ backgroundColor: 'var(--ds-accent-violet-muted)', color: 'var(--ds-accent-violet)' }}
              aria-hidden
            >
              <Activity className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="p-2 rounded-lg text-[var(--ds-text-secondary)] hover:bg-[var(--ds-surface-hover)] disabled:opacity-50"
              title={t('common.refresh')}
              aria-label={t('common.refresh')}
            >
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <h2 className="ds-title-card text-[var(--ds-text-primary)] text-lg mb-1">
            {t('settings.seedingDiagnostic.title')}
          </h2>
          <p className="ds-text-tertiary text-sm mb-4">
            {t('settings.seedingDiagnostic.subtitle')}
          </p>

          {error && (
            <p className="text-[var(--ds-text-negative)] text-sm mb-4" role="alert">
              {error}
            </p>
          )}

          {data && (
            <ul className="space-y-3" aria-label={t('settings.seedingDiagnostic.statusList')}>
              <li className="flex items-center gap-3 text-sm">
                {data.librqbit_ok ? (
                  <CheckCircle className="w-5 h-5 text-[var(--ds-text-positive)] flex-shrink-0" aria-hidden />
                ) : (
                  <XCircle className="w-5 h-5 text-[var(--ds-text-negative)] flex-shrink-0" aria-hidden />
                )}
                <span className="text-[var(--ds-text-primary)]">
                  {t('settings.seedingDiagnostic.clientTorrent')}:{' '}
                  <strong>{data.librqbit_ok ? t('settings.seedingDiagnostic.ok') : t('settings.seedingDiagnostic.notReachable')}</strong>
                </span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                {data.upnp_enabled ? (
                  <CheckCircle className="w-5 h-5 text-[var(--ds-text-positive)] flex-shrink-0 mt-0.5" aria-hidden />
                ) : (
                  <XCircle className="w-5 h-5 text-[var(--ds-text-tertiary)] flex-shrink-0 mt-0.5" aria-hidden />
                )}
                <span className="text-[var(--ds-text-primary)] flex-1 min-w-0">
                  {t('settings.seedingDiagnostic.upnp')}:{' '}
                  <strong>{data.upnp_enabled ? t('settings.seedingDiagnostic.enabled') : t('settings.seedingDiagnostic.disabled')}</strong>
                  {!data.upnp_enabled && (
                    <span className="block text-xs text-[var(--ds-text-tertiary)] mt-1.5">
                      {t('settings.seedingDiagnostic.upnpHowToEnable')}
                    </span>
                  )}
                </span>
              </li>
              <li className="flex items-center gap-3 text-sm">
                {data.ratio_mode_enabled ? (
                  <CheckCircle className="w-5 h-5 text-[var(--ds-text-positive)] flex-shrink-0" aria-hidden />
                ) : (
                  <XCircle className="w-5 h-5 text-[var(--ds-text-tertiary)] flex-shrink-0" aria-hidden />
                )}
                <span className="text-[var(--ds-text-primary)]">
                  {t('settings.seedingDiagnostic.ratioMode')}:{' '}
                  <strong>{data.ratio_mode_enabled ? t('settings.seedingDiagnostic.enabled') : t('settings.seedingDiagnostic.disabled')}</strong>
                </span>
              </li>
              {data.listen_port != null && (
                <li className="flex items-center gap-3 text-sm">
                  <CheckCircle className="w-5 h-5 text-[var(--ds-text-positive)] flex-shrink-0" aria-hidden />
                  <span className="text-[var(--ds-text-primary)]">
                    {t('settings.seedingDiagnostic.listenPort')}: <strong>{data.listen_port}</strong>
                  </span>
                </li>
              )}
            </ul>
          )}

          <div className="mt-6 pt-4 border-t border-[var(--ds-border-subtle)] space-y-3">
            {data?.listen_port != null ? (
              <p className="ds-text-tertiary text-sm">
                {t('settings.seedingDiagnostic.portHintWithPort', { port: String(data.listen_port) })}
              </p>
            ) : (
              <p className="ds-text-tertiary text-sm">
                {t('settings.seedingDiagnostic.portHint')}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <a
                href="/settings/ratio"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--ds-accent-violet-muted)] text-[var(--ds-accent-violet)] text-sm font-medium hover:opacity-90"
              >
                {t('settings.seedingDiagnostic.testTrackerAnnounce')}
                <ExternalLink className="w-4 h-4" />
              </a>
              <a
                href={data?.listen_port != null ? `https://canyouseeme.org/?port=${data.listen_port}` : 'https://canyouseeme.org'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--ds-surface-elevated)] text-[var(--ds-text-secondary)] text-sm hover:bg-[var(--ds-surface-hover)]"
              >
                {t('settings.seedingDiagnostic.testPortExternal')}
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
