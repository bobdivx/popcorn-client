import { useEffect, useState } from 'preact/hooks';
import { Check, Copy, Globe, Loader2, Tv } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import { useI18n } from '../../lib/i18n/useI18n';
import { SettingsCard } from './SettingsCard';

const fieldClass =
  'w-full min-h-[48px] px-3 rounded-xl bg-[var(--ds-surface-elevated)] text-[var(--ds-text-primary)] border border-[var(--ds-border)] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)]';
const btnPrimary =
  'inline-flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-xl font-medium bg-[var(--ds-accent-violet)] text-[var(--ds-text-on-accent)] disabled:opacity-50';
const btnGhost =
  'inline-flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-xl font-medium bg-[var(--ds-surface-elevated)] text-[var(--ds-text-primary)] border border-[var(--ds-border)] disabled:opacity-50';

export default function WebOSDeploymentPanel() {
  const { t } = useI18n();
  const [clientUrl, setClientUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const [device, setDevice] = useState('lgtv');
  const [installing, setInstalling] = useState(false);
  const [relaunching, setRelaunching] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'err'>('idle');
  const [message, setMessage] = useState('');
  const [logs, setLogs] = useState('');
  const [showLogs, setShowLogs] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setClientUrl(window.location.origin);
    }
  }, []);

  const copyClientUrl = async () => {
    const url = clientUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        /* ignore */
      }
    }
  };

  const runInstall = async () => {
    setInstalling(true);
    setStatus('idle');
    setMessage('');
    setLogs('');
    try {
      const res = await serverApi.installWebOSSimple(device.trim() || undefined);
      const payload = res.data;
      const combined =
        [payload?.logs, payload?.stderr].filter(Boolean).join('\n---\n') ||
        res.message ||
        res.error ||
        '';
      setLogs(combined);
      if (res.success && payload?.success) {
        setStatus('ok');
        setMessage(
          payload.ipk_path
            ? `${payload.message}\n${payload.ipk_path}`
            : payload.message || t('settingsPages.webosDeployment.installOk')
        );
      } else {
        setStatus('err');
        setMessage(payload?.message || res.error || res.message || t('common.error'));
      }
    } catch (e) {
      setStatus('err');
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  };

  const runRelaunch = async () => {
    setRelaunching(true);
    setStatus('idle');
    setMessage('');
    setLogs('');
    try {
      const res = await serverApi.relaunchWebOSApp(device.trim() || undefined);
      const payload = res.data;
      setLogs(payload?.logs || '');
      if (res.success && payload?.success) {
        setStatus('ok');
        setMessage(payload.message || t('settingsPages.webosDeployment.relaunchOk'));
      } else {
        setStatus('err');
        setMessage(res.error || res.message || t('common.error'));
      }
    } catch (e) {
      setStatus('err');
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setRelaunching(false);
    }
  };

  const busy = installing || relaunching;

  return (
    <div class="space-y-6">
      <SettingsCard
        icon={Globe}
        title={t('settingsPages.webosDeployment.noInstallTitle')}
        description={t('settingsPages.webosDeployment.noInstallIntro')}
      >
        <ol class="list-decimal list-inside space-y-2 text-sm text-[var(--ds-text-secondary)] mb-6 pl-1">
          <li>{t('settingsPages.webosDeployment.noInstallStep1')}</li>
          <li>{t('settingsPages.webosDeployment.noInstallStep2')}</li>
          <li>{t('settingsPages.webosDeployment.noInstallStep3')}</li>
        </ol>

        <label class="block w-full">
          <span class="block text-sm font-medium text-[var(--ds-text-primary)] mb-2">
            {t('settingsPages.webosDeployment.clientUrlLabel')}
          </span>
          <div class="flex flex-col sm:flex-row gap-2 sm:items-stretch max-w-3xl">
            <input
              type="text"
              readOnly
              class={fieldClass + ' flex-1'}
              value={clientUrl}
              aria-readonly
              data-tv-focusable
            />
            <button
              type="button"
              class={btnPrimary + ' sm:shrink-0'}
              onClick={copyClientUrl}
              data-tv-focusable
            >
              {copied ? <Check class="h-5 w-5" /> : <Copy class="h-5 w-5" />}
              {copied ? t('settingsPages.webosDeployment.copied') : t('settingsPages.webosDeployment.copyLink')}
            </button>
          </div>
        </label>
      </SettingsCard>

      <SettingsCard
        icon={Tv}
        title={t('settingsPages.webosDeployment.adminTitle')}
        description={t('settingsPages.webosDeployment.adminIntro')}
      >
        <p class="text-sm text-[var(--ds-text-secondary)] mb-3">{t('settingsPages.webosDeployment.lead')}</p>
        <p class="text-xs text-[var(--ds-text-tertiary)] mb-4">{t('settingsPages.webosDeployment.prereq')}</p>

        <label class="block w-full max-w-md mb-4">
          <span class="block text-sm font-medium text-[var(--ds-text-primary)] mb-2">
            {t('settingsPages.webosDeployment.deviceLabel')}
          </span>
          <input
            type="text"
            class={fieldClass}
            value={device}
            onInput={(e) => setDevice((e.target as HTMLInputElement).value)}
            disabled={busy}
            placeholder={t('settingsPages.webosDeployment.devicePlaceholder')}
            autoComplete="off"
            data-tv-focusable
          />
          <span class="block text-xs text-[var(--ds-text-tertiary)] mt-1.5">
            {t('settingsPages.webosDeployment.deviceHelp')}
          </span>
        </label>

        <div class="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            class={btnPrimary}
            disabled={busy}
            onClick={runInstall}
            data-tv-focusable
          >
            {installing ? <Loader2 class="h-5 w-5 animate-spin" /> : null}
            {installing
              ? t('settingsPages.webosDeployment.installing')
              : t('settingsPages.webosDeployment.installSimple')}
          </button>
          <button
            type="button"
            class={btnGhost}
            disabled={busy}
            onClick={runRelaunch}
            data-tv-focusable
          >
            {relaunching ? <Loader2 class="h-5 w-5 animate-spin" /> : null}
            {t('settingsPages.webosDeployment.relaunch')}
          </button>
        </div>

        {status !== 'idle' && (
          <div
            role="status"
            class={`mt-4 rounded-xl px-4 py-3 text-sm whitespace-pre-wrap ${
              status === 'ok'
                ? 'bg-[#dcfce7] text-[#14532d]'
                : 'bg-[#fee2e2] text-[#991b1b]'
            }`}
          >
            {message}
          </div>
        )}

        {logs && (
          <div class="mt-4">
            <button
              type="button"
              class="text-sm font-medium text-[var(--ds-accent-violet)] hover:underline"
              onClick={() => setShowLogs(!showLogs)}
              data-tv-focusable
            >
              {showLogs ? t('settingsPages.webosDeployment.hideLogs') : t('settingsPages.webosDeployment.showLogs')}
            </button>
            {showLogs && (
              <pre class="mt-2 max-h-64 overflow-auto rounded-xl bg-[var(--ds-surface)] text-[var(--ds-text-primary)] border border-[var(--ds-border)] p-3 text-xs font-mono whitespace-pre-wrap break-all">
                {logs}
              </pre>
            )}
          </div>
        )}
      </SettingsCard>
    </div>
  );
}
