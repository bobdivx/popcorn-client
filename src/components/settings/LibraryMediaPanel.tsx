import { useState, useEffect, useCallback, useRef, useMemo } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';
import { clientApi } from '../../lib/client/api';
import type { LibraryMediaEntry, LibrarySource, LibraryIntegrityItem, LibraryIntegrityStatus } from '../../lib/client/server-api/library';
import { invalidateLibraryCache } from '../../lib/client/server-api/library';
import { Film, FileX, FolderOpen, Pencil, RefreshCw, Trash2, Tv, CheckSquare, Square, X, ShieldAlert, ShieldCheck, Copy } from 'lucide-preact';
import { useConfirmDialog } from '../ui/useConfirmDialog';
import {
  findLibraryDuplicates,
  suggestedDuplicateIdsToRemove,
  isInTorrentClient,
  type LibraryDuplicateGroup,
  type DuplicateReason,
} from './libraryDuplicates';

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
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
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

  const [integrityStatus, setIntegrityStatus] = useState<LibraryIntegrityStatus | null>(null);
  const [integrityStarting, setIntegrityStarting] = useState(false);
  const [integrityDeleting, setIntegrityDeleting] = useState(false);
  const [selectedCorruptedIds, setSelectedCorruptedIds] = useState<Set<string>>(new Set());
  const integrityPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [duplicatesScanned, setDuplicatesScanned] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<LibraryDuplicateGroup[]>([]);
  const [selectedDuplicateIds, setSelectedDuplicateIds] = useState<Set<string>>(new Set());
  const [duplicatesDeleting, setDuplicatesDeleting] = useState(false);
  const [duplicatesFinding, setDuplicatesFinding] = useState(false);
  const [clientTorrentHashes, setClientTorrentHashes] = useState<Set<string>>(new Set());

  const stopIntegrityPolling = useCallback(() => {
    if (integrityPollRef.current) {
      clearInterval(integrityPollRef.current);
      integrityPollRef.current = null;
    }
  }, []);

  const pollIntegrityStatus = useCallback(async () => {
    const res = await serverApi.getLibraryIntegrityStatus();
    if (res.success && res.data) {
      setIntegrityStatus(res.data);
      if (!res.data.in_progress) {
        stopIntegrityPolling();
      }
    }
  }, [stopIntegrityPolling]);

  const startIntegrityPolling = useCallback(() => {
    stopIntegrityPolling();
    void pollIntegrityStatus();
    integrityPollRef.current = setInterval(() => {
      void pollIntegrityStatus();
    }, 2000);
  }, [pollIntegrityStatus, stopIntegrityPolling]);

  useEffect(() => {
    void pollIntegrityStatus();
    return () => stopIntegrityPolling();
  }, [pollIntegrityStatus, stopIntegrityPolling]);

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

  useEffect(() => {
    if (!duplicatesScanned) return;
    const groups = findLibraryDuplicates(list, { clientTorrentHashes });
    setDuplicateGroups(groups);
    setSelectedDuplicateIds((prev) => {
      const valid = new Set(groups.flatMap((g) => g.items.map((i) => i.id)));
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
      }
      return next;
    });
  }, [list, duplicatesScanned, clientTorrentHashes]);

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
    if (
      !(await confirm({
        title: t('common.delete') || 'Supprimer',
        message: t('settingsMenu.libraryMediaPanel.removeFromLibraryConfirm'),
        danger: true,
        confirmLabel: t('common.delete') || 'Supprimer',
      }))
    ) {
      return;
    }
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
    if (
      !(await confirm({
        title: t('common.delete') || 'Supprimer',
        message: t('settingsMenu.libraryMediaPanel.deleteFileConfirm'),
        danger: true,
        confirmLabel: t('common.delete') || 'Supprimer',
      }))
    ) {
      return;
    }
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

  const handleStartIntegrityCheck = async () => {
    setMessage(null);
    setIntegrityStarting(true);
    setSelectedCorruptedIds(new Set());
    try {
      const res = await serverApi.startLibraryIntegrityCheck();
      if (res.success) {
        const text = res.data?.includes('déjà') || res.data?.includes('already')
          ? t('settingsMenu.libraryMediaPanel.integrityAlreadyRunning')
          : t('settingsMenu.libraryMediaPanel.integrityStarted');
        setMessage({ type: 'success', text });
        startIntegrityPolling();
      } else {
        setMessage({ type: 'error', text: res.error || t('errors.generic') });
      }
    } catch {
      setMessage({ type: 'error', text: t('errors.generic') });
    } finally {
      setIntegrityStarting(false);
    }
  };

  const toggleCorruptedSelect = (id: string) => {
    setSelectedCorruptedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllCorrupted = (items: LibraryIntegrityItem[]) => {
    if (selectedCorruptedIds.size === items.length) {
      setSelectedCorruptedIds(new Set());
    } else {
      setSelectedCorruptedIds(new Set(items.map((m) => m.id)));
    }
  };

  const handleDeleteCorrupted = async (ids: string[], deleteFiles: boolean) => {
    if (ids.length === 0) return;
    const confirmKey = deleteFiles
      ? 'settingsMenu.libraryMediaPanel.integrityDeleteConfirmFiles'
      : 'settingsMenu.libraryMediaPanel.integrityDeleteConfirmLibrary';
    if (
      !(await confirm({
        title: t('common.delete') || 'Supprimer',
        message: t(confirmKey, { count: ids.length }),
        danger: true,
        confirmLabel: t('common.delete') || 'Supprimer',
      }))
    ) {
      return;
    }

    setIntegrityDeleting(true);
    setMessage(null);
    try {
      const res = await serverApi.deleteCorruptedLibraryMedia(ids, deleteFiles);
      if (res.success && res.data) {
        invalidateLibraryCache();
        await loadMedia();
        await pollIntegrityStatus();
        setSelectedCorruptedIds(new Set());
        setMessage({
          type: 'success',
          text: t('settingsMenu.libraryMediaPanel.integrityDeleteSuccess', {
            removed: res.data.removed_from_library,
            files: res.data.deleted_files,
          }),
        });
        if (res.data.errors.length > 0) {
          setMessage({
            type: 'error',
            text: res.data.errors.join(' · '),
          });
        }
      } else {
        setMessage({ type: 'error', text: res.error || t('settingsMenu.libraryMediaPanel.integrityDeleteError') });
      }
    } catch {
      setMessage({ type: 'error', text: t('settingsMenu.libraryMediaPanel.integrityDeleteError') });
    } finally {
      setIntegrityDeleting(false);
    }
  };

  const duplicateReasonLabel = (reason: DuplicateReason): string => {
    if (reason === 'path') return t('settingsMenu.libraryMediaPanel.duplicatesReasonPath');
    if (reason === 'info_hash') return t('settingsMenu.libraryMediaPanel.duplicatesReasonHash');
    if (reason === 'tmdb_episode') return t('settingsMenu.libraryMediaPanel.duplicatesReasonEpisode');
    return t('settingsMenu.libraryMediaPanel.duplicatesReasonTmdb');
  };

  const handleFindDuplicates = async () => {
    setDuplicatesFinding(true);
    setMessage(null);
    try {
      const hashes = new Set<string>();
      try {
        const torrentsRes = await serverApi.getClientTorrents();
        if (torrentsRes.success && Array.isArray(torrentsRes.data)) {
          for (const t of torrentsRes.data) {
            const h = (t.info_hash || '').trim().toLowerCase();
            if (h) hashes.add(h);
          }
        }
      } catch {
        // Sans liste client : on se base quand même sur info_hash local_media.
      }
      setClientTorrentHashes(hashes);
      const groups = findLibraryDuplicates(list, { clientTorrentHashes: hashes });
      setDuplicateGroups(groups);
      setDuplicatesScanned(true);
      setSelectedDuplicateIds(new Set(suggestedDuplicateIdsToRemove(groups, hashes)));
      if (groups.length === 0) {
        setMessage({ type: 'success', text: t('settingsMenu.libraryMediaPanel.duplicatesNone') });
      }
    } finally {
      setDuplicatesFinding(false);
    }
  };

  const toggleDuplicateSelect = (id: string) => {
    setSelectedDuplicateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectSuggestedDuplicates = () => {
    setSelectedDuplicateIds(new Set(suggestedDuplicateIdsToRemove(duplicateGroups, clientTorrentHashes)));
  };

  const clearDuplicateSelection = () => {
    setSelectedDuplicateIds(new Set());
  };

  const duplicateSelectableIds = useMemo(() => {
    // Tout est sélectionnable manuellement, y compris les médias du client torrent.
    return new Set(duplicateGroups.flatMap((g) => g.items.map((i) => i.id)));
  }, [duplicateGroups]);

  const normalizeInfoHash = (hash: string | null | undefined): string | null => {
    const h = (hash || '').trim().toLowerCase();
    if (!h || h.startsWith('local_')) return null;
    return h;
  };

  const handleDeleteDuplicates = async (ids: string[], deleteFiles: boolean) => {
    if (ids.length === 0) return;

    const selectedEntries = ids
      .map((id) => list.find((m) => m.id === id) || duplicateGroups.flatMap((g) => g.items).find((m) => m.id === id))
      .filter((e): e is LibraryMediaEntry => !!e);

    const clientCount = selectedEntries.filter((e) => isInTorrentClient(e, clientTorrentHashes)).length;
    const confirmKey = clientCount > 0
      ? deleteFiles
        ? 'settingsMenu.libraryMediaPanel.duplicatesDeleteConfirmFilesWithTorrent'
        : 'settingsMenu.libraryMediaPanel.duplicatesDeleteConfirmLibraryWithTorrent'
      : deleteFiles
        ? 'settingsMenu.libraryMediaPanel.duplicatesDeleteConfirmFiles'
        : 'settingsMenu.libraryMediaPanel.duplicatesDeleteConfirmLibrary';

    if (
      !(await confirm({
        title: t('common.delete') || 'Supprimer',
        message: t(confirmKey, { count: ids.length, torrents: clientCount }),
        danger: true,
        confirmLabel: t('common.delete') || 'Supprimer',
      }))
    ) {
      return;
    }

    setDuplicatesDeleting(true);
    setMessage(null);
    let removed = 0;
    let files = 0;
    let torrentsRemoved = 0;
    const errors: string[] = [];
    const removedHashes = new Set<string>();

    try {
      for (const id of ids) {
        const entry =
          list.find((m) => m.id === id) ||
          duplicateGroups.flatMap((g) => g.items).find((m) => m.id === id);
        const hash = normalizeInfoHash(entry?.info_hash);

        try {
          // Retirer du client torrent si présent (une seule fois par info_hash).
          if (hash && clientTorrentHashes.has(hash) && !removedHashes.has(hash)) {
            try {
              await clientApi.removeTorrent(hash, deleteFiles);
              removedHashes.add(hash);
              torrentsRemoved += 1;
              setClientTorrentHashes((prev) => {
                const next = new Set(prev);
                next.delete(hash);
                return next;
              });
            } catch (e) {
              errors.push(
                `${entry?.file_name || hash}: torrent — ${e instanceof Error ? e.message : String(e)}`
              );
              // On continue quand même le retrait bibliothèque.
            }
          }

          const res = deleteFiles
            ? await serverApi.deleteLibraryMediaFile(id)
            : await serverApi.deleteLibraryMedia(id);
          if (res.success) {
            removed += 1;
            if (deleteFiles) files += 1;
          } else if (deleteFiles && hash && removedHashes.has(hash)) {
            // Fichier déjà retiré via removeTorrent(deleteFiles=true) : nettoyer l'entrée DB.
            const fallback = await serverApi.deleteLibraryMedia(id);
            if (fallback.success) {
              removed += 1;
              files += 1;
            } else {
              errors.push(res.error || fallback.error || id);
            }
          } else {
            errors.push(res.error || id);
          }
        } catch {
          errors.push(id);
        }
      }

      invalidateLibraryCache();
      await loadMedia();
      setSelectedDuplicateIds(new Set());
      setDuplicatesScanned(false);
      setDuplicateGroups([]);

      const successText = t('settingsMenu.libraryMediaPanel.duplicatesDeleteSuccess', {
        removed,
        files,
        torrents: torrentsRemoved,
      });

      if (errors.length > 0 && removed === 0) {
        setMessage({
          type: 'error',
          text: t('settingsMenu.libraryMediaPanel.duplicatesDeleteError'),
        });
      } else {
        setMessage({
          type: errors.length > 0 ? 'error' : 'success',
          text:
            errors.length > 0
              ? `${successText} · ${errors.slice(0, 3).join(' · ')}`
              : successText,
        });
      }
    } finally {
      setDuplicatesDeleting(false);
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

      <section class="rounded-lg border border-gray-700 bg-gray-800/40 p-4 space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="inline-flex items-center gap-2 text-sm font-semibold text-white">
              <ShieldCheck className="w-4 h-4 text-primary" />
              {t('settingsMenu.libraryMediaPanel.integrityTitle')}
            </h3>
            <p class="text-xs text-gray-400 mt-1 max-w-2xl">{t('settingsMenu.libraryMediaPanel.integrityIntro')}</p>
          </div>
          <button
            type="button"
            onClick={handleStartIntegrityCheck}
            disabled={integrityStarting || integrityStatus?.in_progress}
            class="inline-flex items-center gap-2 rounded bg-amber-700/80 hover:bg-amber-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            <ShieldAlert className={`w-4 h-4 ${integrityStatus?.in_progress ? 'animate-pulse' : ''}`} />
            {integrityStatus?.in_progress
              ? t('settingsMenu.libraryMediaPanel.integrityChecking')
              : t('settingsMenu.libraryMediaPanel.integrityStart')}
          </button>
        </div>

        {integrityStatus && (integrityStatus.in_progress || integrityStatus.finished_at) && (
          <div class="space-y-2">
            {integrityStatus.in_progress && (
              <p class="text-xs text-gray-300">
                {t('settingsMenu.libraryMediaPanel.integrityProgress', {
                  checked: integrityStatus.checked,
                  total: integrityStatus.total,
                  current: integrityStatus.current_file || '…',
                })}
              </p>
            )}
            {!integrityStatus.in_progress && integrityStatus.finished_at && (
              <p class="text-xs text-gray-300">
                {t('settingsMenu.libraryMediaPanel.integrityReport', {
                  valid: integrityStatus.valid_count,
                  corrupted: integrityStatus.corrupted_count,
                })}
              </p>
            )}

            {integrityStatus.corrupted.length === 0 && !integrityStatus.in_progress && integrityStatus.finished_at && (
              <p class="text-xs text-green-400">{t('settingsMenu.libraryMediaPanel.integrityNoCorrupted')}</p>
            )}

            {integrityStatus.corrupted.length > 0 && (
              <div class="space-y-2">
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    class="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-50"
                    disabled={integrityDeleting || selectedCorruptedIds.size === 0}
                    onClick={() => handleDeleteCorrupted(Array.from(selectedCorruptedIds), false)}
                  >
                    {t('settingsMenu.libraryMediaPanel.integrityDeleteFromLibrary')}
                    {selectedCorruptedIds.size > 0 ? ` (${selectedCorruptedIds.size})` : ''}
                  </button>
                  <button
                    type="button"
                    class="rounded border border-red-800/80 px-2 py-1 text-xs text-red-300 hover:bg-red-900/30 disabled:opacity-50"
                    disabled={integrityDeleting || selectedCorruptedIds.size === 0}
                    onClick={() => handleDeleteCorrupted(Array.from(selectedCorruptedIds), true)}
                  >
                    {t('settingsMenu.libraryMediaPanel.integrityDeleteFiles')}
                    {selectedCorruptedIds.size > 0 ? ` (${selectedCorruptedIds.size})` : ''}
                  </button>
                  <button
                    type="button"
                    class="rounded border border-red-900 px-2 py-1 text-xs text-red-200 hover:bg-red-900/40 disabled:opacity-50"
                    disabled={integrityDeleting}
                    onClick={() => handleDeleteCorrupted(integrityStatus.corrupted.map((c) => c.id), true)}
                  >
                    {t('settingsMenu.libraryMediaPanel.integrityDeleteAll')}
                  </button>
                </div>

                <div class="rounded border border-red-900/40 bg-red-950/20 overflow-hidden">
                  <div class="overflow-x-auto max-h-[30vh] overflow-y-auto">
                    <table class="w-full text-xs text-left">
                      <thead class="sticky top-0 bg-gray-900/95 text-gray-300 border-b border-gray-700">
                        <tr>
                          <th class="px-2 py-2 w-8">
                            <button
                              type="button"
                              onClick={() => toggleSelectAllCorrupted(integrityStatus.corrupted)}
                              class="text-gray-400 hover:text-white"
                            >
                              {selectedCorruptedIds.size === integrityStatus.corrupted.length ? (
                                <CheckSquare className="w-3.5 h-3.5 text-primary" />
                              ) : (
                                <Square className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </th>
                          <th class="px-2 py-2">{t('settingsMenu.libraryMediaPanel.colTitle')}</th>
                          <th class="px-2 py-2">{t('settingsMenu.libraryMediaPanel.colPath')}</th>
                          <th class="px-2 py-2">{t('settingsMenu.libraryMediaPanel.integrityColIssues')}</th>
                        </tr>
                      </thead>
                      <tbody class="text-gray-300">
                        {integrityStatus.corrupted.map((item) => (
                          <tr key={item.id} class="border-b border-gray-800/80 align-top">
                            <td class="px-2 py-2">
                              <button type="button" onClick={() => toggleCorruptedSelect(item.id)} class="text-gray-400 hover:text-white">
                                {selectedCorruptedIds.has(item.id) ? (
                                  <CheckSquare className="w-3.5 h-3.5 text-primary" />
                                ) : (
                                  <Square className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </td>
                            <td class="px-2 py-2 font-medium text-white">
                              {item.tmdb_title || item.file_name}
                            </td>
                            <td class="px-2 py-2 text-gray-400 break-all">{item.file_path}</td>
                            <td class="px-2 py-2 text-red-300">{item.issues.join(' · ')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section class="rounded-lg border border-gray-700 bg-gray-800/40 p-4 space-y-3">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="inline-flex items-center gap-2 text-sm font-semibold text-white">
              <Copy className="w-4 h-4 text-primary" />
              {t('settingsMenu.libraryMediaPanel.duplicatesTitle')}
            </h3>
            <p class="text-xs text-gray-400 mt-1 max-w-2xl">{t('settingsMenu.libraryMediaPanel.duplicatesIntro')}</p>
          </div>
          <button
            type="button"
            onClick={handleFindDuplicates}
            disabled={duplicatesFinding}
            class="inline-flex items-center gap-2 rounded bg-violet-700/80 hover:bg-violet-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            <Copy className={`w-4 h-4 ${duplicatesFinding ? 'animate-pulse' : ''}`} />
            {duplicatesFinding
              ? t('settingsMenu.libraryMediaPanel.duplicatesFinding')
              : t('settingsMenu.libraryMediaPanel.duplicatesFind')}
          </button>
        </div>

        {duplicatesScanned && (
          <div class="space-y-2">
            <p class="text-xs text-gray-300">
              {t('settingsMenu.libraryMediaPanel.duplicatesReport', {
                groups: duplicateGroups.length,
                extras: suggestedDuplicateIdsToRemove(duplicateGroups, clientTorrentHashes).length,
              })}
            </p>

            {duplicateGroups.length === 0 ? (
              <p class="text-xs text-green-400">{t('settingsMenu.libraryMediaPanel.duplicatesNone')}</p>
            ) : (
              <div class="space-y-3">
                <div class="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    class="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-50"
                    disabled={duplicatesDeleting || selectedDuplicateIds.size === 0}
                    onClick={() => handleDeleteDuplicates(Array.from(selectedDuplicateIds), false)}
                  >
                    {t('settingsMenu.libraryMediaPanel.duplicatesDeleteFromLibrary')}
                    {selectedDuplicateIds.size > 0 ? ` (${selectedDuplicateIds.size})` : ''}
                  </button>
                  <button
                    type="button"
                    class="rounded border border-red-800/80 px-2 py-1 text-xs text-red-300 hover:bg-red-900/30 disabled:opacity-50"
                    disabled={duplicatesDeleting || selectedDuplicateIds.size === 0}
                    onClick={() => handleDeleteDuplicates(Array.from(selectedDuplicateIds), true)}
                  >
                    {t('settingsMenu.libraryMediaPanel.duplicatesDeleteFiles')}
                    {selectedDuplicateIds.size > 0 ? ` (${selectedDuplicateIds.size})` : ''}
                  </button>
                  <button
                    type="button"
                    class="rounded border border-gray-600 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700 disabled:opacity-50"
                    disabled={duplicatesDeleting}
                    onClick={selectSuggestedDuplicates}
                  >
                    {t('settingsMenu.libraryMediaPanel.duplicatesSelectSuggested')}
                  </button>
                  <button
                    type="button"
                    class="rounded border border-gray-600 px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 disabled:opacity-50"
                    disabled={duplicatesDeleting || selectedDuplicateIds.size === 0}
                    onClick={clearDuplicateSelection}
                  >
                    {t('settingsMenu.libraryMediaPanel.duplicatesClearSelection')}
                  </button>
                </div>

                {duplicateGroups.map((group) => (
                  <div key={group.id} class="rounded border border-violet-900/40 bg-violet-950/15 overflow-hidden">
                    <div class="px-3 py-2 border-b border-gray-700/80 flex flex-wrap items-center gap-2 text-xs">
                      <span class="font-medium text-violet-200">{duplicateReasonLabel(group.reason)}</span>
                      <span class="text-gray-500">·</span>
                      <span class="text-gray-400">
                        {t('settingsMenu.libraryMediaPanel.duplicatesGroupCount', { count: group.items.length })}
                      </span>
                    </div>
                    <div class="overflow-x-auto max-h-[28vh] overflow-y-auto">
                      <table class="w-full text-xs text-left">
                        <thead class="sticky top-0 bg-gray-900/95 text-gray-300 border-b border-gray-700">
                          <tr>
                            <th class="px-2 py-2 w-8"></th>
                            <th class="px-2 py-2">{t('settingsMenu.libraryMediaPanel.colTitle')}</th>
                            <th class="px-2 py-2">{t('settingsMenu.libraryMediaPanel.colPath')}</th>
                            <th class="px-2 py-2">{t('settingsMenu.libraryMediaPanel.colSource')}</th>
                            <th class="px-2 py-2">{t('settingsMenu.libraryMediaPanel.duplicatesColSize')}</th>
                            <th class="px-2 py-2 w-20"></th>
                          </tr>
                        </thead>
                        <tbody class="text-gray-300">
                          {group.items.map((item) => {
                            const isKeep = item.id === group.keepId;
                            const inClient = isInTorrentClient(item, clientTorrentHashes);
                            return (
                              <tr
                                key={item.id}
                                class={`border-b border-gray-800/80 align-top ${isKeep ? 'bg-green-950/20' : ''}`}
                              >
                                <td class="px-2 py-2">
                                  <button
                                    type="button"
                                    onClick={() => toggleDuplicateSelect(item.id)}
                                    class="text-gray-400 hover:text-white"
                                    disabled={!duplicateSelectableIds.has(item.id)}
                                    title={
                                      inClient
                                        ? t('settingsMenu.libraryMediaPanel.duplicatesForceSelectHint')
                                        : undefined
                                    }
                                  >
                                    {selectedDuplicateIds.has(item.id) ? (
                                      <CheckSquare className="w-3.5 h-3.5 text-primary" />
                                    ) : (
                                      <Square className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </td>
                                <td class="px-2 py-2 font-medium text-white">
                                  {item.tmdb_title || item.file_name}
                                  {item.tmdb_id != null && (
                                    <span class="block text-[10px] text-gray-500 font-mono">TMDB: {item.tmdb_id}</span>
                                  )}
                                  {inClient && (
                                    <span class="mt-0.5 inline-block text-[10px] text-sky-300">
                                      {t('settingsMenu.libraryMediaPanel.duplicatesInClient')}
                                    </span>
                                  )}
                                </td>
                                <td class="px-2 py-2 text-gray-400 break-all">{item.file_path}</td>
                                <td class="px-2 py-2 text-gray-400">{getSourceLabel(item, sources, t)}</td>
                                <td class="px-2 py-2 text-gray-400 whitespace-nowrap">
                                  {item.file_size != null
                                    ? `${(item.file_size / (1024 * 1024)).toFixed(0)} Mo`
                                    : '—'}
                                </td>
                                <td class="px-2 py-2 text-right">
                                  {isKeep ? (
                                    <span class="text-[10px] uppercase tracking-wide text-green-400 font-semibold">
                                      {t('settingsMenu.libraryMediaPanel.duplicatesKeep')}
                                    </span>
                                  ) : null}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

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
      {confirmDialog}
    </div>
  );
}
