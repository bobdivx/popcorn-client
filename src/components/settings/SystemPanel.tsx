import { Settings } from 'lucide-preact';
import ServerSettings from './ServerSettings';
import VersionInfo from './VersionInfo';
import { useI18n } from '../../lib/i18n/useI18n';

export default function SystemPanel() {
  const { t } = useI18n();

  return (
    <div className="flex-1 py-4 px-4 sm:px-6 space-y-6 overflow-y-auto scrollbar-visible">
      {/* Configuration initiale */}
      <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
          <Settings className="w-5 h-5 text-primary-400" />
          {t('settingsMenu.setup.title')}
        </h3>
        <p className="text-sm text-gray-400 mb-4">{t('settingsMenu.setup.description')}</p>
        <a
          href="/setup?force=1"
          className="btn btn-primary"
          data-focusable
          tabIndex={0}
        >
          {t('common.configure')}
        </a>
      </section>

      {/* Configuration du serveur */}
      <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="p-4 sm:p-6">
          <ServerSettings />
        </div>
      </section>

      {/* Versions */}
      <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="p-4 sm:p-6">
          <VersionInfo />
        </div>
      </section>
    </div>
  );
}
