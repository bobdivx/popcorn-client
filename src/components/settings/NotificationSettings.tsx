import { useState, useEffect } from 'preact/hooks';
import { Bell, Hash, Send, Mail, Globe, MessageSquare, AlertCircle, Save, CheckCircle2 } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';

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

export default function NotificationSettings() {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [settings, setSettings] = useState<NotificationSettingsData>({
    webhook_enabled: false,
    slack_enabled: false,
    discord_enabled: false,
    telegram_enabled: false,
    email_enabled: false,
    system_enabled: true,
  });

  useEffect(() => {
    fetchSettings();
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

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
        // En vrai il faudrait un endpoint /test-notification, mais on va utiliser un flag ou juste logger
        // Pour l'instant on simule si l'endpoint n'existe pas, ou on appelle un endpoint générique si possible
        // Le backend n'a pas encore /test-notification officiellement mais on peut imaginer qu'il arrive
        // On va juste informer l'utilisateur de sauvegarder d'abord
        setMessage({ type: 'success', text: t('notificationSettings.testSuccess') });
    } catch (err) {
      setMessage({ type: 'error', text: t('notificationSettings.testError') });
    } finally {
      setTesting(false);
    }
  };

  const toggle = (key: keyof NotificationSettingsData) => {
    setSettings((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const updateField = (key: keyof NotificationSettingsData) => (e: Event) => {
    const value = (e.target as HTMLInputElement).value;
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-col gap-6">
        
        {/* System Logs */}
        <section className="ds-card ds-card-glass p-4 sm:p-6 space-y-4">
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
        </section>

        {/* Slack */}
        <section className="ds-card ds-card-glass p-4 sm:p-6 space-y-4">
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
                  type="text"
                  value={settings.slack_webhook_url || ''}
                  onInput={updateField('slack_webhook_url')}
                  placeholder="https://hooks.slack.com/services/..."
                  className="ds-input w-full"
                />
                <p className="text-xs ds-text-tertiary">{t('notificationSettings.slackWebhookUrlHint')}</p>
              </div>
            </div>
          )}
        </section>

        {/* Discord */}
        <section className="ds-card ds-card-glass p-4 sm:p-6 space-y-4">
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
                  type="text"
                  value={settings.discord_webhook_url || ''}
                  onInput={updateField('discord_webhook_url')}
                  placeholder="https://discord.com/api/webhooks/..."
                  className="ds-input w-full"
                />
                <p className="text-xs ds-text-tertiary">{t('notificationSettings.discordWebhookUrlHint')}</p>
              </div>
            </div>
          )}
        </section>

        {/* Telegram */}
        <section className="ds-card ds-card-glass p-4 sm:p-6 space-y-4">
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
        </section>

        {/* Webhook */}
        <section className="ds-card ds-card-glass p-4 sm:p-6 space-y-4">
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
                  type="text"
                  value={settings.webhook_url || ''}
                  onInput={updateField('webhook_url')}
                  placeholder="https://votre-site.com/api/callback"
                  className="ds-input w-full"
                />
                <p className="text-xs ds-text-tertiary">{t('notificationSettings.webhookUrlHint')}</p>
              </div>
            </div>
          )}
        </section>

        {/* Email */}
        <section className="ds-card ds-card-glass p-4 sm:p-6 space-y-4">
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
        </section>

      </div>

      <div className="sticky bottom-0 bg-[var(--ds-surface-glass)] backdrop-blur-md p-4 flex items-center justify-between border-t border-white/5 -mx-4 sm:rounded-b-2xl">
        {message && (
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium animate-in fade-in slide-in-from-bottom-2 ${
            message.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            {message.text}
          </div>
        )}
        {!message && <div />}
        <div className="flex items-center gap-2">
          {/* <button 
            type="button" 
            onClick={handleTest}
            disabled={testing || saving}
            className="btn btn-ghost btn-sm"
          >
            {testing ? t('common.loading') : t('common.test')}
          </button> */}
          <button 
            type="submit" 
            disabled={saving}
            className="btn btn-primary btn-sm min-w-[100px]"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
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
