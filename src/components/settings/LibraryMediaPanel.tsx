import { useState, useEffect, useCallback } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';
import type { LibraryMediaEntry, LibrarySource } from '../../lib/client/server-api/library';
import { invalidateLibraryCache } from '../../lib/client/server-api/library';
import { Film, FileX, FolderOpen, Pencil, RefreshCw, Trash2, Tv } from 'lucide-preact';

/** Valeur du filtre source : '' = toutes, 'local' = source locale, 'external' = toute externe, ou id de library_source */
function matchSource(entry: LibraryMediaEntry, filterSource: string): boolean {
  if (!filterSource) return true;
  if (filterSource === 'local') return entry.library_source_id == null || entry.library_source_id === '';
  if (filterSource === 'external') return entry.library_source_id != null && entry.library_source_id !== '';
  return entry.library_source_id === filterSource;
}

function getSourceLabel(
  entry: LibraryMediaEntry,
  sources: LibrarySource[],
  t: (key: string) => string
): string {
  if (entry.library_source_id == null || entry.library_source_id === '') {
    return t('settingsMenu.libraryMediaPanel.sourceLocal');
  }
  const src = sources.find((s) => s.id === entry.library_source_id);
  return src ? (src.label || src.path) : entry.library_source_id;
}

export default function LibraryMediaPanel() {
  const { t } = useI18n();
  const [list, setList] = useState<LibraryMediaEntry[]>([]);
  const [sources, setSources] = useState<LibrarySource[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPath, setEditPath] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterSource, setFilterSource] = useState<string>('');

  const loadMedia = useCallback(async () => {
    setLoading(true);
    const [mediaRes, sourcesRes] = await Promise.all([
      serverApi.getLibraryMedia(),
      serverApi.getLibrarySources(),
    ]);
    if (mediaRes.success && Array.isArray(mediaRes.data)) {
      setList(mediaRes.data);
    } else {
      setList([]);
    }
    if (sourcesRes.success && Array.isArray(sourcesRes.data)) {
      setSources(sourcesRes.data);
    } else {
      setSources([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  const handleStartEdit = (entry: LibraryMediaEntry) => {
    setEditingId(entry.id);
    setEditPath(entry.file_path);
    setMessage(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditPath('');
  };

  const handleSavePath = async () => {
    if (!editingId || !editPath.trim()) return;
    setSavingId(editingId);
    setMessage(null);
    try {
      const res = await serverApi.updateLibraryMedia(editingId, editPath.trim());
      if (res.success) {
        invalidateLibraryCache();
        await loadMedia();
        setMessage({ type: 'success', text: t('settingsMenu.libraryMediaPanel.updateSuccess') });
        setEditingId(null);
        setEditPath('');
      } else {
        setMessage({ type: 'error', text: res.error || t('settingsMenu.libraryMediaPanel.updateError') });
      }
    } catch {
      setMessage({ type: 'error', text: t('settingsMenu.libraryMediaPanel.updateError') });
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('settingsMenu.libraryMediaPanel.removeFromLibraryConfirm'))) return;
    setDeletingId(id);
    setMessage(null);
    try {
      const res = await serverApi.deleteLibraryMedia(id);
      if (res.success) {
        invalidateLibraryCache();
        await loadMedia();
        setMessage({ type: 'success', text: t('settingsMenu.libraryMediaPanel.removeFromLibrarySuccess') });
      } else {
        setMessage({ type: 'error', text: res.error || t('settingsMenu.libraryMediaPanel.deleteError') });
      }
    } catch {
      setMessage({ type: 'error', text: t('settingsMenu.libraryMediaPanel.deleteError') });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteFile = async (id: string) => {
    if (!confirm(t('settingsMenu.libraryMediaPanel.deleteFileConfirm'))) return;
    setDeletingFileId(id);
    setMessage(null);
    try {
      const res = await serverApi.deleteLibraryMediaFile(id);
      if (res.success) {
        invalidateLibraryCache();
        await loadMedia();
        setMessage({ type: 'success', text: t('settingsMenu.libraryMediaPanel.deleteFileSuccess') });
      } else {
        setMessage({ type: 'error', text: res.error || t('settingsMenu.libraryMediaPanel.deleteFileError') });
      }
    } catch {
      setMessage({ type: 'error', text: t('settingsMenu.libraryMediaPanel.deleteFileError') });
    } finally {
      setDeletingFileId(null);
    }
  };

  const filteredList = list.filter((m) => {
    const matchCat = !filterCategory || m.category === filterCategory;
    const matchSrc = matchSource(m, filterSource);
    return matchCat && matchSrc;
  });
  const countFilms = list.filter((m) => m.category === 'FILM').length;
  const countSeries = list.filter((m) => m.category === 'SERIES').length;
  const countLocal = list.filter((m) => !m.library_source_id || m.library_source_id === '').length;
  const countExternal = list.filter((m) => m.library_source_id != null && m.library_source_id !== '').length;

  if (loading) {
    return (
      <div class="p-4 text-gray-400">
        <span className="inline-flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          {t('settingsMenu.libraryMediaPanel.loading')}
        </span>
      </div>
    );
  }

  return (
    <div class="p-4 space-y-4">
      <p className="text-gray-400 text-sm">{t('settingsMenu.libraryMediaPanel.intro')}</p>

      <div class="flex flex-wrap items-center gap-4">
        <span class="rounded bg-gray-800/60 border border-gray-700 px-3 py-1.5 text-sm text-gray-200">
          {t('settingsMenu.libraryMediaPanel.totalCount', { count: list.length })}
        </span>
        <span class="inline-flex items-center gap-1.5 text-sm text-gray-400">
          <Film className="w-4 h-4" />
          {t('settingsMenu.libraryMediaPanel.filmsCount', { count: countFilms })}
        </span>
        <span class="inline-flex items-center gap-1.5 text-sm text-gray-400">
          <Tv className="w-4 h-4" />
          {t('settingsMenu.libraryMediaPanel.seriesCount', { count: countSeries })}
        </span>
        <span class="inline-flex items-center gap-1.5 text-sm text-gray-400" title={t('settingsMenu.libraryMediaPanel.sourceLocal')}>
          <FolderOpen className="w-4 h-4" />
          {t('settingsMenu.libraryMediaPanel.localCount', { count: countLocal })}
        </span>
        <span class="inline-flex items-center gap-1.5 text-sm text-gray-400" title={t('settingsMenu.libraryMediaPanel.sourceExternal')}>
          {t('settingsMenu.libraryMediaPanel.externalCount', { count: countExternal })}
        </span>
        <label class="flex items-center gap-2 text-sm text-gray-300">
          <span>{t('settingsMenu.libraryMediaPanel.filterType')}</span>
          <select
            class="rounded bg-gray-900 border border-gray-600 px-2 py-1 text-sm text-white"
            value={filterCategory}
            onChange={(e) => setFilterCategory((e.target as HTMLSelectElement).value)}
          >
            <option value="">{t('common.all')}</option>
            <option value="FILM">{t('common.film')}</option>
            <option value="SERIES">{t('common.serie')}</option>
          </select>
        </label>
        <label class="flex items-center gap-2 text-sm text-gray-300">
          <span>{t('settingsMenu.libraryMediaPanel.filterSource')}</span>
          <select
            class="rounded bg-gray-900 border border-gray-600 px-2 py-1 text-sm text-white min-w-[140px]"
            value={filterSource}
            onChange={(e) => setFilterSource((e.target as HTMLSelectElement).value)}
          >
            <option value="">{t('common.all')}</option>
            <option value="local">{t('settingsMenu.libraryMediaPanel.sourceLocal')}</option>
            <option value="external">{t('settingsMenu.libraryMediaPanel.sourceExternal')}</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label || s.path}
              </option>
            ))}
          </select>
        </label>
      </div>

      {message && (
        <div
          class={`rounded px-3 py-2 text-sm ${
            message.type === 'success' ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {filteredList.length === 0 ? (
        <p class="text-gray-500 text-sm">{t('settingsMenu.libraryMediaPanel.noMedia')}</p>
      ) : (
        <div class="rounded-lg border border-gray-700 bg-gray-800/50 overflow-hidden">
          <div class="overflow-x-auto max-h-[60vh] overflow-y-auto">
            <table class="w-full text-sm text-left table-fixed">
              <colgroup>
                <col class="w-[16%]" />
                <col class="w-[38%]" />
                <col class="w-[10%]" />
                <col class="w-[14%]" />
                <col class="w-[22%]" />
              </colgroup>
              <thead class="sticky top-0 bg-gray-800/95 text-gray-300 border-b border-gray-700">
                <tr>
                  <th class="px-3 py-2 font-medium truncate" title={t('settingsMenu.libraryMediaPanel.colTitle')}>{t('settingsMenu.libraryMediaPanel.colTitle')}</th>
                  <th class="px-3 py-2 font-medium">{t('settingsMenu.libraryMediaPanel.colPath')}</th>
                  <th class="px-3 py-2 font-medium">{t('settingsMenu.libraryMediaPanel.colCategory')}</th>
                  <th class="px-3 py-2 font-medium truncate" title={t('settingsMenu.libraryMediaPanel.colSource')}>{t('settingsMenu.libraryMediaPanel.colSource')}</th>
                  <th class="px-3 py-2 font-medium text-right">{t('settingsMenu.libraryMediaPanel.colActions')}</th>
                </tr>
              </thead>
              <tbody class="text-gray-300">
                {filteredList.map((entry) => (
                  <tr key={entry.id} class="border-b border-gray-700/70 hover:bg-gray-800/50 align-top">
                    <td class="px-3 py-2 align-top min-w-0">
                      <span class="font-medium text-white truncate block" title={entry.tmdb_title || entry.file_name || entry.id}>
                        {entry.tmdb_title || entry.file_name || entry.id}
                      </span>
                    </td>
                    <td class="px-3 py-2 align-top min-w-0 max-w-0">
                      {editingId === entry.id ? (
                        <div class="flex flex-col gap-1">
                          <input
                            type="text"
                            class="w-full rounded bg-gray-900 border border-gray-600 px-2 py-1 text-xs text-white min-w-0"
                            value={editPath}
                            onInput={(e) => setEditPath((e.target as HTMLInputElement).value)}
                          />
                          <div class="flex gap-2 flex-wrap">
                            <button
                              type="button"
                              class="rounded bg-primary/80 hover:bg-primary px-2 py-1 text-xs text-white disabled:opacity-50"
                              onClick={handleSavePath}
                              disabled={savingId !== null}
                            >
                              {savingId === entry.id ? t('common.loading') : t('common.save')}
                            </button>
                            <button
                              type="button"
                              class="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
                              onClick={handleCancelEdit}
                              disabled={savingId !== null}
                            >
                              {t('common.cancel')}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span class="text-gray-400 text-xs block break-all" title={entry.file_path}>
                          {entry.file_path}
                        </span>
                      )}
                    </td>
                    <td class="px-3 py-2 align-top">
                      {entry.category === 'SERIES' ? (
                        <span class="inline-flex items-center gap-1 text-amber-400">
                          <Tv className="w-3.5 h-3.5" />
                          {t('common.serie')}
                        </span>
                      ) : (
                        <span class="inline-flex items-center gap-1 text-blue-400">
                          <Film className="w-3.5 h-3.5" />
                          {t('common.film')}
                        </span>
                      )}
                    </td>
                    <td class="px-3 py-2 align-top min-w-0">
                      <span class="text-xs text-gray-400 truncate block" title={getSourceLabel(entry, sources, t)}>
                        {getSourceLabel(entry, sources, t)}
                      </span>
                    </td>
                    <td class="px-3 py-2 align-top text-right">
                      {editingId === entry.id ? null : (
                        <span class="inline-flex flex-wrap items-center gap-1 justify-end">
                          <button
                            type="button"
                            class="inline-flex items-center gap-1 rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700"
                            onClick={() => handleStartEdit(entry)}
                            title={t('settingsMenu.libraryMediaPanel.editPath')}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            {t('common.edit')}
                          </button>
                          <button
                            type="button"
                            class="inline-flex items-center gap-1 rounded border border-amber-800/80 px-2 py-1 text-xs text-amber-300 hover:bg-amber-900/30 disabled:opacity-50"
                            onClick={() => handleDelete(entry.id)}
                            disabled={deletingId !== null || deletingFileId !== null}
                            title={t('settingsMenu.libraryMediaPanel.removeFromLibrary')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            {t('settingsMenu.libraryMediaPanel.removeFromLibrary')}
                          </button>
                          <button
                            type="button"
                            class="inline-flex items-center gap-1 rounded border border-red-800/80 px-2 py-1 text-xs text-red-300 hover:bg-red-900/30 disabled:opacity-50"
                            onClick={() => handleDeleteFile(entry.id)}
                            disabled={deletingId !== null || deletingFileId !== null}
                            title={t('settingsMenu.libraryMediaPanel.deleteFileAndLibrary')}
                          >
                            <FileX className="w-3.5 h-3.5" />
                            {t('settingsMenu.libraryMediaPanel.deleteFileAndLibrary')}
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
