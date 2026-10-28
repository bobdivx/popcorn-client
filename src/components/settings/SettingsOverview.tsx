import {
  Monitor,
  UserCircle,
  Puzzle,
  Wrench,
  Tv,
  Palette,
  Play,
  Library,
  Settings,
} from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { useMemo, useState, useEffect } from 'preact/hooks';
import { canAccess } from '../../lib/permissions';
import { serverApi } from '../../lib/client/server-api';
import { TokenManager } from '../../lib/client/storage';
import { getCachedSubscription, loadSubscription } from '../../lib/subscription-store';
import { isBackendUrlSameAsClientUrl, getBackendUrl } from '../../lib/backend-config';
import { HubGrid, HubTile, type HubStatus } from './hub/HubTile';
import { IS_STORE_BUILD, STORE_MODULES_ENABLED, isHubSettingsCategory, isRouteBlockedInStoreBuild } from '../../lib/distribution';
import { useServerCapabilities } from '../../lib/capabilities';

type TileDef = {
  id: string;
  titleKey: string;
  hintKey: string;
  href: string;
  icon: typeof Monitor;
  permission?: string;
  permissions?: string[];
  /** Libellés fixes FR/EN quand aucune clé i18n n'existe. */
  title?: { fr: string; en: string };
  hint?: { fr: string; en: string };
};

const TILES: TileDef[] = [
  { id: 'server', titleKey: 'settingsMenu.category.system', hintKey: 'settingsMenu.hub.hint.server', href: '/settings/server/', icon: Monitor, permission: 'settings.server' },
  { id: 'system-tools', titleKey: 'settingsMenu.hub.systemTools', hintKey: 'settingsMenu.hub.hint.systemTools', href: '/settings/system/', icon: Settings, permission: 'settings.server' },
  { id: 'modules', titleKey: 'settingsMenu.modules', hintKey: 'settingsMenu.hub.hint.modules', title: { fr: 'Modules', en: 'Modules' }, hint: { fr: 'Fonctions optionnelles du serveur', en: 'Optional server features' }, href: '/settings/modules/', icon: Puzzle, permission: 'settings.server' },
  { id: 'maintenance', titleKey: 'settingsMenu.category.maintenance', hintKey: 'settingsMenu.hub.hint.maintenance', href: '/settings/maintenance/', icon: Wrench, permission: 'settings.server' },
  { id: 'webos', titleKey: 'settingsMenu.webosDeployment', hintKey: 'settingsMenu.hub.hint.webos', href: '/settings/webos-deployment/', icon: Tv, permission: 'settings.server' },
  { id: 'interface', titleKey: 'settingsMenu.category.interface', hintKey: 'settingsMenu.hub.hint.interface', href: '/settings/ui-preferences/', icon: Palette, permission: 'settings.ui_preferences' },
  { id: 'playback', titleKey: 'settingsMenu.category.playback', hintKey: 'settingsMenu.hub.hint.playback', href: '/settings/playback/', icon: Play, permission: 'settings.ui_preferences' },
  { id: 'library', titleKey: 'settingsMenu.category.library', hintKey: 'settingsMenu.hub.hint.library', href: '/settings/library/', icon: Library, permissions: ['settings.server', 'settings.friends'] },
  { id: 'account', titleKey: 'settingsMenu.category.account', hintKey: 'settingsMenu.hub.hint.account', href: '/settings/account/', icon: UserCircle, permission: 'settings.profile' },
];

function isVisible(item: TileDef): boolean {
  // Fonctions retirées, version store, module absent du serveur connecté, ou réglages d'un module
  // (indexers, téléchargements, découverte) : accessibles depuis la tuile Modules, pas ici.
  if (!isHubSettingsCategory(item.id) || isRouteBlockedInStoreBuild(item.href)) return false;
  if (IS_STORE_BUILD && !STORE_MODULES_ENABLED && item.id === 'modules') return false;
  if (item.permission) return canAccess(item.permission as any);
  if (item.permissions?.length) return item.permissions.some((p) => canAccess(p as any));
  return true;
}

export default function SettingsOverview() {
  const { t, language } = useI18n();
  const serverCapabilities = useServerCapabilities();
  const visibleItems = useMemo(() => TILES.filter(isVisible), [serverCapabilities]);
  const [serverStatus, setServerStatus] = useState<HubStatus | null>(null);
  const [serverMeta, setServerMeta] = useState<string | undefined>();
  const [accountStatus, setAccountStatus] = useState<HubStatus | null>(null);
  const [accountMeta, setAccountMeta] = useState<string | undefined>();

  useEffect(() => {
    if (!canAccess('settings.server' as any)) return;
    let cancelled = false;
    const sameOrigin = (() => {
      const url = getBackendUrl();
      return !!url && isBackendUrlSameAsClientUrl(url);
    })();
    serverApi.checkServerHealth()
      .then((res) => {
        if (cancelled) return;
        const reachable = res.success && (res.data as { reachable?: boolean } | undefined)?.reachable;
        if (!reachable) {
          setServerStatus('disabled');
          setServerMeta(t('settingsMenu.overviewCard.serverOffline'));
        } else if (sameOrigin) {
          setServerStatus('limited');
          setServerMeta(t('settingsMenu.overviewCard.sameOriginBackendTitle'));
        } else {
          setServerStatus('connected');
          setServerMeta(t('settingsMenu.overviewCard.serverConnected'));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setServerStatus('disabled');
          setServerMeta(t('settingsMenu.overviewCard.serverOffline'));
        }
      });
    return () => { cancelled = true; };
  }, [t]);

  useEffect(() => {
    if (!canAccess('settings.account' as any)) return;
    let cancelled = false;
    const run = async () => {
      try {
        const loggedIn = typeof TokenManager.getCloudAccessToken === 'function' && !!TokenManager.getCloudAccessToken();
        if (!loggedIn) {
          if (!cancelled) {
            setAccountStatus('disabled');
            setAccountMeta(t('settingsMenu.overviewCard.accountNotLoggedIn'));
          }
          return;
        }
        const cached = getCachedSubscription();
        const sub = cached !== null ? cached : await loadSubscription().catch(() => null);
        if (cancelled) return;
        if (sub?.subscription?.status === 'active') {
          const plan = sub.subscription.planName || sub.subscription.planSlug || '';
          setAccountStatus('connected');
          setAccountMeta(t('settingsMenu.subscription.cardActivePlan', { plan }));
        } else if (sub?.streamingTorrent === true) {
          setAccountStatus('connected');
          setAccountMeta(t('settingsMenu.subscription.cardActivePlan', { plan: t('settingsMenu.subscription.streamingTorrentOption') }));
        } else {
          setAccountStatus('limited');
          setAccountMeta(t('settingsMenu.subscription.cardNoPlan'));
        }
      } catch {
        if (!cancelled) setAccountStatus('disabled');
      }
    };
    run();
    return () => { cancelled = true; };
  }, [t]);

  return (
    <div class="hub-page">
      <header class="hub-header">
        <h1 class="hub-title">{t('settingsMenu.title')}</h1>
        <p class="hub-subtitle">{t('settingsMenu.subtitle')}</p>
      </header>
      <HubGrid>
        {visibleItems.map((item) => {
          const status = item.id === 'server' ? serverStatus ?? undefined : item.id === 'account' ? accountStatus ?? undefined : undefined;
          const meta = item.id === 'server' ? serverMeta : item.id === 'account' ? accountMeta : undefined;
          return (
            <HubTile
              key={item.id}
              href={item.href}
              icon={item.icon}
              title={item.title ? item.title[language === 'en' ? 'en' : 'fr'] : t(item.titleKey)}
              hint={status ? undefined : item.hint ? item.hint[language === 'en' ? 'en' : 'fr'] : t(item.hintKey)}
              meta={meta}
              status={status ?? undefined}
              statusLabel={
                status === 'connected'
                  ? t('settingsMenu.hub.connected')
                  : status === 'limited'
                    ? t('settingsMenu.hub.limited')
                    : status === 'disabled'
                      ? t('settingsMenu.hub.disabled')
                      : undefined
              }
            />
          );
        })}
      </HubGrid>
    </div>
  );
}
