import { useState, useEffect, useRef } from 'preact/hooks';
import {
  Bell,
  Hash,
  Send,
  Mail,
  Globe,
  MessageSquare,
  AlertCircle,
  Save,
  CheckCircle2,
  AlertTriangle,
  Info,
  Smartphone,
  History,
  X,
} from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';
import { useSeedingHealth, type SeedingDiagnostic } from '../../hooks/useSeedingHealth';
import { DsLoader } from '../ui/DsLoader';
import { useNativeNotifications } from '../../hooks/useNativeNotifications';
import {
  connectivityWarningFingerprint,
  readConnectivityDismissedFingerprint,
  writeConnectivityDismissedFingerprint,
  clearConnectivityDismissedFingerprint,
} from '../../lib/connectivity-warning';

interface NotificationSettingsData {
  webhook_enabled: boolean;
  webhook_url?: string;
  slack_enabled: boolean;
  slack_webhook_url?: string;
  discord_enabled: boolean;
  discord_webhook_url?: string;
  telegram_enabled: boolean;
  telegram_bot_token?: string;
  telegram_chat_id?: string;
  email_enabled: boolean;
  email_address?: string;
  system_enabled: boolean;
}

interface SentNotificationItem {
  id: string;
  user_id: string;
  tmdb_id: number;
  season_number: number;
  episode_number: number;
  sent_at: number;
}

function formatSentAt(ts: number, locale: string): string {
  const ms = ts > 1e12 ? ts : ts * 1000;
  try {
    return new Date(ms).toLocaleString(locale.startsWith('fr') ? 'fr-FR' : 'en-US', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return new Date(ms).toLocaleString();
  }
}

export default function NotificationSettings() {
  const { t, language } = useI18n();
  const { diagnostic, loading: seedingLoading, refetch: refetchSeeding } = useSeedingHealth();
  const { permissionStatus, requestPermission, notifySuccess } = useNativeNotifications();
  const prevStatusRef = useRef<SeedingDiagnostic['status'] | undefined>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [settings, setSettings] = useState<NotificationSettingsData>({
    webhook_enabled: false,
    slack_enabled: false,
    discord_enabled: false,
    telegram_enabled: false,
    email_enabled: false,
    system_enabled: true,
  });
  const [dismissedFingerprint, setDismissedFingerprint] = useState<string | null>(() =>
    readConnectivityDismissedFingerprint()
  );
  const [history, setHistory] = useState<SentNotificationItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [nativeBusy, setNativeBusy] = useState(false);

  const fingerprint =
    diagnostic && diagnostic.status !== 'ok' ? connectivityWarningFingerprint(diagnostic) : '';

  useEffect(() => {
    if (!diagnostic) return;
    const prevStatus = prevStatusRef.current;
    prevStatusRef.current = diagnostic.status;

    if (prevStatus === 'ok' && diagnostic.status !== 'ok') {
      setDismissedFingerprint(null);
      clearConnectivityDismissedFingerprint();
      return;
    }

    if (!fingerprint) return;
    const stored = readConnectivityDismissedFingerprint();
    if (stored && stored !== fingerprint) {
      setDismissedFingerprint(null);
      clearConnectivityDismissedFingerprint();
    }
  }, [diagnostic?.status, fingerprint]);

  const isDismissed = fingerprint !== '' && dismissedFingerprint === fingerprint;
  const hasActiveAlert =
    !seedingLoading && !!diagnostic && diagnostic.status !== 'ok' && !isDismissed;
  const hasHiddenAlert =
    !seedingLoading && !!diagnostic && diagnostic.status !== 'ok' && isDismissed;

  useEffect(() => {
    fetchSettings();
    fetchHistory();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await serverApi.getNotificationSettings();
      if (res.success && res.data) {
        setSettings({
          webhook_enabled: res.data.webhook_enabled !== 0,
          webhook_url: res.data.webhook_url,
          slack_enabled: res.data.slack_enabled !== 0,
          slack_webhook_url: res.data.slack_webhook_url,
          discord_enabled: res.data.discord_enabled !== 0,
          discord_webhook_url: res.data.discord_webhook_url,
          telegram_enabled: res.data.telegram_enabled !== 0,
          telegram_bot_token: res.data.telegram_bot_token,
          telegram_chat_id: res.data.telegram_chat_id,
          email_enabled: res.data.email_enabled !== 0,
          email_address: res.data.email_address,
          system_enabled: res.data.system_enabled !== 0,
        });
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await serverApi.getSentNotificationsHistory(30);
      if (res.success && Array.isArray(res.data)) {
        setHistory(res.data as SentNotificationItem[]);
      }
    } catch (err) {
      console.error('Failed to fetch notification history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDismissAlert = () => {
    if (!fingerprint) return;
    setDismissedFingerprint(fingerprint);
    writeConnectivityDismissedFingerprint(fingerprint);
  };

  const handleRestoreAlert = () => {
    setDismissedFingerprint(null);
    clearConnectivityDismissedFingerprint();
  };

  const handleNativeEnable = async () => {
    setNativeBusy(true);
    setMessage(null);
    try {
      const granted = await requestPermission();
      if (granted) {
        setMessage({ type: 'success', text: t('notificationSettings.nativeGranted') });
        await notifySuccess(
          t('notificationSettings.nativeTestTitle'),
          t('notificationSettings.nativeTestBody')
        );
      } else {
        setMessage({ type: 'error', text: t('notificationSettings.nativeDenied') });
      }
    } catch {
      setMessage({ type: 'error', text: t('notificationSettings.nativeDenied') });
    } finally {
      setNativeBusy(false);
    }
  };

  const handleSave = async (e: Event) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await serverApi.updateNotificationSettings(settings as any);
      if (res.success) {
        setMessage({ type: 'success', text: t('notificationSettings.saveSuccess') });
      } else {
        setMessage({ type: 'error', text: res.message || t('errors.generic') });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('errors.generic') });
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof NotificationSettingsData) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateField = (key: keyof NotificationSettingsData) => (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const nativeStatusLabel =
    permissionStatus === 'granted'
      ? t('notificationSettings.nativeStatusGranted')
      : permissionStatus === 'denied'
        ? t('notificationSettings.nativeStatusDenied')
        : permissionStatus === 'pending'
          ? t('common.loading')
          : t('notificationSettings.nativeStatusUnknown');

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <DsLoader size="md" />
      </div>
    );
  }

  const alertIsError = diagnostic?.status === 'error';
  const alertTitle = alertIsError
    ? t('connectivity.errorTitle')
    : t('connectivity.warningTitle');
  const alertDetail = diagnostic?.warnings?.[0] || t('connectivity.defaultDetail');

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-col gap-6">
        {/* Active alerts (same as avatar badge) */}
        <section className="sc-frame">
          <div className="sc-frame-body space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-500/10 rounded-lg">
              <Bell className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                {t('notificationSettings.activeAlertsTitle')}
              </h3>
              <p className="text-sm ds-text-secondary">
                {t('notificationSettings.activeAlertsDescription')}
              </p>
            </div>
          </div>

          {seedingLoading && (
            <p className="text-sm ds-text-tertiary">{t('common.loading')}</p>
          )}

          {!seedingLoading && !diagnostic && (
            <p className="text-sm ds-text-tertiary">{t('notificationSettings.noActiveAlerts')}</p>
          )}

          {!seedingLoading && diagnostic?.status === 'ok' && (
            <div className="flex items-start gap-3 rounded-xl border border-green-500/20 bg-green-500/5 p-3">
              <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-white">
                  {t('notificationSettings.seedingOkTitle')}
                </p>
                <p className="text-xs ds-text-secondary mt-1">
                  {t('notificationSettings.seedingOkDetail', {
                    count: String(diagnostic.total_seeding ?? 0),
                  })}
                </p>
              </div>
            </div>
          )}

          {hasActiveAlert && (
            <div
              className={`flex items-start gap-3 rounded-xl border p-3 ${
                alertIsError
                  ? 'border-red-500/25 bg-red-500/5'
                  : 'border-amber-500/25 bg-amber-500/5'
              }`}
            >
              <div className={`shrink-0 mt-0.5 ${alertIsError ? 'text-red-400' : 'text-amber-400'}`}>
                {alertIsError ? <AlertTriangle size={20} /> : <Info size={20} />}
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-sm font-semibold text-white">{alertTitle}</p>
                <p className="text-xs ds-text-secondary leading-relaxed">{alertDetail}</p>
                {(diagnostic?.warnings?.length ?? 0) > 1 && (
                  <ul className="text-xs ds-text-tertiary list-disc pl-4 space-y-0.5">
                    {diagnostic!.warnings.slice(1).map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href="/settings/uploads/seeding-diagnostic"
                    className="btn btn-ghost btn-sm"
                  >
                    {t('connectivity.openDiagnostic')}
                  </a>
                  <button
                    type="button"
                    onClick={() => refetchSeeding()}
                    className="btn btn-ghost btn-sm"
                  >
                    {t('notificationSettings.refreshAlert')}
                  </button>
                  <button
                    type="button"
                    onClick={handleDismissAlert}
                    className="btn btn-ghost btn-sm inline-flex items-center gap-1.5"
                  >
                    <X size={14} />
                    {t('connectivity.dismiss')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {hasHiddenAlert && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-sm ds-text-secondary">
                {t('notificationSettings.alertDismissedHint')}
              </p>
              <button type="button" onClick={handleRestoreAlert} className="btn btn-ghost btn-sm shrink-0">
                {t('notificationSettings.restoreAlert')}
              </button>
            </div>
          )}
          </div>
        </section>

        {/* Native / device notifications */}
        <section className="sc-frame">
          <div className="sc-frame-body space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-sky-500/10 rounded-lg">
                <Smartphone className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {t('notificationSettings.nativeTitle')}
                </h3>
                <p className="text-sm ds-text-secondary">
                  {t('notificationSettings.nativeDescription')}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <div>
              <p className="text-sm text-white font-medium">
                {t('notificationSettings.nativeStatusLabel')}
              </p>
              <p className="text-xs ds-text-secondary mt-0.5">{nativeStatusLabel}</p>
            </div>
            {permissionStatus !== 'granted' && (
              <button
                type="button"
                onClick={handleNativeEnable}
                disabled={nativeBusy || permissionStatus === 'pending'}
                className="btn btn-primary btn-sm shrink-0"
              >
                {nativeBusy || permissionStatus === 'pending'
                  ? t('common.loading')
                  : t('notificationSettings.nativeEnable')}
              </button>
            )}
            {permissionStatus === 'granted' && (
              <button
                type="button"
                onClick={async () => {
                  setNativeBusy(true);
                  try {
                    await notifySuccess(
                      t('notificationSettings.nativeTestTitle'),
                      t('notificationSettings.nativeTestBody')
                    );
                    setMessage({ type: 'success', text: t('notificationSettings.nativeTestSent') });
                  } finally {
                    setNativeBusy(false);
                  }
                }}
                disabled={nativeBusy}
                className="btn btn-ghost btn-sm shrink-0"
              >
                {t('notificationSettings.nativeSendTest')}
              </button>
            )}
          </div>
          </div>
        </section>

        {/* History */}
        <section className="sc-frame">
          <div className="sc-frame-body space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-500/10 rounded-lg">
                <History className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {t('notificationSettings.historyTitle')}
                </h3>
                <p className="text-sm ds-text-secondary">
                  {t('notificationSettings.historyDescription')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fetchHistory}
              disabled={historyLoading}
              className="btn btn-ghost btn-sm shrink-0"
            >
              {t('notificationSettings.refreshAlert')}
            </button>
          </div>

          {historyLoading && (
            <p className="text-sm ds-text-tertiary">{t('common.loading')}</p>
          )}
          {!historyLoading && history.length === 0 && (
            <p className="text-sm ds-text-tertiary">{t('notificationSettings.historyEmpty')}</p>
          )}
          {!historyLoading && history.length > 0 && (
            <ul className="divide-y divide-white/5 rounded-xl border border-white/10 overflow-hidden">
              {history.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 px-3 py-2.5 bg-white/[0.02]"
                >
                  <span className="text-sm text-white">
                    {t('notificationSettings.historyEpisode', {
                      tmdb: String(item.tmdb_id),
                      season: String(item.season_number),
                      episode: String(item.episode_number),
                    })}
                  </span>
                  <span className="text-xs ds-text-tertiary">
                    {formatSentAt(item.sent_at, language || 'fr')}
                  </span>
                </li>
              ))}
            </ul>
          )}
          </div>
        </section>

        {/* System Logs */}
        <section className="sc-frame">
          <div className="sc-frame-body space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-500/10 rounded-lg">
                <Hash className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">{t('notificationSettings.systemTitle')}</h3>
              </div>
            </div>
            <label className="ds-switch">
              <input
                type="checkbox"
                checked={settings.system_enabled}
                onChange={() => toggle('system_enabled')}
              />
              <span className="ds-switch-slider"></span>
            </label>
          </div>
          </div>
        </section>

        {/* Slack */}
        <section className="sc-frame">
          <div className="sc-frame-body space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg">
                <MessageSquare className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">{t('notificationSettings.slackTitle')}</h3>
              </div>
            </div>
            <label className="ds-switch">
              <input
                type="checkbox"
                checked={settings.slack_enabled}
                onChange={() => toggle('slack_enabled')}
              />
              <span className="ds-switch-slider"></span>
            </label>
          </div>
          {settings.slack_enabled && (
            <div className="ds-animate-fade-in space-y-3 pt-2">
              <div className="space-y-1">
                <label className="text-sm ds-text-secondary">{t('notificationSettings.slackWebhookUrl')}</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={settings.slack_webhook_url || ''}
                  onInput={updateField('slack_webhook_url')}
                  placeholder="https://hooks.slack.com/services/..."
                  className="ds-input w-full"
                />
                <p className="text-xs ds-text-tertiary">{t('notificationSettings.slackWebhookUrlHint')}</p>
              </div>
            </div>
          )}
          </div>
        </section>

        {/* Discord */}
        <section className="sc-frame">
          <div className="sc-frame-body space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/10 rounded-lg">
                <Globe className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">{t('notificationSettings.discordTitle')}</h3>
              </div>
            </div>
            <label className="ds-switch">
              <input
                type="checkbox"
                checked={settings.discord_enabled}
                onChange={() => toggle('discord_enabled')}
              />
              <span className="ds-switch-slider"></span>
            </label>
          </div>
          {settings.discord_enabled && (
            <div className="ds-animate-fade-in space-y-3 pt-2">
              <div className="space-y-1">
                <label className="text-sm ds-text-secondary">{t('notificationSettings.discordWebhookUrl')}</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={settings.discord_webhook_url || ''}
                  onInput={updateField('discord_webhook_url')}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="ds-input w-full"
                />
                <p className="text-xs ds-text-tertiary">{t('notificationSettings.discordWebhookUrlHint')}</p>
              </div>
            </div>
          )}
          </div>
        </section>

        {/* Telegram */}
        <section className="sc-frame">
          <div className="sc-frame-body space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Send className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">{t('notificationSettings.telegramTitle')}</h3>
              </div>
            </div>
            <label className="ds-switch">
              <input
                type="checkbox"
                checked={settings.telegram_enabled}
                onChange={() => toggle('telegram_enabled')}
              />
              <span className="ds-switch-slider"></span>
            </label>
          </div>
          {settings.telegram_enabled && (
            <div className="ds-animate-fade-in space-y-3 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm ds-text-secondary">{t('notificationSettings.telegramBotToken')}</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={settings.telegram_bot_token || ''}
                    onInput={updateField('telegram_bot_token')}
                    placeholder="123456789:ABC..."
                    className="ds-input w-full"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm ds-text-secondary">{t('notificationSettings.telegramChatId')}</label>
                  <input
                    type="text"
                    value={settings.telegram_chat_id || ''}
                    onInput={updateField('telegram_chat_id')}
                    placeholder="ex: 12345678"
                    className="ds-input w-full"
                  />
                </div>
              </div>
              <p className="text-xs ds-text-tertiary">{t('notificationSettings.telegramHint')}</p>
            </div>
          )}
          </div>
        </section>

        {/* Webhook */}
        <section className="sc-frame">
          <div className="sc-frame-body space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Globe className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">{t('notificationSettings.webhookTitle')}</h3>
              </div>
            </div>
            <label className="ds-switch">
              <input
                type="checkbox"
                checked={settings.webhook_enabled}
                onChange={() => toggle('webhook_enabled')}
              />
              <span className="ds-switch-slider"></span>
            </label>
          </div>
          {settings.webhook_enabled && (
            <div className="ds-animate-fade-in space-y-3 pt-2">
              <div className="space-y-1">
                <label className="text-sm ds-text-secondary">{t('notificationSettings.webhookUrl')}</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={settings.webhook_url || ''}
                  onInput={updateField('webhook_url')}
                  placeholder="https://votre-site.com/api/callback"
                  className="ds-input w-full"
                />
                <p className="text-xs ds-text-tertiary">{t('notificationSettings.webhookUrlHint')}</p>
              </div>
            </div>
          )}
          </div>
        </section>

        {/* Email */}
        <section className="sc-frame">
          <div className="sc-frame-body space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg">
                <Mail className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">{t('notificationSettings.emailTitle')}</h3>
              </div>
            </div>
            <label className="ds-switch">
              <input
                type="checkbox"
                checked={settings.email_enabled}
                onChange={() => toggle('email_enabled')}
              />
              <span className="ds-switch-slider"></span>
            </label>
          </div>
          {settings.email_enabled && (
            <div className="ds-animate-fade-in space-y-3 pt-2">
              <div className="space-y-1">
                <label className="text-sm ds-text-secondary">{t('notificationSettings.emailAddress')}</label>
                <input
                  type="email"
                  value={settings.email_address || ''}
                  onInput={updateField('email_address')}
                  placeholder="votre@email.com"
                  className="ds-input w-full"
                />
                <p className="text-xs ds-text-tertiary">{t('notificationSettings.emailHint')}</p>
              </div>
            </div>
          )}
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 bg-[var(--ds-surface-glass)] backdrop-blur-md p-4 flex items-center justify-between border-t border-white/5 -mx-4 sm:rounded-b-2xl">
        {message && (
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium animate-in fade-in slide-in-from-bottom-2 ${
              message.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5" />
            )}
            {message.text}
          </div>
        )}
        {!message && <div />}
        <div className="flex items-center gap-2">
          <button type="submit" disabled={saving} className="btn btn-primary btn-sm min-w-[100px]">
            {saving ? (
              <span className="flex items-center gap-2">
                <DsLoader size="xs" className="text-white" />
                {t('common.loading')}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Save className="w-3.5 h-3.5" />
                {t('common.save')}
              </span>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
