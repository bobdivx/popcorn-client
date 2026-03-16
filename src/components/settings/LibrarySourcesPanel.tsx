import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi, type LibrarySource } from '../../lib/client/server-api';
import { saveUserConfigMerge } from '../../lib/api/popcorn-web';
import { CheckCircle, Folder, FolderOpen, FolderPlus, Pencil, RefreshCw, ToggleLeft, ToggleRight, Trash2, Users } from 'lucide-preact';

interface ExplorerEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size?: number;
  modified?: number;
}

const isAbsoluteLikePath = (value: string): boolean => {
  const p = value.trim();
  if (!p) return false;
  return /^[A-Za-z]:([\\/]|$)/.test(p) || p.startsWith('\\\\') || p.startsWith('//') || p.startsWith('/');
};

const getParentPath = (value: string): string => {
  const normalized = value.trim().replace(/[\\/]+$/, '');
  if (!normalized) return '';

  if (/^[A-Za-z]:$/.test(normalized)) {
    return `${normalized}/`;
  }

  if (/^[A-Za-z]:[\\/]/.test(normalized)) {
    const drive = normalized.slice(0, 2);
    const rest = normalized.slice(2).replace(/^[\\/]+/, '');
    const parts = rest.split(/[\\/]+/).filter(Boolean);
    if (parts.length === 0) return drive;
    parts.pop();
    return parts.length > 0 ? `${drive}/${parts.join('/')}` : drive;
  }

  if (normalized.startsWith('\\\\') || normalized.startsWith('//')) {
    const parts = normalized.replace(/^[\\/]+/, '').split(/[\\/]+/).filter(Boolean);
    if (parts.length <= 2) {
      return `//${parts.join('/')}`;
    }
    parts.pop();
    return `//${parts.join('/')}`;
  }

  if (normalized === '/') return '/';

  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 1) return '';
  parts.pop();
  return parts.join('/');
};

export default function LibrarySourcesPanel() {
  const { t } = useI18n();
  const saveSourceLabelRaw = t('settingsMenu.librarySourcesPanel.saveSource');
  const saveSourceLabel =
    saveSourceLabelRaw === 'settingsMenu.librarySourcesPanel.saveSource'
      ? 'Sauvegarder'
      : saveSourceLabelRaw;
  const [sources, setSources] = useState<LibrarySource[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [path, setPath] = useState('');
  const [category, setCategory] = useState<'FILM' | 'SERIES'>('FILM');
  const [label, setLabel] = useState('');
  const [shareWithFriends, setShareWithFriends] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState('');
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseEntries, setBrowseEntries] = useState<ExplorerEntry[]>([]);
  const [explorerRoot, setExplorerRoot] = useState('');
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ sync_in_progress: boolean; scanning_source_id?: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncSourcesToCloud = useCallback(async (list: LibrarySource[]) => {
    const payload = list.map((s) => ({
      id: s.id,
      path: s.path,
      category: s.category,
      label: s.label ?? null,
      share_with_friends: s.share_with_friends,
      is_enabled: s.is_enabled !== false,
    }));
    await saveUserConfigMerge({ librarySources: payload });
  }, []);

  const loadSources = useCallback(async () => {
    const res = await serverApi.getLibrarySources();
    if (res.success && Array.isArray(res.data)) {
      setSources(res.data);
    } else {
      setSources([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  useEffect(() => {
    const loadExplorerRoot = async () => {
      const res = await serverApi.getMediaPaths();
      if (res.success && res.data?.download_dir_root) {
        setExplorerRoot(res.data.download_dir_root);
      }
    };
    loadExplorerRoot();
  }, []);

  const loadExplorer = useCallback(async (targetPath: string) => {
    setBrowseLoading(true);
    const res = await serverApi.listLibrarySourceExplorerFiles(targetPath || undefined);
    setBrowseLoading(false);
    if (res.success && Array.isArray(res.data)) {
      setBrowseEntries(res.data);
    } else {
      setBrowseEntries([]);
      if (browseOpen) {
        setMessage({ type: 'error', text: res.error || t('settingsMenu.librarySourcesPanel.browseError') });
      }
    }
  }, [browseOpen, t]);

  useEffect(() => {
    if (!browseOpen) return;
    loadExplorer(browsePath);
  }, [browseOpen, browsePath, loadExplorer]);

  const fetchSyncStatus = useCallback(async () => {
    const res = await serverApi.getLibrarySyncStatus();
    if (res.success && res.data) {
      setSyncStatus({ sync_in_progress: res.data.sync_in_progress, scanning_source_id: res.data.scanning_source_id });
      return res.data.sync_in_progress;
    }
    return false;
  }, []);

  useEffect(() => {
    fetchSyncStatus();
  }, [fetchSyncStatus]);

  useEffect(() => {
    if (!syncStatus?.sync_in_progress) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (scanningId !== null) {
        setScanningId(null);
        loadSources();
      }
      return;
    }
    pollIntervalRef.current = setInterval(async () => {
      const still = await fetchSyncStatus();
      if (!still) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        setScanningId(null);
        loadSources();
      }
    }, 2000);
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [syncStatus?.sync_in_progress, fetchSyncStatus]);

  const resetForm = () => {
    setEditingId(null);
    setPath('');
    setCategory('FILM');
    setLabel('');
    setShareWithFriends(true);
  };

  const handleAddOrUpdate = async () => {
    const trimmedPath = path.trim();
    if (!trimmedPath) {
      setMessage({ type: 'error', text: t('settingsMenu.librarySourcesPanel.addError') });
      return;
    }
    setMessage(null);
    setAdding(true);
    try {
      if (editingId) {
        const updateRes = await serverApi.updateLibrarySource(editingId, {
          path: trimmedPath,
          category,
          label: label.trim() || undefined,
          share_with_friends: shareWithFriends,
        });
        if (!updateRes.success || !updateRes.data) {
          setMessage({ type: 'error', text: updateRes.error || t('settingsMenu.librarySourcesPanel.updateError') });
          return;
        }
        resetForm();
        await loadSources();
        const newList = await serverApi.getLibrarySources().then((r) => (r.success && r.data ? r.data : []));
        await syncSourcesToCloud(newList);
        setMessage({ type: 'success', text: t('settingsMenu.librarySourcesPanel.updateSuccess') });
        return;
      }

      const createRes = await serverApi.createLibrarySource({
        path: trimmedPath,
        category,
        label: label.trim() || undefined,
        share_with_friends: shareWithFriends,
      });
      if (!createRes.success || !createRes.data) {
        setMessage({ type: 'error', text: createRes.error || t('settingsMenu.librarySourcesPanel.addError') });
        return;
      }
      resetForm();
      await loadSources();
      const newList = await serverApi.getLibrarySources().then((r) => (r.success && r.data ? r.data : []));
      await syncSourcesToCloud(newList);
      setMessage({ type: 'success', text: t('settingsMenu.librarySourcesPanel.addSuccess') });
      const newId = createRes.data.id;
      const scanRes = await serverApi.scanLibrarySource(newId);
      if (scanRes.success) {
        setScanningId(newId);
        await fetchSyncStatus();
      }
    } catch {
      setMessage({ type: 'error', text: t('settingsMenu.librarySourcesPanel.addError') });
    } finally {
      setAdding(false);
    }
  };

  const handleStartEdit = (source: LibrarySource) => {
    setMessage(null);
    setEditingId(source.id);
    setPath(source.path);
    setCategory(source.category === 'SERIES' ? 'SERIES' : 'FILM');
    setLabel(source.label ?? '');
    setShareWithFriends(source.share_with_friends);
  };

  const handleCancelEdit = () => {
    resetForm();
  };

  const handleScan = async (id: string) => {
    setScanningId(id);
    setMessage(null);
    try {
      const res = await serverApi.scanLibrarySource(id);
      if (res.success) {
        setMessage({ type: 'success', text: t('settingsMenu.librarySourcesPanel.scanStarted') });
        await fetchSyncStatus();
      } else {
        setScanningId(null);
      }
    } catch {
      setScanningId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('common.confirm'))) return;
    setDeletingId(id);
    setMessage(null);
    try {
      const res = await serverApi.deleteLibrarySource(id);
      if (res.success) {
        await loadSources();
        const newList = await serverApi.getLibrarySources().then((r) => (r.success && r.data ? r.data : []));
        await syncSourcesToCloud(newList);
        setMessage({ type: 'success', text: t('settingsMenu.librarySourcesPanel.deleteSuccess') });
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleShareToggle = async (source: LibrarySource) => {
    const next = !source.share_with_friends;
    const res = await serverApi.setLibrarySourceShare(source.id, next);
    if (res.success) {
      await loadSources();
      const newList = await serverApi.getLibrarySources().then((r) => (r.success && r.data ? r.data : []));
      await syncSourcesToCloud(newList);
    }
  };

  const handleEnabledToggle = async (source: LibrarySource) => {
    const next = source.is_enabled === false;
    setMessage(null);
    const res = await serverApi.setLibrarySourceEnabled(source.id, next);
    if (res.success) {
      await loadSources();
      const newList = await serverApi.getLibrarySources().then((r) => (r.success && r.data ? r.data : []));
      await syncSourcesToCloud(newList);
      setMessage({
        type: 'success',
        text: next
          ? t('settingsMenu.librarySourcesPanel.enabledSuccess')
          : t('settingsMenu.librarySourcesPanel.disabledSuccess'),
      });
    } else {
      setMessage({ type: 'error', text: res.error || t('settingsMenu.librarySourcesPanel.addError') });
    }
  };

  const openBrowse = () => {
    setMessage(null);
    const current = path.trim().replace(/\\/g, '/');
    const root = explorerRoot.trim().replace(/\\/g, '/');
    if (current && isAbsoluteLikePath(current)) {
      setBrowsePath(current);
    } else if (current && root) {
      setBrowsePath(`${root.replace(/[\\/]+$/, '')}/${current.replace(/^[\\/]+/, '')}`);
    } else if (root) {
      setBrowsePath(root);
    } else {
      setBrowsePath(current);
    }
    setBrowseOpen(true);
  };

  const closeBrowse = () => {
    setBrowseOpen(false);
    setBrowsePath('');
    setBrowseEntries([]);
  };

  const handleBrowseUp = () => {
    setBrowsePath(getParentPath(browsePath));
  };

  const handleChooseCurrentFolder = () => {
    const current = browsePath.trim();
    if (isAbsoluteLikePath(current)) {
      setPath(current);
      closeBrowse();
      return;
    }

    const root = explorerRoot.trim().replace(/[\\/]+$/, '');
    const relative = current.replace(/^[\\/]+/, '');
    const nextPath = relative ? (root ? `${root}/${relative}` : relative) : root;
    if (!nextPath) return;
    setPath(nextPath);
    closeBrowse();
  };

  if (loading) {
    return (
      <div class="p-4 text-gray-400">
        <span className="inline-flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          {t('settingsMenu.librarySourcesPanel.loading')}
        </span>
      </div>
    );
  }

  return (
    <div class="p-4 space-y-4">
      <p className="text-gray-400 text-sm">{t('settingsMenu.librarySourcesPanel.intro')}</p>

      {message && (
        <div
          class={`rounded px-3 py-2 text-sm ${
            message.type === 'success' ? 'bg-green-900/30 text-green-300' : 'bg-red-900/30 text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      <div class="rounded-lg border border-gray-700 bg-gray-800/50 p-4 space-y-3">
        <h3 class="text-sm font-medium text-gray-200">
          {editingId ? t('settingsMenu.librarySourcesPanel.editSource') : t('common.add')}
        </h3>
        <input
          type="text"
          class="w-full rounded bg-gray-900 border border-gray-600 px-3 py-2 text-sm text-white placeholder-gray-500"
          placeholder={t('settingsMenu.librarySourcesPanel.pathPlaceholder')}
          value={path}
          onInput={(e) => setPath((e.target as HTMLInputElement).value)}
        />
        <div class="flex justify-end">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded border border-gray-600 bg-gray-900/60 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800"
            onClick={openBrowse}
          >
            <FolderOpen className="w-4 h-4" />
            {t('settingsMenu.librarySourcesPanel.browse')}
          </button>
        </div>
        <div class="rounded bg-gray-900/60 border border-gray-700 px-3 py-2 text-xs text-gray-400 space-y-1.5">
          <p class="font-medium text-gray-300">{t('settingsMenu.librarySourcesPanel.pathFormatTitle')}</p>
          <p>{t('settingsMenu.librarySourcesPanel.pathFormatWindows')}</p>
          <p>{t('settingsMenu.librarySourcesPanel.pathFormatMac')}</p>
          <p class="text-gray-500 italic">{t('settingsMenu.librarySourcesPanel.pathFormatNote')}</p>
        </div>
        <div class="flex flex-wrap gap-4 items-center">
          <label class="flex items-center gap-2 text-sm text-gray-300">
            <span>{t('settingsMenu.librarySourcesPanel.category')}</span>
            <select
              class="rounded bg-gray-900 border border-gray-600 px-2 py-1 text-sm text-white"
              value={category}
              onChange={(e) => setCategory((e.target as HTMLSelectElement).value as 'FILM' | 'SERIES')}
            >
              <option value="FILM">{t('settingsMenu.librarySourcesPanel.categoryFilm')}</option>
              <option value="SERIES">{t('settingsMenu.librarySourcesPanel.categorySeries')}</option>
            </select>
          </label>
          <input
            type="text"
            class="rounded bg-gray-900 border border-gray-600 px-3 py-1.5 text-sm text-white placeholder-gray-500 w-40"
            placeholder={t('settingsMenu.librarySourcesPanel.labelOptional')}
            value={label}
            onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
          />
          <label class="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={shareWithFriends}
              onChange={(e) => setShareWithFriends((e.target as HTMLInputElement).checked)}
            />
            <Users className="w-4 h-4" />
            {t('settingsMenu.librarySourcesPanel.shareWithFriends')}
          </label>
        </div>
        <div class="flex items-center gap-2">
          {editingId ? (
            <>
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded bg-primary/80 hover:bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                onClick={handleAddOrUpdate}
                disabled={adding}
              >
                <Pencil className="w-4 h-4" />
                {adding ? t('common.loading') : saveSourceLabel}
              </button>
              <button
                type="button"
                class="inline-flex items-center gap-2 rounded border border-gray-600 bg-gray-900/60 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800"
                onClick={handleCancelEdit}
              >
                {t('common.cancel')}
              </button>
            </>
          ) : (
            <button
              type="button"
              class="inline-flex items-center gap-2 rounded bg-primary/80 hover:bg-primary px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              onClick={handleAddOrUpdate}
              disabled={adding}
            >
              <FolderPlus className="w-4 h-4" />
              {adding ? t('common.loading') : t('settingsMenu.librarySourcesPanel.addSource')}
            </button>
          )}
        </div>
      </div>

      <div class="space-y-2">
        {sources.length === 0 ? (
          <p class="text-gray-500 text-sm py-4">{t('settingsMenu.librarySourcesPanel.noSources')}</p>
        ) : (
          <ul class="divide-y divide-gray-700 rounded-lg border border-gray-700 overflow-hidden">
            {sources.map((src) => {
              const isScanning = src.id === (syncStatus?.scanning_source_id ?? scanningId);
              const isSynced = src.last_scanned_at != null && src.last_scanned_at > 0;
              const isEnabled = src.is_enabled !== false;
              return (
                <li key={src.id} class="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-gray-800/30 hover:bg-gray-800/50">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-medium text-white truncate">{src.path}</p>
                    <p class="text-xs text-gray-400 flex items-center gap-2 flex-wrap">
                      <span>
                        {src.category} {src.label ? `· ${src.label}` : ''}
                      </span>
                      {(src.media_count != null || src.folder_count != null) && (
                        <span>
                          · {t('settingsMenu.librarySourcesPanel.stats', {
                            mediaCount: src.media_count ?? 0,
                            folderCount: src.folder_count ?? 0,
                          })}
                        </span>
                      )}
                      <span class={isEnabled ? 'text-emerald-400' : 'text-gray-500'}>
                        · {isEnabled ? t('settingsMenu.librarySourcesPanel.enabled') : t('settingsMenu.librarySourcesPanel.disabled')}
                      </span>
                      {isScanning && (
                        <span class="inline-flex items-center gap-1 text-amber-400">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          {t('settingsMenu.librarySourcesPanel.syncing')}
                        </span>
                      )}
                      {!isScanning && isSynced && (
                        <span class="inline-flex items-center gap-1 text-green-400" title={t('settingsMenu.librarySourcesPanel.synchronized')}>
                          <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                          {t('settingsMenu.librarySourcesPanel.synchronized')}
                        </span>
                      )}
                    </p>
                  </div>
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-600"
                      onClick={() => handleStartEdit(src)}
                      title={t('settingsMenu.librarySourcesPanel.editSource')}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-600"
                      onClick={() => handleEnabledToggle(src)}
                      title={isEnabled ? t('settingsMenu.librarySourcesPanel.disableSource') : t('settingsMenu.librarySourcesPanel.enableSource')}
                    >
                      {isEnabled ? <ToggleRight className="w-4 h-4 text-emerald-400" /> : <ToggleLeft className="w-4 h-4" />}
                    </button>
                    <label class="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer" title={t('settingsMenu.librarySourcesPanel.shareWithFriends')}>
                      <input
                        type="checkbox"
                        checked={src.share_with_friends}
                        onChange={() => handleShareToggle(src)}
                      />
                      <Users className="w-3.5 h-3.5" />
                    </label>
                    <button
                      type="button"
                      class="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-600 disabled:opacity-50"
                      onClick={() => handleScan(src.id)}
                      disabled={syncStatus?.sync_in_progress === true || !isEnabled}
                      title={t('settingsMenu.librarySourcesPanel.scan')}
                    >
                      <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
                    </button>
                    <button
                      type="button"
                      class="p-1.5 rounded text-gray-400 hover:text-red-400 hover:bg-gray-600 disabled:opacity-50"
                      onClick={() => handleDelete(src.id)}
                      disabled={deletingId !== null}
                      title={t('settingsMenu.librarySourcesPanel.delete')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {browseOpen && createPortal(
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('settingsMenu.librarySourcesPanel.browseTitle')}
        >
          <div class="bg-[#1a1c20] border border-gray-700 rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div class="flex items-center justify-between px-4 py-3 border-b border-gray-700">
              <h3 class="text-lg font-semibold text-white">{t('settingsMenu.librarySourcesPanel.browseTitle')}</h3>
              <button
                type="button"
                onClick={closeBrowse}
                class="text-gray-400 hover:text-white p-1 rounded"
                aria-label={t('common.close')}
              >
                ×
              </button>
            </div>

            <div class="px-4 py-2 border-b border-gray-700 text-xs text-gray-400 font-mono truncate">
              {browsePath || '/'}
            </div>

            <div class="flex-1 overflow-y-auto p-2 min-h-[220px]">
              {browseLoading ? (
                <div class="flex items-center justify-center py-8 text-gray-300">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                </div>
              ) : (
                <ul class="space-y-1">
                  {browsePath && (
                    <li>
                      <button
                        type="button"
                        onClick={handleBrowseUp}
                        class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-gray-300 hover:bg-gray-800"
                      >
                        <Folder className="w-5 h-5 text-amber-500" />
                        ..
                      </button>
                    </li>
                  )}
                  {browseEntries
                    .filter((entry) => entry.is_directory)
                    .map((entry) => (
                      <li key={entry.path}>
                        <button
                          type="button"
                          onClick={() => setBrowsePath(entry.path)}
                          class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-gray-300 hover:bg-gray-800"
                        >
                          <Folder className="w-5 h-5 text-amber-500" />
                          <span class="truncate">{entry.name}</span>
                        </button>
                      </li>
                    ))}
                  {browseEntries.filter((entry) => entry.is_directory).length === 0 && (
                    <li class="px-3 py-4 text-gray-500 text-sm">{t('settingsMenu.librarySourcesPanel.noFolders')}</li>
                  )}
                </ul>
              )}
            </div>

            <div class="flex items-center gap-2 px-4 py-3 border-t border-gray-700">
              <button
                type="button"
                onClick={closeBrowse}
                class="btn btn-ghost btn-sm text-gray-400"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleChooseCurrentFolder}
                disabled={!browsePath.trim() && !explorerRoot.trim()}
                class="btn btn-primary btn-sm ml-auto disabled:opacity-50"
              >
                {t('settingsMenu.librarySourcesPanel.chooseCurrentFolder')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
