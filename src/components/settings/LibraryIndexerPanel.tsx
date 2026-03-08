import { useState, useEffect, useCallback } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';
import { getUserConfig, saveUserConfigMerge } from '../../lib/api/popcorn-web';
import type { Indexer } from '../../lib/client/types';
import { DsCard, DsCardSection } from '../ui/design-system';
import { List, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-preact';

const iconProps = { size: 20, strokeWidth: 1.5 };

export default function LibraryIndexerPanel() {
  const { t } = useI18n();
  const [indexers, setIndexers] = useState<Indexer[]>([]);
  const [visibleIds, setVisibleIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    const [indexersRes, config, backendSyncRes] = await Promise.all([
      serverApi.getIndexers(),
      getUserConfig(),
      serverApi.getSyncSettings(),
    ]);
    if (indexersRes.success && Array.isArray(indexersRes.data)) {
      setIndexers(indexersRes.data);
    } else {
      setIndexers([]);
    }
    // Priorité : cloud puis fallback backend local (pour persistance sans cloud / rechargement)
    const cloudIds = config?.syncSettings?.visibleIndexerIds;
    const backendIds = backendSyncRes.success ? backendSyncRes.data?.visible_indexer_ids : undefined;
    const ids =
      cloudIds !== undefined
        ? Array.isArray(cloudIds) && cloudIds.length > 0
          ? cloudIds
          : null
        : Array.isArray(backendIds) && backendIds.length > 0
          ? backendIds
          : backendIds === null
            ? null
            : null;
    setVisibleIds(ids);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isVisible = (id: string): boolean => {
    if (visibleIds === null) return true;
    return visibleIds.includes(id);
  };

  const setVisible = async (indexerId: string, visible: boolean) => {
    setSaving(true);
    setMessage(null);
    try {
      let next: string[] | null;
      if (visible) {
        if (visibleIds === null) {
          next = null;
        } else {
          const nextList = visibleIds.includes(indexerId) ? visibleIds : [...visibleIds, indexerId];
          next = nextList.length === indexers.length ? null : nextList;
        }
      } else {
        if (visibleIds === null) {
          next = indexers.filter((i) => i.id !== indexerId).map((i) => i.id);
          if (next.length === 0) next = [];
        } else {
          next = visibleIds.filter((id) => id !== indexerId);
        }
      }
      setVisibleIds(next);
      const config = await getUserConfig();
      const currentSync = config?.syncSettings ?? {};
      await saveUserConfigMerge({
        syncSettings: {
          ...currentSync,
          visibleIndexerIds: next === null || next.length === 0 ? null : next,
        },
      });
      // Persister aussi en base locale du backend pour que le rechargement reflète l’état sans cloud
      await serverApi.updateSyncSettings({
        visible_indexer_ids: next === null || next.length === 0 ? null : next,
      });
      setMessage({ type: 'success', text: t('settingsMenu.libraryIndexerPanel.saved') });
      setTimeout(() => setMessage(null), 2500);
    } catch {
      setMessage({ type: 'error', text: t('settingsMenu.libraryIndexerPanel.saveError') });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-4 text-[var(--ds-text-tertiary)]">
        <RefreshCw className="w-4 h-4 animate-spin" />
        {t('settingsMenu.libraryIndexerPanel.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--ds-text-tertiary)]">
        {t('settingsMenu.libraryIndexerPanel.intro')}
      </p>

      {message && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            message.type === 'success'
              ? 'bg-emerald-900/30 text-emerald-300'
              : 'bg-red-900/30 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      <DsCard variant="elevated">
        <DsCardSection>
          <h3 className="text-base font-semibold text-[var(--ds-text-primary)] flex items-center gap-2 mb-4">
            <span
              className="inline-flex w-8 h-8 rounded-full items-center justify-center shrink-0 bg-[var(--ds-accent-violet-muted)] text-[var(--ds-accent-violet)]"
              aria-hidden
            >
              <List {...iconProps} />
            </span>
            {t('settingsMenu.libraryIndexerPanel.cardTitle')}
          </h3>
          {indexers.length === 0 ? (
            <p className="text-sm text-[var(--ds-text-tertiary)] py-2">
              {t('settingsMenu.libraryIndexerPanel.noIndexers')}
            </p>
          ) : (
            <ul className="divide-y divide-[var(--ds-border)]">
              {indexers.map((idx) => {
                const visible = isVisible(idx.id);
                return (
                  <li
                    key={idx.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="text-sm text-[var(--ds-text-primary)] truncate min-w-0" title={idx.name}>
                      {idx.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setVisible(idx.id, !visible)}
                      disabled={saving}
                      className="flex-shrink-0 p-1.5 rounded-lg text-[var(--ds-text-tertiary)] hover:text-[var(--ds-text-primary)] hover:bg-[var(--ds-surface-hover)] disabled:opacity-50"
                      title={visible ? t('settingsMenu.libraryIndexerPanel.hideInLibrary') : t('settingsMenu.libraryIndexerPanel.showInLibrary')}
                      aria-pressed={visible}
                    >
                      {visible ? (
                        <ToggleRight className="w-5 h-5 text-emerald-500" aria-hidden />
                      ) : (
                        <ToggleLeft className="w-5 h-5" aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-[var(--ds-text-tertiary)] mt-4">
            {t('settingsMenu.libraryIndexerPanel.hint')}
          </p>
        </DsCardSection>
      </DsCard>
    </div>
  );
}
