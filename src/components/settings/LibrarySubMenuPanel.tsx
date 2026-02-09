import { FolderOpen, FolderPlus, Users } from 'lucide-preact';
import { canAccess } from '../../lib/permissions';
import SubMenuPanel, { type SubMenuItem } from './SubMenuPanel';
import MediaPathsPanel from './MediaPathsPanel';
import LibrarySourcesPanel from './LibrarySourcesPanel';
import FriendsManager from './FriendsManager';

const LIBRARY_ITEMS: SubMenuItem[] = [
  {
    id: 'media-paths',
    titleKey: 'settingsMenu.mediaPaths.title',
    descriptionKey: 'settingsMenu.mediaPaths.description',
    icon: FolderOpen,
    permission: 'settings.server',
    inlineContent: MediaPathsPanel,
  },
  {
    id: 'library-sources',
    titleKey: 'settingsMenu.librarySources.title',
    descriptionKey: 'settingsMenu.librarySources.description',
    icon: FolderPlus,
    permission: 'settings.server',
    inlineContent: LibrarySourcesPanel,
  },
  {
    id: 'friends',
    titleKey: 'settingsMenu.friends.title',
    descriptionKey: 'settingsMenu.friends.description',
    icon: Users,
    permission: 'settings.friends',
    inlineContent: FriendsManager,
  },
];

export default function LibrarySubMenuPanel() {
  const visibleItems = LIBRARY_ITEMS.filter(
    (item) => !item.permission || canAccess(item.permission as any)
  );
  return <SubMenuPanel items={LIBRARY_ITEMS} visibleItems={visibleItems} />;
}
