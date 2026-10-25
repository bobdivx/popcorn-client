import { Clapperboard, Film, FolderOpen, FolderPlus, LayoutGrid, Users } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import { SettingsNavCard } from './SettingsNavCard';
import { isRouteBlockedInStoreBuild } from '../../lib/distribution';

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
    // Métadonnées TMDB : réglage du cœur (fiches de la bibliothèque), plus rangé sous « Contenu ».
    id: 'tmdb',
    titleKey: 'settingsMenu.tmdb.title',
    descriptionKey: 'settingsMenu.tmdb.description',
    icon: Clapperboard,
    href: '/settings/tmdb',
    permission: 'settings.indexers',
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
    (item) =>
      (!item.permission || canAccess(item.permission as any)) &&
      // Partage désactivé côté serveur (capacité annoncée à false) : pas de lien Amis.
      !isRouteBlockedInStoreBuild(item.href)
  );

  if (visible.length === 0) return null;

  return (
    <div className="hub-grid" data-tv-list role="list">
      {visible.map((item) => (
        <SettingsNavCard
          key={item.id}
          href={item.href}
          icon={item.icon}
          title={t(item.titleKey)}
          description={t(item.descriptionKey)}
        />
      ))}
    </div>
  );
}
