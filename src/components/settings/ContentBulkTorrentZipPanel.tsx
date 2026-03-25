import { useCallback, useEffect, useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';
import type { Indexer } from '../../lib/client/types';
import IndexerBulkZipPanel from './IndexerBulkZipPanel';

export default function ContentBulkTorrentZipPanel() {
  const { t } = useI18n();
  const [indexers, setIndexers] = useState<Indexer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await serverApi.getIndexers();
      if (res.success && res.data) {
        setIndexers(res.data);
        setSelectedId((prev) => {
          if (prev && res.data!.some((i) => i.id === prev)) return prev;
          return res.data![0]?.id ?? '';
        });
      } else {
        setIndexers([]);
        setSelectedId('');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p className="text-sm text-[var(--ds-text-tertiary)] py-4">{t('indexersManager.loading')}</p>;
  }

  if (indexers.length === 0) {
    return (
      <p className="text-sm text-[var(--ds-text-secondary)] py-4">
        {t('settingsMenu.bulkTorrentZipNav.noIndexers')}
      </p>
    );
  }

  const selected = indexers.find((i) => i.id === selectedId) ?? indexers[0];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="block text-sm text-[var(--ds-text-secondary)]" htmlFor="bulk-zip-indexer">
          {t('settingsMenu.bulkTorrentZipNav.chooseIndexer')}
        </label>
        <select
          id="bulk-zip-indexer"
          className="select select-bordered select-sm w-full max-w-xl bg-[var(--ds-surface)] border-[var(--ds-border)]"
          value={selected.id}
          onChange={(e) => setSelectedId((e.target as HTMLSelectElement).value)}
        >
          {indexers.map((idx) => (
            <option key={idx.id} value={idx.id}>
              {idx.name}
            </option>
          ))}
        </select>
      </div>
      <IndexerBulkZipPanel indexerId={selected.id} onConfigSaved={load} />
    </div>
  );
}
