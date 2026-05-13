import { useState, useEffect, useCallback } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';
import type { LibraryMediaEntry, LibrarySource } from '../../lib/client/server-api/library';
import { invalidateLibraryCache } from '../../lib/client/server-api/library';
import { Film, FileX, FolderOpen, Pencil, RefreshCw, Trash2, Tv, CheckSquare, Square, X } from 'lucide-preact';

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
  
  // Single edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPath, setEditPath] = useState('');
  const [editTmdbId, setEditTmdbId] = useState<string>('');
  const [savingId, setSavingId] = useState<string | null>(null);
  
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchEditMode, setBatchEditMode] = useState(false);
  const [batchTmdbId, setBatchTmdbId] = useState('');
  const [batchSaving, setBatchSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterSource, setFilterSource] = useState<string>('');
  const [scanning, setScanning] = useState(false);

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
    setEditTmdbId(entry.tmdb_id ? String(entry.tmdb_id) : '');
    setMessage(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditPath('');
    setEditTmdbId('');
  };

  const handleSaveMedia = async () => {
    if (!editingId) return;
    setSavingId(editingId);
    setMessage(null);
    try {
      const tmdbIdNum = editTmdbId.trim() ? parseInt(editTmdbId.trim(), 10) : null;
      const res = await serverApi.updateLibraryMedia(editingId, {
        file_path: editPath.trim() || undefined,
        tmdb_id: isNaN(tmdbIdNum as any) ? null : tmdbIdNum,
      });
      if (res.success) {
        invalidateLibraryCache();
        await loadMedia();
        setMessage({ type: 'success', text: t('settingsMenu.libraryMediaPanel.updateSuccess') });
        setEditingId(null);
        setEditPath('');
        setEditTmdbId('');
      } else {
        setMessage({ type: 'error', text: res.error || t('settingsMenu.libraryMediaPanel.updateError') });
      }
    } catch {
      setMessage({ type: 'error', text: t('settingsMenu.libraryMediaPanel.updateError') });
    } finally {
      setSavingId(null);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredList.map((m) => m.id)));
    }
  };

  const handleBatchUpdateTmdbId = async () => {
    if (selectedIds.size === 0 || !batchTmdbId.trim()) return;
    setBatchSaving(true);
    setMessage(null);
    try {
      const tmdbIdNum = parseInt(batchTmdbId.trim(), 10);
      if (isNaN(tmdbIdNum)) {
        setMessage({ type: 'error', text: 'TMDB ID invalide' });
        return;
      }

      const items = Array.from(selectedIds).map((id) => ({
        id,
        tmdb_id: tmdbIdNum,
      }));

      const res = await serverApi.batchUpdateLibraryMedia(items);
      if (res.success) {
        invalidateLibraryCache();
        await loadMedia();
        setMessage({ type: 'success', text: t('settingsMenu.libraryMediaPanel.updateSuccess') });
        setSelectedIds(new Set());
        setBatchEditMode(false);
        setBatchTmdbId('');
      } else {
        setMessage({ type: 'error', text: res.error || t('settingsMenu.libraryMediaPanel.updateError') });
      }
    } catch {
      setMessage({ type: 'error', text: t('settingsMenu.libraryMediaPanel.updateError') });
    } finally {
      setBatchSaving(false);
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

  const handleScanLibrary = async () => {
    setMessage(null);
    setScanning(true);
    try {
      invalidateLibraryCache();
      const res = await serverApi.scanLocalMedia();
      if (res.success) {
        setMessage({ type: 'success', text: t('library.scanStarted') });
        setTimeout(() => {
          void loadMedia();
        }, 2000);
      } else {
        setMessage({
          type: 'error',
          text: res.message || res.error || t('errors.generic'),
        });
      }
    } catch {
      setMessage({ type: 'error', text: t('errors.generic') });
    } finally {
      setScanning(false);
      setTimeout(() => {
        setMessage((current) =>
          current && current.text === t('library.scanStarted') ? null : current
        );
      }, 5000);
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
        <button
          type="button"
          onClick={handleScanLibrary}
          disabled={scanning}
          class="inline-flex items-center gap-2 ml-auto rounded bg-primary/80 hover:bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? t('library.scanning') : t('library.syncLibrary')}
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div class="flex items-center gap-4 p-3 bg-primary/10 border border-primary/30 rounded-lg animate-in fade-in slide-in-from-top-2">
          <div class="flex items-center gap-2 text-primary font-medium">
            <CheckSquare className="w-5 h-5" />
            <span>{selectedIds.size} {t('settingsMenu.libraryMediaPanel.selectedItems')}</span>
          </div>
          
          {batchEditMode ? (
            <div class="flex items-center gap-2 flex-1">
              <input
                type="text"
                placeholder="Nouveau TMDB ID"
                class="flex-1 max-w-[200px] rounded bg-gray-900 border border-primary/50 px-3 py-1.5 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                value={batchTmdbId}
                onInput={(e) => setBatchTmdbId((e.target as HTMLInputElement).value)}
              />
              <button
                type="button"
                class="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                onClick={handleBatchUpdateTmdbId}
                disabled={batchSaving || !batchTmdbId.trim()}
              >
                {batchSaving ? t('common.loading') : t('common.apply')}
              </button>
              <button
                type="button"
                class="rounded bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-200 hover:bg-gray-600"
                onClick={() => { setBatchEditMode(false); setBatchTmdbId(''); }}
              >
                {t('common.cancel')}
              </button>
            </div>
          ) : (
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="rounded bg-primary/20 border border-primary/40 px-3 py-1.5 text-sm font-medium text-primary hover:bg-primary/30"
                onClick={() => setBatchEditMode(true)}
              >
                {t('settingsMenu.libraryMediaPanel.batchEditTmdbId')}
              </button>
              <button
                type="button"
                class="text-gray-400 hover:text-white p-1"
                onClick={() => { setSelectedIds(new Set()); setBatchEditMode(false); }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      )}

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
                <col class="w-[40px]" />
                <col class="w-[16%]" />
                <col class="w-[32%]" />
                <col class="w-[10%]" />
                <col class="w-[14%]" />
                <col class="w-[22%]" />
              </colgroup>
              <thead class="sticky top-0 bg-gray-800/95 text-gray-300 border-b border-gray-700 z-10">
                <tr>
                  <th class="px-3 py-2">
                    <button type="button" onClick={toggleSelectAll} class="text-gray-400 hover:text-white">
                      {selectedIds.size === filteredList.length && filteredList.length > 0 ? (
                        <CheckSquare className="w-4 h-4 text-primary" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th class="px-3 py-2 font-medium truncate" title={t('settingsMenu.libraryMediaPanel.colTitle')}>{t('settingsMenu.libraryMediaPanel.colTitle')}</th>
                  <th class="px-3 py-2 font-medium">{t('settingsMenu.libraryMediaPanel.colPath')}</th>
                  <th class="px-3 py-2 font-medium">{t('settingsMenu.libraryMediaPanel.colCategory')}</th>
                  <th class="px-3 py-2 font-medium truncate" title={t('settingsMenu.libraryMediaPanel.colSource')}>{t('settingsMenu.libraryMediaPanel.colSource')}</th>
                  <th class="px-3 py-2 font-medium text-right">{t('settingsMenu.libraryMediaPanel.colActions')}</th>
                </tr>
              </thead>
              <tbody class="text-gray-300">
                {filteredList.map((entry) => (
                  <tr key={entry.id} class={`border-b border-gray-700/70 hover:bg-gray-800/50 align-top transition-colors ${selectedIds.has(entry.id) ? 'bg-primary/5' : ''}`}>
                    <td class="px-3 py-3 align-top">
                      <button type="button" onClick={() => toggleSelect(entry.id)} class="text-gray-400 hover:text-white">
                        {selectedIds.has(entry.id) ? (
                          <CheckSquare className="w-4 h-4 text-primary" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                    <td class="px-3 py-2 align-top min-w-0">
                      <span class="font-medium text-white truncate block" title={entry.tmdb_title || entry.file_name || entry.id}>
                        {entry.tmdb_title || entry.file_name || entry.id}
                      </span>
                      {entry.tmdb_id && (
                        <span class="text-[10px] text-gray-500 font-mono">TMDB: {entry.tmdb_id}</span>
                      )}
                    </td>
                    <td class="px-3 py-2 align-top min-w-0 max-w-0">
                      {editingId === entry.id ? (
                        <div class="flex flex-col gap-2 p-1 bg-gray-900/50 rounded">
                          <div class="space-y-1">
                            <label class="text-[10px] text-gray-500 uppercase font-bold">{t('settingsMenu.libraryMediaPanel.colPath')}</label>
                            <input
                              type="text"
                              class="w-full rounded bg-gray-900 border border-gray-600 px-2 py-1 text-xs text-white min-w-0"
                              value={editPath}
                              onInput={(e) => setEditPath((e.target as HTMLInputElement).value)}
                            />
                          </div>
                          <div class="space-y-1">
                            <label class="text-[10px] text-gray-500 uppercase font-bold">TMDB ID</label>
                            <input
                              type="text"
                              placeholder="TMDB ID"
                              class="w-full rounded bg-gray-900 border border-gray-600 px-2 py-1 text-xs text-white min-w-0"
                              value={editTmdbId}
                              onInput={(e) => setEditTmdbId((e.target as HTMLInputElement).value)}
                            />
                          </div>
                          <div class="flex gap-2 flex-wrap pt-1">
                            <button
                              type="button"
                              class="rounded bg-primary/80 hover:bg-primary px-2 py-1 text-xs text-white disabled:opacity-50"
                              onClick={handleSaveMedia}
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
                            title={t('settingsMenu.libraryMediaPanel.editMedia')}
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
                            {/* Sur mobile on cache le texte si besoin, mais ici on garde par cohérence */}
                          </button>
                          <button
                            type="button"
                            class="inline-flex items-center gap-1 rounded border border-red-800/80 px-2 py-1 text-xs text-red-300 hover:bg-red-900/30 disabled:opacity-50"
                            onClick={() => handleDeleteFile(entry.id)}
                            disabled={deletingId !== null || deletingFileId !== null}
                            title={t('settingsMenu.libraryMediaPanel.deleteFileAndLibrary')}
                          >
                            <FileX className="w-3.5 h-3.5" />
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
