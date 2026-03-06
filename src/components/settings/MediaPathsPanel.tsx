import { useState, useEffect, useCallback } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { serverApi } from '../../lib/client/server-api';
import { saveUserConfigMerge } from '../../lib/api/popcorn-web';
import { FolderOpen, Folder, Loader2 } from 'lucide-preact';
import { DsCard, DsCardSection } from '../ui/design-system';

type MediaPathType = 'films' | 'series';

interface MediaPathsData {
  download_dir_root: string;
  films_path: string | null;
  series_path: string | null;
  default_path: string | null;
  films_root: string;
  series_root: string;
}

interface ExplorerEntry {
  name: string;
  path: string;
  is_directory: boolean;
  size?: number;
  modified?: number;
}

interface MediaPathsPanelProps {
  onBack?: () => void;
}

export default function MediaPathsPanel({ onBack }: MediaPathsPanelProps) {
  const { t } = useI18n();
  const [data, setData] = useState<MediaPathsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [browseType, setBrowseType] = useState<MediaPathType | null>(null);
  const [browsePath, setBrowsePath] = useState<string>('');
  const [entries, setEntries] = useState<ExplorerEntry[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  const loadMediaPaths = useCallback(async () => {
    const res = await serverApi.getMediaPaths();
    if (res.success && res.data) {
      setData(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMediaPaths();
  }, [loadMediaPaths]);

  const loadExplorer = useCallback(async (path: string) => {
    setBrowseLoading(true);
    const res = await serverApi.listExplorerFiles(path || undefined);
    setBrowseLoading(false);
    if (res.success && Array.isArray(res.data)) {
      setEntries(res.data);
    } else {
      setEntries([]);
    }
  }, []);

  useEffect(() => {
    if (browseType === null) return;
    loadExplorer(browsePath);
  }, [browseType, browsePath, loadExplorer]);

  const openBrowse = (type: MediaPathType) => {
    setBrowseType(type);
    setBrowsePath('');
  };

  const closeBrowse = () => {
    setBrowseType(null);
    setBrowsePath('');
    setEntries([]);
  };

  const handleChooseFolder = async () => {
    if (browseType === null || !data) return;
    const pathToSave = browsePath.trim() || null;
    setSaving(true);
    setMessage(null);
    try {
      const payload =
        browseType === 'films'
          ? { films_path: pathToSave, series_path: data.series_path ?? undefined }
          : { films_path: data.films_path ?? undefined, series_path: pathToSave };
      const putRes = await serverApi.putMediaPaths(payload);
      if (putRes.success && putRes.data) {
        setData(putRes.data);
        const mediaPathsCloud = {
          filmsPath: putRes.data.films_path ?? null,
          seriesPath: putRes.data.series_path ?? null,
          defaultPath: putRes.data.default_path ?? null,
        };
        await saveUserConfigMerge({ mediaPaths: mediaPathsCloud });
        setMessage({ type: 'success', text: t('settingsMenu.mediaPathsPanel.saveSuccess') });
      } else {
        setMessage({ type: 'error', text: t('settingsMenu.mediaPathsPanel.saveError') });
      }
    } catch {
      setMessage({ type: 'error', text: t('settingsMenu.mediaPathsPanel.saveError') });
    } finally {
      setSaving(false);
      closeBrowse();
    }
  };

  const handleEntryClick = (entry: ExplorerEntry) => {
    if (!entry.is_directory) return;
    setBrowsePath(entry.path);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        <span className="ml-3 text-gray-400">{t('settingsMenu.mediaPathsPanel.loading')}</span>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-gray-400 py-4">
        <p>Impossible de charger les chemins médias.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="ds-text-secondary text-sm">{t('settingsMenu.mediaPathsPanel.intro')}</p>

      {message && (
        <div
          className={`ds-status-badge w-fit ${message.type === 'success' ? 'ds-status-badge--success' : 'ds-status-badge--error'}`}
          role={message.type === 'success' ? 'status' : 'alert'}
        >
          {message.text}
        </div>
      )}

      <DsCard variant="elevated">
        <DsCardSection>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface)]">
          <div className="flex-1 min-w-0">
            <label className="block text-sm font-medium text-[var(--ds-text-secondary)] mb-1">
              {t('settingsMenu.mediaPathsPanel.filmsPath')}
            </label>
            <code className="block text-sm text-[var(--ds-text-primary)] truncate bg-[var(--ds-surface-elevated)] px-2 py-1.5 rounded-[var(--ds-radius-sm)]">
              {data.films_path || 'media/films (défaut)'}
            </code>
            <p className="ds-text-tertiary text-xs mt-1 truncate">{data.films_root}</p>
          </div>
          <button
            type="button"
            onClick={() => openBrowse('films')}
            className="min-h-[40px] px-3 py-2 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] text-[var(--ds-text-primary)] hover:bg-white/10 shrink-0 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)]"
          >
            <FolderOpen className="w-4 h-4 mr-1 inline" />
            {t('settingsMenu.mediaPathsPanel.browse')}
          </button>
        </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] bg-[var(--ds-surface)]">
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium text-[var(--ds-text-secondary)] mb-1">
                  {t('settingsMenu.mediaPathsPanel.seriesPath')}
                </label>
                <code className="block text-sm text-[var(--ds-text-primary)] truncate bg-[var(--ds-surface-elevated)] px-2 py-1.5 rounded-[var(--ds-radius-sm)]">
                  {data.series_path || 'media/series (défaut)'}
                </code>
                <p className="ds-text-tertiary text-xs mt-1 truncate">{data.series_root}</p>
              </div>
              <button
                type="button"
                onClick={() => openBrowse('series')}
                className="min-h-[40px] px-3 py-2 rounded-[var(--ds-radius-sm)] border border-[var(--ds-border)] text-[var(--ds-text-primary)] hover:bg-white/10 shrink-0 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)]"
              >
                <FolderOpen className="w-4 h-4 mr-1 inline" />
                {t('settingsMenu.mediaPathsPanel.browse')}
              </button>
            </div>
          </div>
        </DsCardSection>
      </DsCard>

      <p className="ds-text-tertiary text-xs">
        Racine serveur : <code className="bg-[var(--ds-surface-elevated)] px-1 rounded-[var(--ds-radius-sm)] text-[var(--ds-text-primary)]">{data.download_dir_root}</code>
      </p>

      {/* Modal Parcourir */}
      {browseType !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t('settingsMenu.mediaPathsPanel.browseTitle')}
        >
          <div className="bg-[#1a1c20] border border-white/10 rounded-2xl shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-lg font-semibold text-white">
                {t('settingsMenu.mediaPathsPanel.browseTitle')} — {browseType === 'films' ? t('settingsMenu.mediaPathsPanel.filmsPath') : t('settingsMenu.mediaPathsPanel.seriesPath')}
              </h3>
              <button
                type="button"
                onClick={closeBrowse}
                className="text-gray-400 hover:text-white p-1 rounded"
                aria-label={t('common.close')}
              >
                ×
              </button>
            </div>
            <div className="px-2 py-1 text-sm text-gray-500 font-mono truncate border-b border-white/5">
              {browsePath || '/'}
            </div>
            <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
              {browseLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {browsePath && (
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          const parts = browsePath.replace(/\/$/, '').split('/').filter(Boolean);
                          parts.pop();
                          setBrowsePath(parts.join('/'));
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-gray-300 hover:bg-white/10"
                      >
                        <Folder className="w-5 h-5 text-amber-500" />
                        ..
                      </button>
                    </li>
                  )}
                  {entries
                    .filter((e) => e.is_directory)
                    .map((entry) => (
                      <li key={entry.path}>
                        <button
                          type="button"
                          onClick={() => handleEntryClick(entry)}
                          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-gray-300 hover:bg-white/10"
                        >
                          <Folder className="w-5 h-5 text-amber-500" />
                          {entry.name}
                        </button>
                      </li>
                    ))}
                  {entries.filter((e) => e.is_directory).length === 0 && !browsePath && (
                    <li className="px-3 py-4 text-gray-500 text-sm">{t('settingsMenu.mediaPathsPanel.noSubfolders')}</li>
                  )}
                </ul>
              )}
            </div>
            <div className="flex gap-2 px-4 py-3 border-t border-white/10">
              <button
                type="button"
                onClick={closeBrowse}
                className="btn btn-ghost btn-sm text-gray-400"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleChooseFolder}
                disabled={saving}
                className="btn btn-primary btn-sm ml-auto"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {t('settingsMenu.mediaPathsPanel.chooseFolder')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
