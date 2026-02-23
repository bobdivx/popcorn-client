import { Settings, Server, Package, Activity, HardDrive } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import { DsSettingsSectionCard } from '../ui/design-system';
import ServerSettings from './ServerSettings';
import VersionInfo from './VersionInfo';
import DiagnosticsPanel from './DiagnosticsPanel';
import StoragePanel from './StoragePanel';
import { serverApi } from '../../lib/client/server-api';
import { redirectTo, getPathHref } from '../../lib/utils/navigation.js';

function SetupSection({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const content = (
    <>
      <p className="text-sm ds-text-secondary mb-4">{t('settingsMenu.setup.description')}</p>
      <a href={getPathHref('/setup') + '?force=1'} className="btn btn-primary" data-focusable tabIndex={0}>
        {t('common.configure')}
      </a>
    </>
  );
  if (embedded) return <div className="min-w-0">{content}</div>;
  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-6">
      <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
        <Settings className="w-5 h-5 text-primary-400" />
        {t('settingsMenu.setup.title')}
      </h3>
      {content}
    </section>
  );
}

function HardResetSection({ embedded = false }: { embedded?: boolean }) {
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
      if (!res.success) throw new Error(res.message || t('errors.generic'));
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

  const content = (
    <div className="flex flex-col gap-3">
      <p className="text-xs ds-text-secondary">{t('versionInfo.hardResetDescription')}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleHardReset}
          disabled={hardResetting}
          className="bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 text-xs"
        >
          {hardResetting ? t('versionInfo.hardResetInProgress') : t('versionInfo.hardResetAction')}
        </button>
        {hardResetError && <span className="text-xs text-red-400">{hardResetError}</span>}
      </div>
    </div>
  );

  if (embedded) return <div className="min-w-0">{content}</div>;
  return (
    <section className="rounded-xl border border-red-900/30 bg-white/5 overflow-hidden">
      <div className="p-4 sm:p-6">
        <p className="text-sm font-semibold text-red-300 mb-2">{t('versionInfo.hardResetTitle')}</p>
        {content}
      </div>
    </section>
  );
}

export default function SystemSubMenuPanel() {
  const { t } = useI18n();
  if (!canAccess('settings.server' as any)) return null;

  return (
    <div className="space-y-6 sm:space-y-8">
      <DsSettingsSectionCard icon={Settings} title={t('settingsMenu.setup.title')} accent="violet">
        <SetupSection embedded />
      </DsSettingsSectionCard>

      <DsSettingsSectionCard icon={Server} title={t('settingsMenu.server.title')} accent="violet">
        <div className="min-w-0">
          <ServerSettings />
        </div>
      </DsSettingsSectionCard>

      <DsSettingsSectionCard icon={Server} title={t('versionInfo.hardResetTitle')} accent="violet">
        <HardResetSection embedded />
      </DsSettingsSectionCard>

      <DsSettingsSectionCard icon={Package} title={t('settingsMenu.versions.title')} accent="violet">
        <div className="min-w-0">
          <VersionInfo />
        </div>
      </DsSettingsSectionCard>

      <DsSettingsSectionCard icon={HardDrive} title={t('settingsMenu.storage.title')} accent="violet">
        <div className="min-w-0">
          <StoragePanel />
        </div>
      </DsSettingsSectionCard>

      <DsSettingsSectionCard icon={Activity} title={t('settingsMenu.diagnostics.title')} accent="violet">
        <div className="min-w-0">
          <DiagnosticsPanel />
        </div>
      </DsSettingsSectionCard>
    </div>
  );
}
