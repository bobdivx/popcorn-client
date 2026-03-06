import { useState, useEffect, useMemo } from 'preact/hooks';
import { Search, FileText } from 'lucide-preact';
import { serverApi } from '../../lib/client/server-api';
import type { Indexer } from '../../lib/client/types';
import { canAccess } from '../../lib/permissions';
import SubMenuPanel, { type SubMenuItem } from './SubMenuPanel';
import IndexerCategoriesSelector from './IndexerCategoriesSelector';
import IndexerDefinitionsManager from './IndexerDefinitionsManager';
import HLSLoadingSpinner from '../ui/HLSLoadingSpinner';
import { useI18n } from '../../lib/i18n/useI18n';

interface SyncCategoriesSubMenuPanelProps {
  onParentBack?: () => void;
}

export default function SyncCategoriesSubMenuPanel({ onParentBack }: SyncCategoriesSubMenuPanelProps) {
  const { t } = useI18n();
  const [indexers, setIndexers] = useState<Indexer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await serverApi.getIndexers();
        if (res.success && res.data) setIndexers(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const items: SubMenuItem[] = useMemo(
    () => [
      ...indexers.map((idx) => ({
        id: idx.id,
        title: idx.name,
        titleKey: 'settingsMenu.indexers.title',
        description: idx.baseUrl,
        descriptionKey: '',
        icon: Search,
        permission: 'settings.indexers' as const,
        inlineContent: () => (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">{idx.name}</h3>
            <p className="text-sm text-gray-400 mb-4">
              {t('settingsMenu.syncCategories.selectorDescription')}
            </p>
            <IndexerCategoriesSelector indexerId={idx.id} />
          </div>
        ),
      })),
      {
        id: 'indexer-definitions',
        titleKey: 'settingsMenu.indexerDefinitions.title',
        descriptionKey: 'settingsMenu.indexerDefinitions.subtitle',
        icon: FileText,
        permission: 'settings.indexers' as const,
        inlineContent: () => <IndexerDefinitionsManager />,
      },
    ],
    [indexers, t]
  );

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
