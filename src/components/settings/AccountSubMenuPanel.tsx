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
  ChevronRight,
  ArrowLeft,
} from 'lucide-preact';
import AccountSettings from './AccountSettings';
import TwoFactorSettings from './TwoFactorSettings';
import QuickConnectAuthorize from './QuickConnectAuthorize';
import LocalUsersManager from './LocalUsersManager';
import SubscriptionStatusPanel from './SubscriptionStatusPanel';
import { DsCard, DsCardSection } from '../ui/design-system';
import { getCachedSubscription, loadSubscription } from '../../lib/subscription-store';
import type { SubscriptionMe } from '../../lib/api/popcorn-web';

const BASE_URL_DEFAULT = '/settings?category=account';
const ACCENT_ICON_BG = 'var(--ds-accent-violet-muted)';
const ACCENT_ICON_COLOR = 'var(--ds-accent-violet)';

const ACCOUNT_SUBS = ['subscription', 'profile', 'info', '2fa', 'quick-connect', 'local-users'] as const;
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
  { id: 'interface', titleKey: 'account.interfaceSettings', descriptionKey: 'account.interfaceSettingsDescription', icon: Palette, permission: 'settings.account', kind: 'link', href: '/settings/ui-preferences' },
  { id: '2fa', titleKey: 'account.twoFactor.title', descriptionKey: 'account.twoFactor.title', icon: Shield, permission: 'settings.account', kind: 'sub' },
  { id: 'quick-connect', titleKey: 'account.quickConnect.title', descriptionKey: 'account.quickConnect.description', icon: Smartphone, permission: 'settings.account', kind: 'sub' },
  { id: 'local-users', titleKey: 'settingsMenu.localUsers.title', descriptionKey: 'settingsMenu.localUsers.description', icon: Users, permission: 'settings.local_users', kind: 'sub' },
  { id: 'feedback', titleKey: 'settingsMenu.feedback.title', descriptionKey: 'settingsMenu.feedback.description', icon: MessageCircle, permission: 'settings.account', kind: 'link', href: '/settings/feedback' },
  { id: 'documentation', titleKey: 'settingsMenu.documentation.title', descriptionKey: 'settingsMenu.documentation.description', icon: BookOpen, kind: 'link', href: `${getPopcornWebBaseUrl()}/docs`, isExternal: true },
];

function SubPageFrame({ item, children, baseUrl }: { item: AccountItem; children: ComponentChildren; baseUrl: string }) {
  const { t } = useI18n();
  const Icon = item.icon;
  return (
    <div className="space-y-6">
      <a
        href={baseUrl}
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
      if (sub === '2fa') return <SubPageFrame item={item} baseUrl={baseUrl}><TwoFactorSettings /></SubPageFrame>;
      if (sub === 'quick-connect') return <SubPageFrame item={item} baseUrl={baseUrl}><QuickConnectAuthorize /></SubPageFrame>;
      if (sub === 'local-users') return <SubPageFrame item={item} baseUrl={baseUrl}><LocalUsersManager /></SubPageFrame>;
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
      {visible.map((item) => {
        const Icon = item.icon;
        const href = item.kind === 'link' ? item.href : `${baseUrl}${subParam}${item.id}`;
        const external = item.kind === 'link' && item.isExternal ? { target: '_blank' as const, rel: 'noopener noreferrer' } : {};
        const isSubscriptionCard = item.id === 'subscription';
        const subDesc =
          isSubscriptionCard && subscriptionData !== undefined
            ? subscriptionData === null
              ? t('settingsMenu.subscription.notConnected')
              : subscriptionData.subscription
                ? t('settingsMenu.subscription.cardActivePlan', {
                    plan: subscriptionData.subscription.planName || subscriptionData.subscription.planSlug || t('settingsMenu.subscription.plan'),
                  })
                : t('settingsMenu.subscription.cardNoPlan')
            : isSubscriptionCard
              ? t(item.descriptionKey)
              : t(item.descriptionKey);
        return (
          <a
            key={item.id}
            href={href}
            {...external}
            data-astro-prefetch={item.kind === 'sub' ? 'hover' : !(item.kind === 'link' && item.isExternal) ? 'hover' : undefined}
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
                  {isSubscriptionCard && subscriptionData?.subscription && (
                    <span className="text-xs font-medium px-2 py-1 rounded-full bg-[var(--ds-accent-violet-muted)] text-[var(--ds-accent-violet)] flex-shrink-0">
                      {subscriptionData.subscription.status === 'active' ? t('settingsMenu.overviewCard.accountLoggedIn') : subscriptionData.subscription.status}
                    </span>
                  )}
                  {(!isSubscriptionCard || !subscriptionData?.subscription) && (
                    <ChevronRight className="w-5 h-5 text-[var(--ds-text-tertiary)] flex-shrink-0 mt-0.5" aria-hidden />
                  )}
                </div>
                <h2 className="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg mt-3 truncate">
                  {t(item.titleKey)}
                </h2>
                <span className="ds-text-tertiary text-sm mt-3 line-clamp-2">{subDesc}</span>
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
