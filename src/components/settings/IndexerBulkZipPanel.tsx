import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';
import { isDemoMode } from '../../lib/backend-config';
import { syncIndexersToCloud } from '../../lib/utils/cloud-sync';
import type { BulkTorrentZipEntry } from '../../lib/client/server-api/indexers.js';

const LIST_MAX = 800;

interface IndexerBulkZipPanelProps {
  indexerId: string;
  onConfigSaved?: () => void;
}

export default function IndexerBulkZipPanel({ indexerId, onConfigSaved }: IndexerBulkZipPanelProps) {
  const { t } = useI18n();
  const demo = typeof window !== 'undefined' && isDemoMode();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [sourceUrl, setSourceUrl] = useState('');
  const [savedPaths, setSavedPaths] = useState<string[]>([]);
  const [loadingPrefs, setLoadingPrefs] = useState(true);

  const [previewId, setPreviewId] = useState<string | null>(null);
  const [entries, setEntries] = useState<BulkTorrentZipEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadPrefs = useCallback(async () => {
    setLoadingPrefs(true);
    try {
      const res = await serverApi.getBulkTorrentZipPreferences(indexerId);
      if (res.success && res.data) {
        setSourceUrl((res.data.sourceUrl ?? '').trim());
        setSavedPaths(res.data.selectedRelativePaths ?? []);
      }
    } finally {
      setLoadingPrefs(false);
    }
  }, [indexerId]);

  useEffect(() => {
    void loadPrefs();
  }, [loadPrefs]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => e.path.toLowerCase().includes(q));
  }, [entries, filter]);

  const visibleList = useMemo(() => filtered.slice(0, LIST_MAX), [filtered]);

  const applyPreview = useCallback((list: BulkTorrentZipEntry[], pid: string, preselect?: Set<string>) => {
    setEntries(list);
    setPreviewId(pid);
    const next = new Set<string>();
    if (preselect && preselect.size > 0) {
      for (const e of list) {
        if (preselect.has(e.path)) next.add(e.path);
      }
    }
    setSelected(next);
  }, []);

  const onPickFile = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || demo) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await serverApi.previewBulkTorrentZipFromFile(indexerId, file);
      if (!res.success || !res.data) {
        setMessage({ type: 'err', text: res.message || t('indexersManager.errorLoading') });
        return;
      }
      applyPreview(res.data.entries, res.data.previewId);
      setMessage({
        type: 'ok',
        text: t('indexersManager.bulkZip.previewOk', { count: res.data.torrentCount }),
      });
    } finally {
      setBusy(false);
    }
  };

  const onPreviewUrl = async () => {
    if (demo || !sourceUrl.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await serverApi.previewBulkTorrentZipFromUrl(indexerId, sourceUrl.trim());
      if (!res.success || !res.data) {
        setMessage({ type: 'err', text: res.message || t('indexersManager.errorLoading') });
        return;
      }
      applyPreview(res.data.entries, res.data.previewId);
      setMessage({
        type: 'ok',
        text: t('indexersManager.bulkZip.previewOk', { count: res.data.torrentCount }),
      });
    } finally {
      setBusy(false);
    }
  };

  const onApplySaved = () => {
    if (entries.length === 0 || savedPaths.length === 0) return;
    const s = new Set(savedPaths);
    const next = new Set<string>();
    for (const e of entries) {
      if (s.has(e.path)) next.add(e.path);
    }
    setSelected(next);
    setMessage({
      type: 'ok',
      text:
        next.size > 0
          ? t('indexersManager.bulkZip.applySavedResult', { count: next.size })
          : t('indexersManager.bulkZip.applySavedNone'),
    });
  };

  const onSavePrefs = async () => {
    if (demo) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await serverApi.putBulkTorrentZipPreferences(indexerId, {
        sourceUrl: sourceUrl.trim() || null,
        selectedRelativePaths: Array.from(selected),
      });
      if (!res.success) {
        setMessage({ type: 'err', text: res.message || t('indexersManager.errorSaving') });
        return;
      }
      setSavedPaths(Array.from(selected));
      setMessage({ type: 'ok', text: t('indexersManager.bulkZip.prefsSaved') });
      void syncIndexersToCloud();
      onConfigSaved?.();
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    if (demo || !previewId || selected.size === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await serverApi.importBulkTorrentZip(indexerId, previewId, Array.from(selected));
      if (!res.success || !res.data) {
        setMessage({ type: 'err', text: res.message || t('indexersManager.errorLoading') });
        return;
      }
      const { added, failed } = res.data;
      setMessage({
        type: failed.length ? 'err' : 'ok',
        text: t('indexersManager.bulkZip.importResult', {
          added: added.length,
          failed: failed.length,
        }),
      });
      setPreviewId(null);
      setEntries([]);
      setSelected(new Set());
    } finally {
      setBusy(false);
    }
  };

  if (demo) {
    return (
      <p className="text-sm text-[var(--ds-text-tertiary)] py-2">
        Non disponible en mode démo (connexion au backend requise).
      </p>
    );
  }

  return (
    <div className="space-y-4 pt-2">
      <p className="text-sm text-[var(--ds-text-secondary)]">{t('indexersManager.bulkZip.intro')}</p>

      {loadingPrefs ? (
        <p className="text-sm text-[var(--ds-text-tertiary)]">{t('indexersManager.bulkZip.loadingPrefs')}</p>
      ) : null}

      {message && (
        <div
          className={`rounded-lg px-3 py-2 text-sm ${
            message.type === 'ok'
              ? 'bg-emerald-900/30 text-emerald-300'
              : 'bg-red-900/30 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="space-y-2">
        <label className="block text-xs text-[var(--ds-text-secondary)]">
          {t('indexersManager.bulkZip.sourceUrlLabel')}
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            type="url"
            className="input input-bordered input-sm flex-1 min-w-[12rem] bg-[var(--ds-surface)] border-[var(--ds-border)]"
            value={sourceUrl}
            onInput={(e) => setSourceUrl((e.target as HTMLInputElement).value)}
            placeholder={t('indexersManager.bulkZip.sourceUrlPlaceholder')}
            disabled={busy}
          />
          <button type="button" className="btn btn-sm btn-primary" disabled={busy || !sourceUrl.trim()} onClick={() => void onPreviewUrl()}>
            {busy ? <span className="loading loading-spinner loading-xs" /> : null}
            {t('indexersManager.bulkZip.previewFromUrl')}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInputRef} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => void onPickFile(e)} />
        <button
          type="button"
          className="btn btn-sm btn-outline border-[var(--ds-border)]"
          disabled={busy}
          onClick={() => fileInputRef.current?.click()}
        >
          {t('indexersManager.bulkZip.pickFile')}
        </button>
        <span className="text-xs text-[var(--ds-text-tertiary)]">{t('indexersManager.bulkZip.previewFileHint')}</span>
      </div>

      {entries.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="search"
              className="input input-bordered input-sm flex-1 min-w-[10rem] bg-[var(--ds-surface)] border-[var(--ds-border)]"
              placeholder={t('indexersManager.bulkZip.filterPlaceholder')}
              value={filter}
              onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
              disabled={busy}
            />
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              disabled={busy}
              onClick={() => {
                setSelected((prev) => {
                  const n = new Set(prev);
                  for (const e of filtered) n.add(e.path);
                  return n;
                });
              }}
            >
              {t('indexersManager.bulkZip.selectAllVisible')}
            </button>
            <button type="button" className="btn btn-xs btn-ghost" disabled={busy} onClick={() => setSelected(new Set())}>
              {t('indexersManager.bulkZip.selectNone')}
            </button>
            <button
              type="button"
              className="btn btn-xs btn-ghost"
              disabled={busy || savedPaths.length === 0}
              onClick={onApplySaved}
            >
              {t('indexersManager.bulkZip.applySaved')}
            </button>
          </div>

          <p className="text-xs text-[var(--ds-text-tertiary)]">
            {filtered.length > LIST_MAX
              ? t('indexersManager.bulkZip.listTruncated', { shown: LIST_MAX, total: filtered.length })
              : t('indexersManager.bulkZip.listSummary', { total: filtered.length, selected: selected.size })}
          </p>

          <ul className="max-h-64 overflow-y-auto rounded-lg border border-[var(--ds-border)] divide-y divide-[var(--ds-border)] text-sm">
            {visibleList.map((e) => (
              <li key={e.path} className="flex items-start gap-2 px-2 py-1.5 hover:bg-[var(--ds-surface)]/60">
                <input
                  type="checkbox"
                  className="checkbox checkbox-sm mt-0.5 shrink-0"
                  checked={selected.has(e.path)}
                  disabled={busy}
                  onChange={() => {
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (n.has(e.path)) n.delete(e.path);
                      else n.add(e.path);
                      return n;
                    });
                  }}
                />
                <span className="font-mono text-xs break-all text-[var(--ds-text-primary)]">{e.path}</span>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-sm btn-outline border-[var(--ds-border)]" disabled={busy} onClick={() => void onSavePrefs()}>
              {t('indexersManager.bulkZip.savePrefs')}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={busy || !previewId || selected.size === 0}
              onClick={() => void onImport()}
            >
              {t('indexersManager.bulkZip.importSelected')}
            </button>
          </div>
        </>
      )}

      {entries.length === 0 && !busy && <p className="text-sm text-[var(--ds-text-tertiary)]">{t('indexersManager.bulkZip.noPreview')}</p>}
    </div>
  );
}
