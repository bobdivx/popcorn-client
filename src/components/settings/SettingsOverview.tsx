import { Monitor, UserCircle, RefreshCw, Search, Smartphone, ChevronRight } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { useMemo, useState, useEffect } from 'preact/hooks';
import { canAccess } from '../../lib/permissions';
import { DsCard, DsCardSection } from '../ui/design-system';
import { serverApi } from '../../lib/client/server-api';
import { TokenManager } from '../../lib/client/storage';
import { getSyncStatusStore, subscribeSyncStatusStore, refreshSyncStatusStore } from '../../lib/sync-status-store';

type StatusVariant = 'success' | 'warning' | 'error' | 'neutral';

type OverviewItem = {
  id: string;
  titleKey: string;
  href: string;
  icon: typeof Monitor;
  permission?: string;
  permissions?: string[];
  accent?: 'violet' | 'green' | 'yellow';
};

// Sync en premier, puis server, account, indexers, connexion rapide
const OVERVIEW_ITEMS: OverviewItem[] = [
  { id: 'sync', titleKey: 'settingsPages.sync.title', href: '/settings/sync', icon: RefreshCw, permission: 'settings.sync', accent: 'yellow' },
  { id: 'server', titleKey: 'settingsPages.server.title', href: '/settings/server', icon: Monitor, permission: 'settings.server', accent: 'violet' },
  { id: 'account', titleKey: 'settingsPages.account.title', href: '/settings/account', icon: UserCircle, permission: 'settings.account', accent: 'green' },
  { id: 'indexers', titleKey: 'settingsPages.indexers.title', href: '/settings/indexers', icon: Search, permission: 'settings.indexers', accent: 'violet' },
  { id: 'quick-connect', titleKey: 'account.quickConnect.title', href: '/settings/account', icon: Smartphone, permission: 'settings.account', accent: 'violet' },
];

function isVisible(item: OverviewItem): boolean {
  if (item.permission) return canAccess(item.permission as any);
  if (item.permissions?.length) return item.permissions.some((p) => canAccess(p as any));
  return true;
}

function formatSyncDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return '< 1 min';
  if (diffMin < 60) return `${diffMin} min`;
  if (diffH < 24) return `${diffH} h`;
  if (diffD < 7) return `${diffD} j`;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function SettingsOverview() {
  const { t } = useI18n();
  const visibleItems = useMemo(() => OVERVIEW_ITEMS.filter(isVisible), []);
  const [summaries, setSummaries] = useState<Record<string, { text: string; variant?: StatusVariant }>>({});
  const [syncInProgress, setSyncInProgress] = useState(false);

  useEffect(() => {
    if (canAccess('settings.sync' as any)) {
      refreshSyncStatusStore();
    }
  }, []);

  useEffect(() => {
    if (!canAccess('settings.sync' as any)) return undefined;
    const unsub = subscribeSyncStatusStore((store) => {
      const d = store.status;
      if (!d) return;
      setSyncInProgress(Boolean(d.sync_in_progress));
      const indexerCount = d.stats_by_indexer ? Object.keys(d.stats_by_indexer).length : 0;
      const suffix = indexerCount > 0 ? ' · ' + t('settingsMenu.overviewCard.syncIndexersCount', { count: indexerCount }) : '';
      let sync: { text: string; variant?: StatusVariant };
      if (d.sync_in_progress) {
        sync = { text: t('settingsMenu.overviewCard.syncInProgress') + suffix, variant: 'warning' };
      } else if (d.last_sync_date) {
        sync = { text: t('settingsMenu.overviewCard.syncLastDate', { date: formatSyncDate(d.last_sync_date) }) + suffix, variant: 'success' };
      } else {
        sync = indexerCount > 0
          ? { text: t('settingsMenu.overviewCard.syncOk') + ' · ' + t('settingsMenu.overviewCard.syncIndexersCount', { count: indexerCount }), variant: 'success' }
          : { text: t('settingsMenu.overviewCard.syncNoData'), variant: 'neutral' };
      }
      setSummaries((prev) => ({ ...prev, sync }));
    });
    return unsub;
  }, [t]);

  useEffect(() => {
    const load = async () => {
      const next: Record<string, { text: string; variant?: StatusVariant }> = {};

      if (canAccess('settings.sync' as any)) {
        const d = getSyncStatusStore().status;
        setSyncInProgress(Boolean(d?.sync_in_progress));
        if (d) {
          const indexerCount = d.stats_by_indexer ? Object.keys(d.stats_by_indexer).length : 0;
          const suffix = indexerCount > 0 ? ' · ' + t('settingsMenu.overviewCard.syncIndexersCount', { count: indexerCount }) : '';
          if (d.sync_in_progress) {
            next.sync = { text: t('settingsMenu.overviewCard.syncInProgress') + suffix, variant: 'warning' };
          } else if (d.last_sync_date) {
            next.sync = { text: t('settingsMenu.overviewCard.syncLastDate', { date: formatSyncDate(d.last_sync_date) }) + suffix, variant: 'success' };
          } else {
            next.sync = indexerCount > 0
              ? { text: t('settingsMenu.overviewCard.syncOk') + ' · ' + t('settingsMenu.overviewCard.syncIndexersCount', { count: indexerCount }), variant: 'success' }
              : { text: t('settingsMenu.overviewCard.syncNoData'), variant: 'neutral' };
          }
        }
      }

      if (canAccess('settings.server' as any)) {
        try {
          const res = await serverApi.checkServerHealth();
          if (res.success && res.data) {
            const reachable = (res.data as { reachable?: boolean }).reachable;
            next.server = reachable
              ? { text: t('settingsMenu.overviewCard.serverConnected'), variant: 'success' }
              : { text: t('settingsMenu.overviewCard.serverOffline'), variant: 'error' };
          }
        } catch {
          next.server = { text: t('settingsMenu.overviewCard.serverOffline'), variant: 'error' };
        }
      }

      if (canAccess('settings.account' as any)) {
        try {
          const loggedIn = typeof TokenManager.getCloudAccessToken === 'function' && !!TokenManager.getCloudAccessToken();
          next.account = loggedIn
            ? { text: t('settingsMenu.overviewCard.accountLoggedIn'), variant: 'success' }
            : { text: t('settingsMenu.overviewCard.accountNotLoggedIn'), variant: 'neutral' };
        } catch {
          // ignore
        }
      }

      if (canAccess('settings.indexers' as any)) {
        try {
          const res = await serverApi.getIndexers();
          if (res.success && Array.isArray(res.data)) {
            next.indexers = { text: t('settingsMenu.overviewCard.indexersCount', { count: res.data.length }), variant: 'neutral' };
          }
        } catch {
          // ignore
        }
      }

      setSummaries((prev) => ({ ...prev, ...next }));
    };
    load();
  }, [t]);

  const accentIconBg: Record<string, string> = {
    violet: 'var(--ds-accent-violet-muted)',
    green: 'rgba(200, 230, 201, 0.35)',
    yellow: 'rgba(255, 249, 196, 0.4)',
  };
  const accentIconColor: Record<string, string> = {
    violet: 'var(--ds-accent-violet)',
    green: 'var(--ds-accent-green)',
    yellow: '#c9b800',
  };

  return (
    <div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6">
      <h1 className="ds-title-page">{t('settingsMenu.overview')}</h1>
      <p className="ds-text-secondary mb-4 sm:mb-6 text-sm sm:text-base">{t('settingsMenu.subtitle')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const summary = summaries[item.id];
          const iconBg = (item.accent && accentIconBg[item.accent]) || accentIconBg.violet;
          const iconColor = (item.accent && accentIconColor[item.accent]) || accentIconColor.violet;
          const isSyncCardInProgress = item.id === 'sync' && syncInProgress;
          return (
            <a
              key={item.id}
              href={item.href}
              data-astro-prefetch
              className={`block min-w-0 rounded-[var(--ds-radius-lg)] overflow-hidden transition-all hover:scale-[1.01] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] ${isSyncCardInProgress ? 'overview-card--sync-in-progress' : ''}`}
            >
              <DsCard variant="elevated" className="h-full">
                <DsCardSection className="flex flex-col h-full min-h-[120px]">
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`inline-flex w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex-shrink-0 items-center justify-center ${isSyncCardInProgress ? 'overview-card-icon--syncing' : ''}`}
                      style={{ backgroundColor: iconBg, color: iconColor }}
                      aria-hidden
                    >
                      <Icon className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.8} />
                    </span>
                    <ChevronRight className="w-5 h-5 text-[var(--ds-text-tertiary)] flex-shrink-0 mt-0.5" aria-hidden />
                  </div>
                  <h2 className="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg mt-3 truncate">{t(item.titleKey)}</h2>
                  {summary ? (
                    <span
                      className={`ds-status-badge ds-status-badge--${summary.variant || 'neutral'} mt-3 w-fit inline-flex items-center gap-2`}
                      aria-hidden
                    >
                      {isSyncCardInProgress && (
                        <span className="overview-card-sync-spinner" aria-hidden>
                          <span className="loading loading-spinner loading-sm" />
                        </span>
                      )}
                      {summary.text}
                    </span>
                  ) : (
                    <span className="ds-text-tertiary text-sm mt-3">{t('common.configure')}</span>
                  )}
                  <span className="mt-auto pt-4 text-xs font-medium text-[var(--ds-accent-violet)] flex items-center gap-1" aria-hidden>
                    {t('common.open')}
                  </span>
                </DsCardSection>
              </DsCard>
            </a>
          );
        })}
      </div>
    </div>
  );
}
