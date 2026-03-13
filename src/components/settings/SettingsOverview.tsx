import { Monitor, UserCircle, RefreshCw, Search, Smartphone, ChevronRight, Upload, Server } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { useMemo, useState, useEffect } from 'preact/hooks';
import { canAccess } from '../../lib/permissions';
import { serverApi } from '../../lib/client/server-api';
import { TokenManager } from '../../lib/client/storage';
import { getSyncStatusStore, subscribeSyncStatusStore, refreshSyncStatusStore } from '../../lib/sync-status-store';
import { getBackendUrl, isBackendUrlSameAsClientUrl } from '../../lib/backend-config';

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
  { id: 'uploads', titleKey: 'settingsPages.uploads.title', href: '/settings/uploads', icon: Upload, permission: 'settings.indexers', accent: 'violet' },
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

  const showSameOriginBackendCard = useMemo(() => {
    if (typeof window === 'undefined') return false;
    const url = getBackendUrl();
    return !!url && isBackendUrlSameAsClientUrl(url);
  }, []);

  return (
    <div class="ds-container max-w-5xl py-4 sm:py-6 px-3 sm:px-6">
      <h1 style="font-size:1.5rem;font-weight:700;color:rgba(255,255,255,0.92);margin-bottom:6px;">{t('settingsMenu.overview')}</h1>
      <p style="font-size:13px;color:rgba(255,255,255,0.42);margin-bottom:24px;">{t('settingsMenu.subtitle')}</p>

      {showSameOriginBackendCard && canAccess('settings.server' as any) && (
        <a
          href="/settings/server"
          data-astro-prefetch
          data-settings-card
          class="sc-nav-link"
          style="display:block;margin-bottom:20px;"
        >
          <div class="sc-nav-card" style="flex-direction:row;align-items:center;gap:16px;border-left:3px solid rgba(234,179,8,0.5);min-height:auto;padding:16px 20px;">
            <div class="sc-nav-icon sc-nav-icon--yellow" style="flex-shrink:0;">
              <Server className="w-5 h-5" strokeWidth={1.8} aria-hidden />
            </div>
            <div style="flex:1;min-width:0;">
              <div class="sc-nav-title" style="margin-top:0;">{t('settingsMenu.overviewCard.sameOriginBackendTitle')}</div>
              <div class="sc-nav-desc" style="overflow:visible;-webkit-line-clamp:unset;">{t('settingsMenu.overviewCard.sameOriginBackendDescription')}</div>
              <div class="sc-nav-open" style="margin-top:6px;padding-top:0;">{t('settingsMenu.overviewCard.sameOriginBackendAction')}</div>
            </div>
            <div class="sc-nav-chevron">
              <ChevronRight className="w-5 h-5" aria-hidden />
            </div>
          </div>
        </a>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const summary = summaries[item.id];
          const isSyncCardInProgress = item.id === 'sync' && syncInProgress;
          const accentKey = item.accent ?? 'violet';
          return (
            <a
              key={item.id}
              href={item.href}
              data-astro-prefetch
              data-settings-card
              data-focusable
              class="sc-nav-link"
            >
              <div class="sc-nav-card">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">
                  <div class={`sc-nav-icon sc-nav-icon--${accentKey}`}>
                    <Icon className="w-5 h-5" strokeWidth={1.8} aria-hidden />
                  </div>
                  <div class="sc-nav-chevron">
                    <ChevronRight className="w-5 h-5 mt-0.5" aria-hidden />
                  </div>
                </div>
                <div class="sc-nav-title">{t(item.titleKey)}</div>
                {summary ? (
                  <div class={`sc-status-badge sc-status-badge--${summary.variant ?? 'neutral'}`} aria-hidden>
                    {isSyncCardInProgress && <span className="loading loading-spinner loading-xs mr-1" />}
                    {summary.text}
                  </div>
                ) : (
                  <div class="sc-nav-desc">{t('common.configure')}</div>
                )}
                <div class="sc-nav-footer" aria-hidden>
                  <span class="sc-nav-open">{t('common.open')}</span>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
