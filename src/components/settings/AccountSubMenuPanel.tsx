import { canAccess } from '../../lib/permissions';
import { getPopcornWebBaseUrl } from '../../lib/api/popcorn-web';
import {
  User,
  Info,
  Palette,
  Shield,
  Smartphone,
  LogOut,
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
import SubMenuPanel, { type SubMenuItem } from './SubMenuPanel';

export default function AccountSubMenuPanel() {
  const subItems: SubMenuItem[] = [
    {
      id: 'subscription',
      titleKey: 'settingsMenu.subscription.title',
      descriptionKey: 'settingsMenu.subscription.description',
      icon: CreditCard,
      permission: 'settings.account',
      inlineContent: SubscriptionStatusPanel,
    },
    {
      id: 'profile',
      titleKey: 'account.profile',
      descriptionKey: 'account.avatar',
      icon: User,
      permission: 'settings.account',
      inlineContent: () => <AccountSettings section="profile" />,
    },
    {
      id: 'info',
      titleKey: 'account.subMenu.accountInfo',
      descriptionKey: 'account.subMenu.accountInfoDesc',
      icon: Info,
      permission: 'settings.account',
      inlineContent: () => <AccountSettings section="info" />,
    },
    {
      id: 'interface',
      titleKey: 'account.interfaceSettings',
      descriptionKey: 'account.interfaceSettingsDescription',
      icon: Palette,
      permission: 'settings.account',
      href: '/settings?category=interface',
    },
    {
      id: '2fa',
      titleKey: 'account.twoFactor.title',
      descriptionKey: 'account.twoFactor.title',
      icon: Shield,
      permission: 'settings.account',
      inlineContent: TwoFactorSettings,
    },
    {
      id: 'quick-connect',
      titleKey: 'account.quickConnect.title',
      descriptionKey: 'account.quickConnect.description',
      icon: Smartphone,
      permission: 'settings.account',
      inlineContent: QuickConnectAuthorize,
    },
    {
      id: 'logout',
      titleKey: 'common.logout',
      descriptionKey: 'account.subMenu.logoutDesc',
      icon: LogOut,
      permission: 'settings.account',
      inlineContent: () => <AccountSettings section="logout" />,
    },
    {
      id: 'local-users',
      titleKey: 'settingsMenu.localUsers.title',
      descriptionKey: 'settingsMenu.localUsers.description',
      icon: Users,
      permission: 'settings.local_users',
      inlineContent: LocalUsersManager,
    },
    {
      id: 'feedback',
      titleKey: 'settingsMenu.feedback.title',
      descriptionKey: 'settingsMenu.feedback.description',
      icon: MessageCircle,
      permission: 'settings.account',
      href: '/settings/feedback',
    },
    {
      id: 'documentation',
      titleKey: 'settingsMenu.documentation.title',
      descriptionKey: 'settingsMenu.documentation.description',
      icon: BookOpen,
      hrefFn: () => `${getPopcornWebBaseUrl()}/docs`,
      isExternal: true,
    },
  ];

  const visibleItems = subItems.filter(
    (item) => !item.permission || canAccess(item.permission as any)
  );

  return <SubMenuPanel items={subItems} visibleItems={visibleItems} />;
}
