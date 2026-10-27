import type { ComponentChildren } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess, isLocalUser } from '../../lib/permissions';
import { serverApi } from '../../lib/client/server-api';
import { redirectTo } from '../../lib/utils/navigation.js';
import { getPopcornWebBaseUrl } from '../../lib/api/popcorn-web';
import {
  User,
  Info,
  Palette,
  Shield,
  Smartphone,
  Users,
  MessageCircle,
  BookOpen,
  CreditCard,
  LogOut,
  KeyRound,
} from 'lucide-preact';
import AccountSettings from './AccountSettings';
import ConnectivityAlertCard from './ConnectivityAlertCard';
import TwoFactorSettings from './TwoFactorSettings';
import QuickConnectAuthorize from './QuickConnectAuthorize';
import LocalUsersManager from './LocalUsersManager';
import GuestPasswordSettings from './GuestPasswordSettings';
import SubscriptionStatusPanel from './SubscriptionStatusPanel';
import { getCachedSubscription, loadSubscription } from '../../lib/subscription-store';
import type { SubscriptionMe } from '../../lib/api/popcorn-web';
import { SettingsNavCard } from './SettingsNavCard';
import { SettingsSubPageFrame } from './SettingsSubPageFrame';

const BASE_URL_DEFAULT = '/settings/account/';

const ACCOUNT_SUBS = ['subscription', 'profile', 'password', 'info', 'devices', '2fa', 'quick-connect', 'local-users'] as const;
type AccountSub = (typeof ACCOUNT_SUBS)[number];

function getSubFromUrl(): AccountSub | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const sub = params.get('sub');
  return ACCOUNT_SUBS.includes(sub as AccountSub) ? (sub as AccountSub) : null;
}

type AccountItem =
  | {
      id: string;
      titleKey: string;
      descriptionKey: string;
      icon: typeof User;
      permission?: string;
      kind: 'link';
      href: string;
      isExternal?: boolean;
    }
  | {
      id: AccountSub;
      titleKey: string;
      descriptionKey: string;
      icon: typeof User;
      permission?: string;
      /** Réservé aux invités (les comptes cloud ont `canAccess` vrai partout). */
      guestOnly?: boolean;
      kind: 'sub';
    };

const ACCOUNT_ITEMS: AccountItem[] = [
  { id: 'subscription', titleKey: 'settingsMenu.subscription.title', descriptionKey: 'settingsMenu.subscription.description', icon: CreditCard, permission: 'settings.account', kind: 'sub' },
  { id: 'profile', titleKey: 'account.profile', descriptionKey: 'account.avatar', icon: User, permission: 'settings.profile', kind: 'sub' },
  { id: 'password', titleKey: 'settingsMenu.guestPassword.title', descriptionKey: 'settingsMenu.guestPassword.description', icon: KeyRound, permission: 'settings.profile', guestOnly: true, kind: 'sub' },
  { id: 'info', titleKey: 'account.subMenu.accountInfo', descriptionKey: 'account.subMenu.accountInfoDesc', icon: Info, permission: 'settings.account', kind: 'sub' },
  { id: 'devices', titleKey: 'account.devices.title', descriptionKey: 'account.devices.description', icon: Smartphone, permission: 'settings.account', kind: 'sub' },
  { id: 'interface', titleKey: 'account.interfaceSettings', descriptionKey: 'account.interfaceSettingsDescription', icon: Palette, permission: 'settings.ui_preferences', kind: 'link', href: '/settings/ui-preferences' },
  { id: '2fa', titleKey: 'account.twoFactor.title', descriptionKey: 'account.twoFactor.title', icon: Shield, permission: 'settings.account', kind: 'sub' },
  { id: 'quick-connect', titleKey: 'account.quickConnect.title', descriptionKey: 'account.quickConnect.description', icon: Smartphone, permission: 'settings.account', kind: 'sub' },
  { id: 'local-users', titleKey: 'settingsMenu.localUsers.title', descriptionKey: 'settingsMenu.localUsers.description', icon: Users, permission: 'settings.local_users', kind: 'sub' },
  { id: 'feedback', titleKey: 'settingsMenu.feedback.title', descriptionKey: 'settingsMenu.feedback.description', icon: MessageCircle, permission: 'settings.account', kind: 'link', href: '/settings/feedback' },
  { id: 'documentation', titleKey: 'settingsMenu.documentation.title', descriptionKey: 'settingsMenu.documentation.description', icon: BookOpen, kind: 'link', href: `${getPopcornWebBaseUrl()}/docs`, isExternal: true },
];

function SubPageFrame({ item, children, baseUrl }: { item: AccountItem; children: ComponentChildren; baseUrl: string }) {
  const { t } = useI18n();
  return (
    <SettingsSubPageFrame backHref={baseUrl} icon={item.icon} title={t(item.titleKey)} description={t(item.descriptionKey)}>
      {children}
    </SettingsSubPageFrame>
  );
}


export default function AccountSubMenuPanel({ baseUrl = BASE_URL_DEFAULT }: { baseUrl?: string }) {
  const { t } = useI18n();
  const [sub, setSub] = useState<AccountSub | null>(getSubFromUrl);
  const [subscriptionData, setSubscriptionData] = useState<SubscriptionMe | null | undefined>(() => getCachedSubscription() ?? undefined);

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

  useEffect(() => {
    if (subscriptionData !== undefined) return;
    let cancelled = false;
    loadSubscription()
      .then((d) => {
        if (!cancelled) setSubscriptionData(d ?? null);
      })
      .catch(() => {
        if (!cancelled) setSubscriptionData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [subscriptionData]);

  const guest = isLocalUser();
  const visible = ACCOUNT_ITEMS.filter(
    (item) =>
      (!item.permission || canAccess(item.permission as any)) &&
      !(item.kind === 'sub' && item.guestOnly && !guest)
  );

  const subParam = baseUrl.includes('?') ? '&sub=' : '?sub=';

  const subItem = sub ? ACCOUNT_ITEMS.find((i) => i.id === sub && i.kind === 'sub') : null;

  return (
    <div className="space-y-4">
      <ConnectivityAlertCard />
      <div className="hub-grid" data-tv-list role="list">
      {visible.map((item) => {
        const href = item.kind === 'link' ? item.href : `${baseUrl}${subParam}${item.id}`;
        const isExternal = item.kind === 'link' && !!item.isExternal;
        const isSubscriptionCard = item.id === 'subscription';
        const hasPlanActive = subscriptionData?.subscription?.status === 'active';
        const hasStreamingTorrent = subscriptionData?.streamingTorrent === true;
        const desc = isSubscriptionCard && subscriptionData !== undefined
          ? subscriptionData === null
            ? t('settingsMenu.subscription.notConnected')
            : hasPlanActive
              ? t('settingsMenu.subscription.cardActivePlan', {
                  plan: subscriptionData.subscription!.planName || subscriptionData.subscription!.planSlug || t('settingsMenu.subscription.plan'),
                })
              : hasStreamingTorrent
                ? t('settingsMenu.subscription.cardActivePlan', { plan: t('settingsMenu.subscription.streamingTorrentOption') })
                : t('settingsMenu.subscription.cardNoPlan')
          : t(item.descriptionKey);

        const status = isSubscriptionCard && subscriptionData !== undefined
          ? subscriptionData === null
            ? 'disabled' as const
            : hasPlanActive || hasStreamingTorrent
              ? 'connected' as const
              : 'limited' as const
          : undefined;

        return (
          <SettingsNavCard
            key={item.id}
            href={href}
            icon={item.icon}
            title={t(item.titleKey)}
            description={desc}
            isExternal={isExternal}
            status={status}
          />
        );
      })}
      </div>
      {isLocalUser() && (
        <div className="flex justify-start">
          <button
            type="button"
            className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface-elevated)] text-[var(--ds-text-primary)] text-sm font-medium hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)]"
            onClick={async () => {
              try {
                await serverApi.logout();
              } catch {
                // ignore : on quitte la session locale quoi qu'il arrive
              }
              redirectTo('/login');
            }}
            tabIndex={0}
            data-focusable
          >
            <LogOut className="w-4 h-4" />
            {t('account.logout')}
          </button>
        </div>
      )}
      {subItem && sub === 'subscription' && <SubPageFrame item={subItem} baseUrl={baseUrl}><SubscriptionStatusPanel /></SubPageFrame>}
      {subItem && sub === 'profile' && <SubPageFrame item={subItem} baseUrl={baseUrl}><AccountSettings section="profile" /></SubPageFrame>}
      {subItem && sub === 'password' && guest && <SubPageFrame item={subItem} baseUrl={baseUrl}><GuestPasswordSettings /></SubPageFrame>}
      {subItem && sub === 'info' && <SubPageFrame item={subItem} baseUrl={baseUrl}><AccountSettings section="info" /></SubPageFrame>}
      {subItem && sub === 'devices' && <SubPageFrame item={subItem} baseUrl={baseUrl}><AccountSettings section="devices" /></SubPageFrame>}
      {subItem && sub === '2fa' && <SubPageFrame item={subItem} baseUrl={baseUrl}><TwoFactorSettings /></SubPageFrame>}
      {subItem && sub === 'quick-connect' && <SubPageFrame item={subItem} baseUrl={baseUrl}><QuickConnectAuthorize /></SubPageFrame>}
      {subItem && sub === 'local-users' && <SubPageFrame item={subItem} baseUrl={baseUrl}><LocalUsersManager /></SubPageFrame>}
    </div>
  );
}
