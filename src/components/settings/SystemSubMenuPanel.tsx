import { Settings, Server, Package, Activity } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import SubMenuPanel, { type SubMenuItem } from './SubMenuPanel';
import ServerSettings from './ServerSettings';
import VersionInfo from './VersionInfo';
import DiagnosticsPanel from './DiagnosticsPanel';
import { serverApi } from '../../lib/client/server-api';
import { redirectTo } from '../../lib/utils/navigation.js';

function SetupSection() {
  const { t } = useI18n();
  return (
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
  );
}

function ServerSection() {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="p-4 sm:p-6">
        <ServerSettings />
      </div>
    </section>
  );
}

function HardResetSection() {
  const { t } = useI18n();
  const [hardResetting, setHardResetting] = useState(false);
  const [hardResetError, setHardResetError] = useState<string>('');

  const handleHardReset = async () => {
    if (hardResetting) return;
    if (!confirm(t('versionInfo.hardResetConfirm'))) return;

    setHardResetting(true);
    setHardResetError('');

    try {
      const res = await serverApi.resetBackendDatabase();
      if (!res.success) {
        throw new Error(res.message || t('errors.generic'));
      }

      try {
        await serverApi.logout();
      } catch (err) {
        console.error('Erreur lors de la déconnexion:', err);
      }

      redirectTo('/login');
    } catch (err) {
      setHardResetError(err instanceof Error ? err.message : t('errors.generic'));
    } finally {
      setHardResetting(false);
    }
  };

  return (
    <section className="rounded-xl border border-red-900/30 bg-white/5 overflow-hidden">
      <div className="p-4 sm:p-6">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-semibold text-red-300">{t('versionInfo.hardResetTitle')}</p>
            <p className="text-xs text-gray-400">{t('versionInfo.hardResetDescription')}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleHardReset}
              disabled={hardResetting}
              className="bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 text-xs"
            >
              {hardResetting ? t('versionInfo.hardResetInProgress') : t('versionInfo.hardResetAction')}
            </button>
            {hardResetError && (
              <span className="text-xs text-red-400">{hardResetError}</span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function VersionsSection() {
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="p-4 sm:p-6">
        <VersionInfo />
      </div>
    </section>
  );
}

const SYSTEM_ITEMS: SubMenuItem[] = [
  {
    id: 'setup',
    titleKey: 'settingsMenu.setup.title',
    descriptionKey: 'settingsMenu.setup.description',
    icon: Settings,
    permission: 'settings.server',
    inlineContent: SetupSection,
  },
  {
    id: 'server',
    titleKey: 'settingsMenu.server.title',
    descriptionKey: 'settingsMenu.server.description',
    icon: Server,
    permission: 'settings.server',
    inlineContent: ServerSection,
  },
  {
    id: 'hard-reset',
    titleKey: 'versionInfo.hardResetTitle',
    descriptionKey: 'versionInfo.hardResetDescription',
    icon: Server,
    permission: 'settings.server',
    inlineContent: HardResetSection,
  },
  {
    id: 'versions',
    titleKey: 'settingsMenu.versions.title',
    descriptionKey: 'settingsMenu.versions.description',
    icon: Package,
    permission: 'settings.server',
    inlineContent: VersionsSection,
  },
  {
    id: 'diagnostics',
    titleKey: 'settingsMenu.diagnostics.title',
    descriptionKey: 'settingsMenu.diagnostics.description',
    icon: Activity,
    permission: 'settings.server',
    inlineContent: DiagnosticsPanel,
  },
];

export default function SystemSubMenuPanel() {
  const visibleItems = SYSTEM_ITEMS.filter(
    (item) => !item.permission || canAccess(item.permission as any)
  );
  return <SubMenuPanel items={SYSTEM_ITEMS} visibleItems={visibleItems} />;
}
