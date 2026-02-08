import { Film, Search, RefreshCw, HardDrive, ExternalLink, Layers } from 'lucide-preact';
import { getBackendUrl } from '../../lib/backend-config';
import { serverApi } from '../../lib/client/server-api';
import { canAccess } from '../../lib/permissions';
import SubMenuPanel, { type SubMenuItem } from './SubMenuPanel';
import TmdbConfig from './TmdbConfig';
import IndexersSubMenuPanel from './IndexersSubMenuPanel';
import SyncCategoriesSubMenuPanel from './SyncCategoriesSubMenuPanel';
import TorrentSyncManager from './TorrentSyncManager';
import LibRbitSettings from './LibRbitSettings';

const CONTENT_ITEMS: SubMenuItem[] = [
  {
    id: 'tmdb',
    titleKey: 'settingsMenu.tmdb.title',
    descriptionKey: 'settingsMenu.tmdb.description',
    icon: Film,
    permission: 'settings.indexers',
    inlineContent: TmdbConfig,
  },
  {
    id: 'indexers',
    titleKey: 'settingsMenu.indexersConfigured.title',
    descriptionKey: 'settingsMenu.indexersConfigured.description',
    icon: Search,
    permission: 'settings.indexers',
    inlineContent: IndexersSubMenuPanel,
    nestedSubMenu: true,
  },
  {
    id: 'sync-categories',
    titleKey: 'settingsMenu.syncCategories.title',
    descriptionKey: 'settingsMenu.syncCategories.description',
    icon: Layers,
    permission: 'settings.indexers',
    inlineContent: SyncCategoriesSubMenuPanel,
    nestedSubMenu: true,
  },
  {
    id: 'sync',
    titleKey: 'settingsMenu.sync.title',
    descriptionKey: 'settingsMenu.sync.description',
    icon: RefreshCw,
    permission: 'settings.sync',
    inlineContent: TorrentSyncManager,
  },
  {
    id: 'librqbit',
    titleKey: 'settingsMenu.librqbit.title',
    descriptionKey: 'settingsMenu.librqbit.description',
    icon: HardDrive,
    permission: 'settings.server',
    inlineContent: LibRbitSettings,
  },
  {
    id: 'librqbit-web',
    titleKey: 'settingsMenu.librqbitWeb.title',
    descriptionKey: 'settingsMenu.librqbitWeb.description',
    icon: ExternalLink,
    permission: 'settings.server',
    hrefFn: () => {
      const base = (getBackendUrl() || serverApi.getServerUrl() || '').trim().replace(/\/$/, '');
      return base ? `${base}/librqbit/web/` : '#';
    },
    isExternal: true,
  },
];

export default function ContentSubMenuPanel() {
  const visibleItems = CONTENT_ITEMS.filter(
    (item) => !item.permission || canAccess(item.permission as any)
  );
  return <SubMenuPanel items={CONTENT_ITEMS} visibleItems={visibleItems} />;
}
