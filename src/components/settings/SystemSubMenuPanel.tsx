import { useState, useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import ServerSettings from './ServerSettings';
import VersionInfo from './VersionInfo';
import DiagnosticsPanel from './DiagnosticsPanel';
import StoragePanel from './StoragePanel';
import NotificationSettings from './NotificationSettings';
import { serverApi } from '../../lib/client/server-api';
import { redirectTo } from '../../lib/utils/navigation.js';
import { SettingsNavCard } from './SettingsNavCard';
import { SettingsSubPageFrame } from './SettingsSubPageFrame';
import { Bell, Settings, Package, Activity, HardDrive } from 'lucide-preact';

const BASE_URL = '/settings?category=system';

const SYSTEM_SUBS = ['setup', 'hard-reset', 'versions', 'storage', 'diagnostics', 'notifications'] as const;
type SystemSub = (typeof SYSTEM_SUBS)[number];

function getSubFromUrl(): SystemSub | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const sub = params.get('sub');
  return SYSTEM_SUBS.includes(sub as SystemSub) ? (sub as SystemSub) : null;
}

function SetupSection({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const content = (
    <>
      <p className="text-sm ds-text-secondary mb-4">{t('settingsMenu.setup.description')}</p>
      <a href="/setup?force=1" className="btn btn-primary" data-focusable tabIndex={0}>
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

type SystemItem = {
  id: SystemSub;
  titleKey: string;
  descriptionKey: string;
  icon: typeof Settings;
};

const SYSTEM_ITEMS: SystemItem[] = [
  { id: 'setup', titleKey: 'settingsMenu.setup.title', descriptionKey: 'settingsMenu.setup.description', icon: Settings },
  { id: 'notifications', titleKey: 'notificationSettings.title', descriptionKey: 'notificationSettings.description', icon: Bell },
  { id: 'hard-reset', titleKey: 'versionInfo.hardResetTitle', descriptionKey: 'versionInfo.hardResetDescription', icon: Settings },
  { id: 'versions', titleKey: 'settingsMenu.versions.title', descriptionKey: 'settingsMenu.versions.description', icon: Package },
  { id: 'storage', titleKey: 'settingsMenu.storage.title', descriptionKey: 'settingsMenu.storage.description', icon: HardDrive },
  { id: 'diagnostics', titleKey: 'settingsMenu.diagnostics.title', descriptionKey: 'settingsMenu.diagnostics.description', icon: Activity },
];


export default function SystemSubMenuPanel() {
  const { t } = useI18n();
  const [sub, setSub] = useState<SystemSub | null>(getSubFromUrl);

  useEffect(() => {
    setSub(getSubFromUrl());
  }, []);

  useEffect(() => {
    const update = () => setSub(getSubFromUrl());
    window.addEventListener('popstate', update);
    document.addEventListener('astro:page-load', update);
    return () => {
      window.removeEventListener('popstate', update);
      document.removeEventListener('astro:page-load', update);
    };
  }, []);

  if (!canAccess('settings.server' as any)) return null;

  if (sub) {
    const item = SYSTEM_ITEMS.find((i) => i.id === sub)!;
    if (sub === 'setup') return <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}><SetupSection embedded /></SettingsSubPageFrame>;
    if (sub === 'notifications') return <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}><NotificationSettings /></SettingsSubPageFrame>;
    if (sub === 'hard-reset') return <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}><HardResetSection embedded /></SettingsSubPageFrame>;
    if (sub === 'versions') return <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}><VersionInfo /></SettingsSubPageFrame>;
    if (sub === 'storage') return <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}><StoragePanel /></SettingsSubPageFrame>;
    if (sub === 'diagnostics') return <SettingsSubPageFrame backHref={BASE_URL} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}><DiagnosticsPanel /></SettingsSubPageFrame>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
      {SYSTEM_ITEMS.map((item) => (
        <SettingsNavCard
          key={item.id}
          href={`${BASE_URL}&sub=${item.id}`}
          icon={item.icon}
          title={t(item.titleKey)}
          description={t(item.descriptionKey)}
        />
      ))}
    </div>
  );
}
