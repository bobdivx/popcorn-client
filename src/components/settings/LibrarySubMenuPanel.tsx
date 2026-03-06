import { Film, FolderOpen, FolderPlus, LayoutGrid, Users, ChevronRight } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import { DsCard, DsCardSection } from '../ui/design-system';

const ACCENT_ICON_BG = 'var(--ds-accent-violet-muted)';
const ACCENT_ICON_COLOR = 'var(--ds-accent-violet)';

type LibraryLinkItem = {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: typeof FolderOpen;
  href: string;
  permission: string | undefined;
};

const LIBRARY_LINK_ITEMS: LibraryLinkItem[] = [
  {
    id: 'media-paths',
    titleKey: 'settingsMenu.mediaPaths.title',
    descriptionKey: 'settingsMenu.mediaPaths.description',
    icon: FolderOpen,
    href: '/settings/media-paths',
    permission: 'settings.server',
  },
  {
    id: 'library-sources',
    titleKey: 'settingsMenu.librarySources.title',
    descriptionKey: 'settingsMenu.librarySources.description',
    icon: FolderPlus,
    href: '/settings/library-sources',
    permission: 'settings.server',
  },
  {
    id: 'library-media',
    titleKey: 'settingsMenu.libraryMedia.title',
    descriptionKey: 'settingsMenu.libraryMedia.description',
    icon: Film,
    href: '/settings/library-media',
    permission: 'settings.server',
  },
  {
    id: 'library-display',
    titleKey: 'interfaceSettings.librarySection',
    descriptionKey: 'interfaceSettings.librarySectionDescription',
    icon: LayoutGrid,
    href: '/settings/library-display',
    permission: undefined,
  },
  {
    id: 'friends',
    titleKey: 'settingsMenu.friends.title',
    descriptionKey: 'settingsMenu.friends.description',
    icon: Users,
    href: '/settings/friends',
    permission: 'settings.friends',
  },
];

export default function LibrarySubMenuPanel() {
  const { t } = useI18n();

  const visible = LIBRARY_LINK_ITEMS.filter(
    (item) => !item.permission || canAccess(item.permission as any)
  );

  if (visible.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
      {visible.map((item) => {
        const Icon = item.icon;
        return (
          <a
            key={item.id}
            href={item.href}
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
                <span className="ds-text-tertiary text-sm mt-3 line-clamp-2">
                  {t(item.descriptionKey)}
                </span>
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
