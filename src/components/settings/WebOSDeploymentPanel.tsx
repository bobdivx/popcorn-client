import { useEffect, useState } from 'preact/hooks';
import { Check, Copy, Globe, Loader2, Tv } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import { useI18n } from '../../lib/i18n/useI18n';

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
      <div class="rounded-xl border border-base-300/80 bg-base-200/40 p-4 sm:p-6">
        <div class="flex items-start gap-3 mb-4">
          <div class="rounded-lg bg-primary/15 p-2 text-primary">
            <Globe class="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h2 class="text-lg font-semibold text-base-content">{t('settingsPages.webosDeployment.noInstallTitle')}</h2>
            <p class="text-sm text-base-content/80 mt-1">{t('settingsPages.webosDeployment.noInstallIntro')}</p>
          </div>
        </div>

        <ol class="list-decimal list-inside space-y-2 text-sm text-base-content/85 mb-6 pl-1">
          <li>{t('settingsPages.webosDeployment.noInstallStep1')}</li>
          <li>{t('settingsPages.webosDeployment.noInstallStep2')}</li>
          <li>{t('settingsPages.webosDeployment.noInstallStep3')}</li>
        </ol>

        <label class="form-control w-full">
          <span class="label-text font-medium">{t('settingsPages.webosDeployment.clientUrlLabel')}</span>
          <div class="flex flex-col sm:flex-row gap-2 sm:items-stretch max-w-3xl">
            <input
              type="text"
              readOnly
              class="input input-bordered font-mono text-sm flex-1 min-h-[48px]"
              value={clientUrl}
              aria-readonly
              data-tv-focusable
            />
            <button
              type="button"
              class="btn btn-primary gap-2 min-h-[48px] sm:shrink-0"
              onClick={copyClientUrl}
              data-tv-focusable
            >
              {copied ? <Check class="h-5 w-5" /> : <Copy class="h-5 w-5" />}
              {copied ? t('settingsPages.webosDeployment.copied') : t('settingsPages.webosDeployment.copyLink')}
            </button>
          </div>
        </label>
      </div>

      <details class="rounded-xl border border-base-300/80 bg-base-200/30 group open:bg-base-200/50">
        <summary class="cursor-pointer list-none p-4 sm:px-6 sm:py-4 flex items-center gap-3 [&::-webkit-details-marker]:hidden">
          <span class="rounded-lg bg-base-300/40 p-2 text-base-content/80">
            <Tv class="h-5 w-5" aria-hidden />
          </span>
          <span class="font-medium text-base-content">{t('settingsPages.webosDeployment.adminTitle')}</span>
        </summary>

        <div class="px-4 pb-4 sm:px-6 sm:pb-6 pt-0 border-t border-base-300/50 space-y-4">
          <p class="text-sm text-base-content/80">{t('settingsPages.webosDeployment.adminIntro')}</p>
          <p class="text-sm text-base-content/70">{t('settingsPages.webosDeployment.lead')}</p>
          <p class="text-xs text-base-content/55">{t('settingsPages.webosDeployment.prereq')}</p>

          <label class="form-control w-full max-w-md">
            <span class="label-text font-medium">{t('settingsPages.webosDeployment.deviceLabel')}</span>
            <input
              type="text"
              class="input input-bordered w-full"
              value={device}
              onInput={(e) => setDevice((e.target as HTMLInputElement).value)}
              disabled={busy}
              placeholder={t('settingsPages.webosDeployment.devicePlaceholder')}
              autoComplete="off"
              data-tv-focusable
            />
            <span class="label-text-alt text-base-content/50">{t('settingsPages.webosDeployment.deviceHelp')}</span>
          </label>

          <div class="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              class="btn btn-outline btn-primary gap-2 min-h-[48px]"
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
              class="btn btn-outline gap-2 min-h-[48px]"
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
              class={`rounded-lg px-4 py-3 text-sm whitespace-pre-wrap ${
                status === 'ok' ? 'bg-success/15 text-success-content' : 'bg-error/15 text-error-content'
              }`}
            >
              {message}
            </div>
          )}

          {logs && (
            <div>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                onClick={() => setShowLogs(!showLogs)}
                data-tv-focusable
              >
                {showLogs ? t('settingsPages.webosDeployment.hideLogs') : t('settingsPages.webosDeployment.showLogs')}
              </button>
              {showLogs && (
                <pre class="mt-2 max-h-64 overflow-auto rounded-lg bg-base-300/50 p-3 text-xs font-mono whitespace-pre-wrap break-all">
                  {logs}
                </pre>
              )}
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
