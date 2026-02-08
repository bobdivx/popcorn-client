import AccountSettings from './AccountSettings';
import TwoFactorSettings from './TwoFactorSettings';
import QuickConnectAuthorize from './QuickConnectAuthorize';
import LocalUsersLink from './LocalUsersLink';
import { canAccess } from '../../lib/permissions';
import { getPopcornWebBaseUrl } from '../../lib/api/popcorn-web';
import { MessageCircle, Users, BookOpen, ArrowRight } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';

export default function AccountPanel() {
  const { t } = useI18n();
  const showLocalUsers = canAccess('settings.local_users' as any);
  const showFriends = canAccess('settings.friends' as any);

  return (
    <div className="flex-1 py-4 px-4 sm:px-6 space-y-6 overflow-y-auto scrollbar-visible">
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
