import { useState, useEffect, useMemo } from 'preact/hooks';
import { Search, Plus, Settings } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import type { Indexer } from '../../lib/client/types';
import { canAccess } from '../../lib/permissions';
import SubMenuPanel, { type SubMenuItem } from './SubMenuPanel';
import IndexerDetailPanel from './IndexerDetailPanel';
import IndexersManager from './IndexersManager';
import TorrentSyncManager from './TorrentSyncManager';
import { useI18n } from '../../lib/i18n/useI18n';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';

interface IndexersSubMenuPanelProps {
  onParentBack?: () => void;
}

export default function IndexersSubMenuPanel({ onParentBack }: IndexersSubMenuPanelProps) {
  const { t } = useI18n();
  const [indexers, setIndexers] = useState<Indexer[]>([]);
  const [loading, setLoading] = useState(true);

  const loadIndexers = async () => {
    try {
      setLoading(true);
      const res = await serverApi.getIndexers();
      if (res.success && res.data) setIndexers(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIndexers();
  }, []);

  const items: SubMenuItem[] = useMemo(() => {
    const list: SubMenuItem[] = indexers.map((idx) => ({
      id: idx.id,
      title: idx.name,
      titleKey: 'settingsMenu.indexers.title',
      description: idx.baseUrl,
      descriptionKey: '',
      icon: Search,
      permission: 'settings.indexers',
      inlineContent: (props: { onBack?: () => void }) => (
        <IndexerDetailPanel
          indexer={idx}
          onDeleted={loadIndexers}
          onEditClose={loadIndexers}
          onBack={props.onBack}
        />
      ),
    }));
    list.push({
      id: 'add',
      titleKey: 'indexersManager.addIndexer',
      descriptionKey: 'settingsMenu.indexers.description',
      icon: Plus,
      permission: 'settings.indexers',
      inlineContent: () => (
        <IndexersManager initialModeAdd onAddSuccess={loadIndexers} />
      ),
    });
    list.push({
      id: 'settings',
      titleKey: 'torrentSyncManager.settings',
      descriptionKey: 'settingsMenu.indexerParams.description',
      icon: Settings,
      permission: 'settings.indexers',
      inlineContent: () => <TorrentSyncManager section="settings" />,
    });
    return list;
  }, [indexers, t]);

  const visibleItems = items.filter(
    (item) => !item.permission || canAccess(item.permission as any)
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <HLSLoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <SubMenuPanel
      items={items}
      visibleItems={visibleItems}
      onParentBack={onParentBack}
    />
  );
}
