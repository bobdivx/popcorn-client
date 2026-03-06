import { canAccess } from '../../lib/permissions';
import TmdbConfig from './TmdbConfig';
import IndexersManager from './IndexersManager';
import TorrentSyncManager from './TorrentSyncManager';
import LibRbitSettings from './LibRbitSettings';
import { getBackendUrl } from '../../lib/backend-config';
import { serverApi } from '../../lib/client/server-api';
import { useI18n } from '../../lib/i18n/useI18n';
import { ExternalLink, Search, RefreshCw, HardDrive } from 'lucide-preact';
import { useState, useEffect } from 'preact/hooks';

export default function ContentPanel() {
  const { t } = useI18n();
  const [librqbitWebUrl, setLibrqbitWebUrl] = useState('');
  const hasIndexers = canAccess('settings.indexers' as any);
  const hasSync = canAccess('settings.sync' as any);
  const hasServer = canAccess('settings.server' as any);

  useEffect(() => {
    const base = (getBackendUrl() || serverApi.getServerUrl() || '').trim().replace(/\/$/, '');
    if (base) setLibrqbitWebUrl(`${base}/librqbit/web/`);
  }, []);

  return (
    <div className="flex-1 py-4 px-4 sm:px-6 space-y-6 overflow-y-auto scrollbar-visible">
      {/* TMDB + Indexers */}
      {hasIndexers && (
        <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="p-4 sm:p-6 space-y-6">
            <TmdbConfig />
            <div>
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
                  <Search className="w-5 h-5 text-primary-400" />
                  {t('settingsMenu.indexers.title')}
                </h3>
              </div>
              <IndexersManager />
            </div>
          </div>
        </section>
      )}

      {/* Synchronisation Torrents */}
      {hasSync && (
        <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="p-4 sm:p-6">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
              <RefreshCw className="w-5 h-5 text-primary-400" />
              {t('settingsMenu.sync.title')}
            </h3>
            <TorrentSyncManager />
          </div>
        </section>
      )}

      {/* Client torrent + Interface Web librqbit */}
      {hasServer && (
        <section className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
          <div className="p-4 sm:p-6">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white mb-4">
              <HardDrive className="w-5 h-5 text-primary-400" />
              {t('settingsMenu.librqbit.title')}
            </h3>
            <LibRbitSettings />
            {librqbitWebUrl && (
              <div className="mt-4 pt-4 border-t border-white/10">
                <a
                  href={librqbitWebUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 hover:border-primary-500/50 transition-all text-white font-medium"
                >
                  <ExternalLink className="w-4 h-4" />
                  {t('settingsMenu.librqbitWeb.title')}
                </a>
                <p className="text-sm text-gray-400 mt-2">{t('settingsMenu.librqbitWeb.description')}</p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
