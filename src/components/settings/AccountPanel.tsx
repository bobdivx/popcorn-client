import { useState, useEffect } from 'preact/hooks';
import AccountSettings, { type AccountSection } from './AccountSettings';
import TwoFactorSettings from './TwoFactorSettings';
import QuickConnectAuthorize from './QuickConnectAuthorize';
import LocalUsersLink from './LocalUsersLink';
import { canAccess } from '../../lib/permissions';
import { getPopcornWebBaseUrl, getUserConfig } from '../../lib/api/popcorn-web';
import { MessageCircle, Users, BookOpen, ArrowRight, LogOut, CloudDownload } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { isDemoMode, setDemoMode } from '../../lib/backend-config';
import { TokenManager } from '../../lib/client/storage';
import { serverApi } from '../../lib/client/server-api';
import { runAllFromCloud } from '../../lib/sync/index.js';

export default function AccountPanel() {
  const { t } = useI18n();
  const showLocalUsers = canAccess('settings.local_users' as any);
  const showFriends = canAccess('settings.friends' as any);
  const demoMode = typeof window !== 'undefined' && isDemoMode();
  const hasCloudToken = typeof window !== 'undefined' && !!TokenManager.getCloudAccessToken();
  const [recoverLoading, setRecoverLoading] = useState(false);
  const [recoverMessage, setRecoverMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [accountSection, setAccountSection] = useState<AccountSection | 'all'>('all');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const s = params.get('section');
      if (s === 'profile' || s === 'info' || s === 'interface' || s === 'devices' || s === 'logout') {
        setAccountSection(s);
      }
    } catch {
      // ignore
    }
  }, []);

  const handleRecoverConfigFromCloud = async () => {
    setRecoverMessage(null);
    setRecoverLoading(true);
    try {
      const cloudToken = TokenManager.getCloudAccessToken();
      if (!cloudToken) {
        setRecoverMessage({ type: 'error', text: t('account.recoverConfigFromCloudError') });
        return;
      }
      const health = await serverApi.checkServerHealth();
      if (!health.success) {
        setRecoverMessage({
          type: 'error',
          text: (health.message || health.error || t('account.recoverConfigFromCloudError')) as string,
        });
        return;
      }
      const savedConfig = await getUserConfig();
      const hasSomething =
        !!(savedConfig?.indexers?.length) ||
        !!savedConfig?.tmdbApiKey ||
        !!savedConfig?.downloadLocation ||
        !!savedConfig?.syncSettings ||
        !!savedConfig?.language ||
        !!(savedConfig?.indexerCategories && Object.keys(savedConfig.indexerCategories).length > 0);
      if (!savedConfig || !hasSomething) {
        setRecoverMessage({ type: 'error', text: t('account.recoverConfigFromCloudNoConfig') });
        return;
      }
      const result = await runAllFromCloud({
        config: savedConfig,
        onProgress: () => {},
        onDoneIncrement: () => {},
      });
      if (result.success) {
        setRecoverMessage({ type: 'success', text: t('account.recoverConfigFromCloudSuccess') });
      } else {
        setRecoverMessage({
          type: 'error',
          text: (result.error || t('account.recoverConfigFromCloudError')) as string,
        });
      }
    } catch (err) {
      setRecoverMessage({
        type: 'error',
        text: `${t('account.recoverConfigFromCloudError')} ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setRecoverLoading(false);
    }
  };

  const handleExitDemo = () => {
    setDemoMode(false);
    window.location.href = '/'; // Rechargement pour sortir du proxy démo
  };

  return (
    <div className="flex-1 py-4 px-4 sm:px-6 space-y-6 overflow-y-auto scrollbar-visible">
      {demoMode && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-amber-200 mb-2">{t('demo.modeActive')}</h3>
          <p className="text-white/80 text-sm mb-4">
            {t('demo.modeActiveDescription')}
          </p>
          <button
            type="button"
            onClick={handleExitDemo}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            <LogOut className="w-4 h-4" />
            {t('demo.exitDemo')}
          </button>
        </section>
      )}
      <AccountSettings section={accountSection} />
      <TwoFactorSettings />
      <QuickConnectAuthorize />
      {hasCloudToken && (
        <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
          <h3 className="text-lg font-semibold text-white mb-2">{t('account.recoverConfigFromCloud')}</h3>
          <p className="text-white/80 text-sm mb-4">
            {t('account.recoverConfigFromCloudDescription')}
          </p>
          {recoverMessage && (
            <div
              className={`mb-4 p-3 rounded-lg text-sm ${
                recoverMessage.type === 'success'
                  ? 'bg-green-900/30 border border-green-700/50 text-green-200'
                  : 'bg-primary-900/30 border border-primary-700/50 text-primary-200'
              }`}
              role="alert"
            >
              {recoverMessage.text}
            </div>
          )}
          <button
            type="button"
            onClick={handleRecoverConfigFromCloud}
            disabled={recoverLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            {recoverLoading ? (
              <>
                <span className="loading loading-spinner loading-sm" />
                {t('account.recoverConfigFromCloudButton')}…
              </>
            ) : (
              <>
                <CloudDownload className="w-4 h-4" />
                {t('account.recoverConfigFromCloudButton')}
              </>
            )}
          </button>
        </section>
      )}
      {showLocalUsers && <LocalUsersLink />}

      {/* Liens rapides */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-white mb-4">{t('settingsMenu.quickLinks')}</h3>
        <div className="space-y-2">
          <a
            href="/settings/feedback"
            className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:bg-white/5 hover:border-white/20 transition-all group"
          >
            <MessageCircle className="w-5 h-5 text-primary-400" />
            <span className="flex-1 text-white font-medium">{t('settingsMenu.feedback.title')}</span>
            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary-400" />
          </a>
          {showFriends && (
            <a
              href="/settings/friends"
              className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:bg-white/5 hover:border-white/20 transition-all group"
            >
              <Users className="w-5 h-5 text-primary-400" />
              <span className="flex-1 text-white font-medium">{t('settingsMenu.friends.title')}</span>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary-400" />
            </a>
          )}
          <a
            href={`${getPopcornWebBaseUrl()}/docs`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:bg-white/5 hover:border-white/20 transition-all group"
          >
            <BookOpen className="w-5 h-5 text-primary-400" />
            <span className="flex-1 text-white font-medium">{t('settingsMenu.documentation.title')}</span>
            <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-primary-400" />
          </a>
        </div>
      </section>
    </div>
  );
}
