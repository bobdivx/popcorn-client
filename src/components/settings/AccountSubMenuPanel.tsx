import type { ComponentChildren } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
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
} from 'lucide-preact';
import AccountSettings from './AccountSettings';
import TwoFactorSettings from './TwoFactorSettings';
import QuickConnectAuthorize from './QuickConnectAuthorize';
import LocalUsersManager from './LocalUsersManager';
import SubscriptionStatusPanel from './SubscriptionStatusPanel';
import { getCachedSubscription, loadSubscription } from '../../lib/subscription-store';
import type { SubscriptionMe } from '../../lib/api/popcorn-web';
import { SettingsNavCard } from './SettingsNavCard';
import { SettingsSubPageFrame } from './SettingsSubPageFrame';

const BASE_URL_DEFAULT = '/settings?category=account';

const ACCOUNT_SUBS = ['subscription', 'profile', 'info', 'devices', '2fa', 'quick-connect', 'local-users'] as const;
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
      kind: 'sub';
    };

const ACCOUNT_ITEMS: AccountItem[] = [
  { id: 'subscription', titleKey: 'settingsMenu.subscription.title', descriptionKey: 'settingsMenu.subscription.description', icon: CreditCard, permission: 'settings.account', kind: 'sub' },
  { id: 'profile', titleKey: 'account.profile', descriptionKey: 'account.avatar', icon: User, permission: 'settings.account', kind: 'sub' },
  { id: 'info', titleKey: 'account.subMenu.accountInfo', descriptionKey: 'account.subMenu.accountInfoDesc', icon: Info, permission: 'settings.account', kind: 'sub' },
  { id: 'devices', titleKey: 'account.devices.title', descriptionKey: 'account.devices.description', icon: Smartphone, permission: 'settings.account', kind: 'sub' },
  { id: 'interface', titleKey: 'account.interfaceSettings', descriptionKey: 'account.interfaceSettingsDescription', icon: Palette, permission: 'settings.account', kind: 'link', href: '/settings/ui-preferences' },
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

  const visible = ACCOUNT_ITEMS.filter(
    (item) => !item.permission || canAccess(item.permission as any)
  );

  const subParam = baseUrl.includes('?') ? '&sub=' : '?sub=';

  if (sub) {
    const item = ACCOUNT_ITEMS.find((i) => i.id === sub);
    if (item && item.kind === 'sub') {
      if (sub === 'subscription') return <SubPageFrame item={item} baseUrl={baseUrl}><SubscriptionStatusPanel /></SubPageFrame>;
      if (sub === 'profile') return <SubPageFrame item={item} baseUrl={baseUrl}><AccountSettings section="profile" /></SubPageFrame>;
      if (sub === 'info') return <SubPageFrame item={item} baseUrl={baseUrl}><AccountSettings section="info" /></SubPageFrame>;
      if (sub === 'devices') return <SubPageFrame item={item} baseUrl={baseUrl}><AccountSettings section="devices" /></SubPageFrame>;
      if (sub === '2fa') return <SubPageFrame item={item} baseUrl={baseUrl}><TwoFactorSettings /></SubPageFrame>;
      if (sub === 'quick-connect') return <SubPageFrame item={item} baseUrl={baseUrl}><QuickConnectAuthorize /></SubPageFrame>;
      if (sub === 'local-users') return <SubPageFrame item={item} baseUrl={baseUrl}><LocalUsersManager /></SubPageFrame>;
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
      {visible.map((item) => {
        const href = item.kind === 'link' ? item.href : `${baseUrl}${subParam}${item.id}`;
        const isExternal = item.kind === 'link' && !!item.isExternal;
        const isSubscriptionCard = item.id === 'subscription';
        const desc = isSubscriptionCard && subscriptionData !== undefined
          ? subscriptionData === null
            ? t('settingsMenu.subscription.notConnected')
            : subscriptionData.subscription
              ? t('settingsMenu.subscription.cardActivePlan', {
                  plan: subscriptionData.subscription.planName || subscriptionData.subscription.planSlug || t('settingsMenu.subscription.plan'),
                })
              : t('settingsMenu.subscription.cardNoPlan')
          : t(item.descriptionKey);

        const rightSlot = isSubscriptionCard && subscriptionData?.subscription
          ? (
            <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:9999px;background:rgba(124,58,237,0.18);color:#a78bfa;flex-shrink:0;">
              {subscriptionData.subscription.status === 'active' ? t('settingsMenu.overviewCard.accountLoggedIn') : subscriptionData.subscription.status}
            </span>
          )
          : undefined;

        return (
          <SettingsNavCard
            key={item.id}
            href={href}
            icon={item.icon}
            title={t(item.titleKey)}
            description={desc}
            isExternal={isExternal}
            rightSlot={rightSlot}
          />
        );
      })}
    </div>
  );
}
