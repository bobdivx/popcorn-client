import { canAccess } from '../../lib/permissions';
import { Users, ArrowRight } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';

export default function LocalUsersLink() {
  const { t } = useI18n();
  const hasAccess = canAccess('settings.local_users');

  if (!hasAccess) {
    return null;
  }

  return (
    <a
      href="/settings/local-users"
      class="glass-panel rounded-2xl shadow-2xl border border-white/10 p-6 sm:p-8 md:p-12 hover:border-primary-500/50 hover:bg-white/5 transition-all duration-200 block group"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4 sm:gap-6">
          <div class="p-3 sm:p-4 bg-primary-500/10 rounded-xl group-hover:bg-primary-500/20 transition-colors">
            <Users class="w-6 h-6 sm:w-7 sm:h-7 text-primary-400" />
          </div>
          <div>
            <h2 class="text-2xl sm:text-3xl md:text-4xl font-black text-white mb-2 sm:mb-3">
              Gérer les utilisateurs locaux
            </h2>
            <p class="text-gray-400 text-sm sm:text-base">
              Invitez et gérez les comptes locaux avec permissions limitées
            </p>
          </div>
        </div>
        <ArrowRight class="w-5 h-5 sm:w-6 sm:h-6 text-gray-400 group-hover:text-primary-400 transition-colors flex-shrink-0" />
      </div>
    </a>
  );
}
