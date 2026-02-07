import AccountSettings from './AccountSettings';
import TwoFactorSettings from './TwoFactorSettings';
import QuickConnectAuthorize from './QuickConnectAuthorize';
import LocalUsersLink from './LocalUsersLink';
import { canAccess } from '../../lib/permissions';
import { getPopcornWebBaseUrl } from '../../lib/api/popcorn-web';
import { MessageCircle, Users, BookOpen, ArrowRight, LogOut } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { isDemoMode, setDemoMode } from '../../lib/backend-config';

export default function AccountPanel() {
  const { t } = useI18n();
  const showLocalUsers = canAccess('settings.local_users' as any);
  const showFriends = canAccess('settings.friends' as any);
  const demoMode = typeof window !== 'undefined' && isDemoMode();

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
      <AccountSettings />
      <TwoFactorSettings />
      <QuickConnectAuthorize />
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
