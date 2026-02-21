import type { ComponentChildren } from 'preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import { getPopcornWebBaseUrl } from '../../lib/api/popcorn-web';
import {
  User,
  Smartphone,
  Users,
  MessageCircle,
  BookOpen,
  CreditCard,
} from 'lucide-preact';
import { ChevronRight } from 'lucide-preact';
import AccountSettings from './AccountSettings';
import QuickConnectAuthorize from './QuickConnectAuthorize';
import LocalUsersManager from './LocalUsersManager';
import SubscriptionStatusPanel from './SubscriptionStatusPanel';
import { DsCard, DsCardSection, DsSettingsSectionCard, focusGlowClass } from '../ui/design-system';

const ACCENT_ICON_BG = 'var(--ds-accent-violet-muted)';
const ACCENT_ICON_COLOR = 'var(--ds-accent-violet)';

type Item =
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
      id: string;
      titleKey: string;
      descriptionKey: string;
      icon: typeof User;
      permission?: string;
      kind: 'inline';
      content: ComponentChildren;
    };

export default function AccountSubMenuPanel() {
  const { t } = useI18n();

  const items: Item[] = [
    {
      id: 'subscription',
      titleKey: 'settingsMenu.subscription.title',
      descriptionKey: 'settingsMenu.subscription.description',
      icon: CreditCard,
      permission: 'settings.account',
      kind: 'inline',
      content: <SubscriptionStatusPanel />,
    },
    {
      id: 'profile',
      titleKey: 'account.profile',
      descriptionKey: 'account.profileCardDescription',
      icon: User,
      permission: 'settings.account',
      kind: 'inline',
      content: <AccountSettings section="all" />,
    },
    {
      id: 'quick-connect',
      titleKey: 'account.quickConnect.title',
      descriptionKey: 'account.quickConnect.description',
      icon: Smartphone,
      permission: 'settings.account',
      kind: 'inline',
      content: <QuickConnectAuthorize />,
    },
    {
      id: 'local-users',
      titleKey: 'settingsMenu.localUsers.title',
      descriptionKey: 'settingsMenu.localUsers.description',
      icon: Users,
      permission: 'settings.local_users',
      kind: 'inline',
      content: <LocalUsersManager />,
    },
    {
      id: 'feedback',
      titleKey: 'settingsMenu.feedback.title',
      descriptionKey: 'settingsMenu.feedback.description',
      icon: MessageCircle,
      permission: 'settings.account',
      kind: 'link',
      href: '/settings/feedback',
    },
    {
      id: 'documentation',
      titleKey: 'settingsMenu.documentation.title',
      descriptionKey: 'settingsMenu.documentation.description',
      icon: BookOpen,
      kind: 'link',
      href: `${getPopcornWebBaseUrl()}/docs`,
      isExternal: true,
    },
  ];

  const visible = items.filter(
    (item) => !item.permission || canAccess(item.permission as any)
  );
  const linkItems = visible.filter((item): item is Extract<Item, { kind: 'link' }> => item.kind === 'link');
  const inlineItems = visible.filter((item): item is Extract<Item, { kind: 'inline' }> => item.kind === 'inline');

  return (
    <div className="space-y-8">
      {/* Sections avec contenu : cartes pleine largeur (format correct, pas de débordement) */}
      <div className="space-y-6 sm:space-y-8">
        {inlineItems.map((item) => {
          const Icon = item.icon;
          return (
            <DsSettingsSectionCard
              key={item.id}
              icon={Icon}
              title={t(item.titleKey)}
              accent="violet"
              sectionClassName="!min-h-0"
            >
              <div className="min-w-0">{item.content}</div>
            </DsSettingsSectionCard>
          );
        })}
      </div>

      {/* Liens rapides : grille de petites cartes cliquables (comme vue d'ensemble) */}
      {linkItems.length > 0 && (
        <div>
          <h2 className="ds-title-section text-[var(--ds-text-primary)] mb-3 sm:mb-4">
            {t('account.quickLinks')}
          </h2>
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger"
            role="list"
          >
            {linkItems.map((item) => {
              const Icon = item.icon;
              const href = item.href;
              const external = item.isExternal
                ? { target: '_blank' as const, rel: 'noopener noreferrer' }
                : {};
              return (
                <a
                  key={item.id}
                  href={href}
                  {...external}
                  data-astro-prefetch={!item.isExternal ? 'hover' : undefined}
                  className={`block min-w-0 rounded-[var(--ds-radius-lg)] overflow-hidden transition-all hover:scale-[1.01] hover:shadow-lg ${focusGlowClass}`}
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
                      <h3 className="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg mt-3 truncate">
                        {t(item.titleKey)}
                      </h3>
                      <span className="ds-text-tertiary text-sm mt-3">{t(item.descriptionKey)}</span>
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
      )}
    </div>
  );
}
