import { useState, useEffect } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Settings, Package, Activity, HardDrive, ChevronRight, ArrowLeft } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import { DsCard, DsCardSection } from '../ui/design-system';
import ServerSettings from './ServerSettings';
import VersionInfo from './VersionInfo';
import DiagnosticsPanel from './DiagnosticsPanel';
import StoragePanel from './StoragePanel';
import { serverApi } from '../../lib/client/server-api';
import { redirectTo } from '../../lib/utils/navigation.js';

const BASE_URL = '/settings?category=system';
const ACCENT_ICON_BG = 'var(--ds-accent-violet-muted)';
const ACCENT_ICON_COLOR = 'var(--ds-accent-violet)';

const SYSTEM_SUBS = ['setup', 'hard-reset', 'versions', 'storage', 'diagnostics'] as const;
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
  { id: 'hard-reset', titleKey: 'versionInfo.hardResetTitle', descriptionKey: 'versionInfo.hardResetDescription', icon: Settings },
  { id: 'versions', titleKey: 'settingsMenu.versions.title', descriptionKey: 'settingsMenu.versions.description', icon: Package },
  { id: 'storage', titleKey: 'settingsMenu.storage.title', descriptionKey: 'settingsMenu.storage.description', icon: HardDrive },
  { id: 'diagnostics', titleKey: 'settingsMenu.diagnostics.title', descriptionKey: 'settingsMenu.diagnostics.description', icon: Activity },
];

function SubPageFrame({
  item,
  children,
}: {
  item: SystemItem;
  children: ComponentChildren;
}) {
  const { t } = useI18n();
  const Icon = item.icon;
  return (
    <div className="space-y-6">
      <a
        href={BASE_URL}
        data-astro-prefetch
        className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ds-accent-violet)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 rounded"
        aria-label={t('common.back')}
      >
        <ArrowLeft className="w-4 h-4" aria-hidden />
        <span>{t('common.back')}</span>
      </a>
      <div className="rounded-[var(--ds-radius-lg)] overflow-hidden bg-[var(--ds-surface-elevated)] border border-[var(--ds-border)]">
        <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-[var(--ds-border)] flex items-center gap-3">
          <span
            className="inline-flex w-10 h-10 rounded-xl flex-shrink-0 items-center justify-center"
            style={{ backgroundColor: ACCENT_ICON_BG, color: ACCENT_ICON_COLOR }}
            aria-hidden
          >
            <Icon className="w-5 h-5" strokeWidth={1.8} />
          </span>
          <div>
            <h2 className="ds-title-card text-[var(--ds-text-primary)]">{t(item.titleKey)}</h2>
            <span className="ds-text-tertiary text-sm">{t(item.descriptionKey)}</span>
          </div>
        </div>
        <div className="p-4 sm:p-5 min-w-0">{children}</div>
      </div>
    </div>
  );
}

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
    if (sub === 'setup') return <SubPageFrame item={item}><SetupSection embedded /></SubPageFrame>;
    if (sub === 'hard-reset') return <SubPageFrame item={item}><HardResetSection embedded /></SubPageFrame>;
    if (sub === 'versions') return <SubPageFrame item={item}><VersionInfo /></SubPageFrame>;
    if (sub === 'storage') return <SubPageFrame item={item}><StoragePanel /></SubPageFrame>;
    if (sub === 'diagnostics') return <SubPageFrame item={item}><DiagnosticsPanel /></SubPageFrame>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
      {SYSTEM_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <a
            key={item.id}
            href={`${BASE_URL}&sub=${item.id}`}
            data-astro-prefetch="hover"
            data-settings-card
            className="block min-w-0 rounded-[var(--ds-radius-lg)] overflow-hidden transition-all hover:scale-[1.01] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] focus-visible:overflow-visible"
          >
            <DsCard variant="elevated" className="h-full">
              <DsCardSection className="flex flex-col h-full min-h-[120px]">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="inline-flex w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex-shrink-0 items-center justify-center"
                    style={{ backgroundColor: ACCENT_ICON_BG, color: ACCENT_ICON_COLOR }}
                    aria-hidden
                  >
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.8} />
                  </span>
                  <ChevronRight className="w-5 h-5 text-[var(--ds-text-tertiary)] flex-shrink-0 mt-0.5" aria-hidden />
                </div>
                <h2 className="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg mt-3 truncate">
                  {t(item.titleKey)}
                </h2>
                <span className="ds-text-tertiary text-sm mt-3 line-clamp-2">{t(item.descriptionKey)}</span>
                <span className="mt-auto pt-4 text-xs font-medium text-[var(--ds-accent-violet)] flex items-center gap-1" aria-hidden>
                  {t('common.open')}
                </span>
              </DsCardSection>
            </DsCard>
          </a>
        );
      })}
    </div>
  );
}
