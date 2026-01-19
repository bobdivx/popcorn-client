import { serverApi } from './server-api.js';
import { PreferencesManager } from './storage.js';
import type { UserConfig } from '../api/popcorn-web.js';

export type CloudImportPhase = 'idle' | 'running' | 'success' | 'error';

export interface CloudImportStatus {
  phase: CloudImportPhase;
  // progress
  total: number;
  done: number;
  message: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

type Listener = (s: CloudImportStatus) => void;

function makeInitial(): CloudImportStatus {
  return { phase: 'idle', total: 0, done: 0, message: '' };
}

class CloudImportManagerImpl {
  private status: CloudImportStatus = makeInitial();
  private listeners = new Set<Listener>();
  private currentPromise: Promise<void> | null = null;

  getStatus(): CloudImportStatus {
    return this.status;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    // push initial snapshot
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private setStatus(patch: Partial<CloudImportStatus>) {
    this.status = { ...this.status, ...patch };
    for (const l of this.listeners) l(this.status);
  }

  async startImport(savedConfig: UserConfig): Promise<void> {
    // Dédup: si un import est déjà en cours, renvoyer le même Promise
    if (this.currentPromise) return this.currentPromise;

    const total =
      (savedConfig.indexers?.length ?? 0) +
      (savedConfig.tmdbApiKey ? 1 : 0) +
      (savedConfig.downloadLocation ? 1 : 0) +
      (savedConfig.syncSettings ? 1 : 0);

    this.setStatus({
      phase: 'running',
      total,
      done: 0,
      message: total > 0 ? 'Import de la configuration cloud…' : 'Aucune configuration à importer',
      error: undefined,
      startedAt: Date.now(),
      finishedAt: undefined,
    });

    const run = (async () => {
      try {
        // Santé backend: si KO, on stoppe (sinon on va faire des timeouts inutiles)
        const health = await serverApi.checkServerHealth();
        if (!health.success) {
          throw new Error(health.message || health.error || 'Backend non accessible');
        }

        // Indexers: éviter les doublons
        let existing: any[] = [];
        try {
          const listRes = await serverApi.getIndexers();
          if (listRes.success && Array.isArray(listRes.data)) existing = listRes.data as any[];
        } catch {
          // ignore
        }

        if (savedConfig.indexers && savedConfig.indexers.length > 0) {
          for (const indexer of savedConfig.indexers) {
            this.setStatus({ message: `Import indexer: ${indexer.name}…` });

            const alreadyExists = existing.some((e: any) =>
              (e?.name || '').toLowerCase() === (indexer.name || '').toLowerCase() &&
              (e?.baseUrl || '') === (indexer.baseUrl || '')
            );
            if (!alreadyExists) {
              const res = await serverApi.createIndexer({
                name: indexer.name,
                baseUrl: indexer.baseUrl,
                apiKey: indexer.apiKey ?? '',
                jackettIndexerName: indexer.jackettIndexerName ?? '',
                isEnabled: indexer.isEnabled !== false,
                isDefault: indexer.isDefault || false,
                priority: indexer.priority || 0,
                indexerTypeId: indexer.indexerTypeId || undefined,
                configJson: indexer.configJson || undefined,
              });
              if (!res.success) {
                throw new Error(res.message || res.error || `Erreur import indexer: ${indexer.name}`);
              }
            }

            this.setStatus({ done: this.status.done + 1 });
          }
        }

        // TMDB
        if (savedConfig.tmdbApiKey) {
          this.setStatus({ message: 'Import clé TMDB…' });
          try {
            const res = await serverApi.saveTmdbKey(savedConfig.tmdbApiKey);
            // Sur certaines plateformes (ex: Android) la clé TMDB peut être liée à un user_id backend
            // et donc impossible à restaurer automatiquement. Dans ce cas, on n'échoue pas l'import complet.
            if (!res.success) {
              console.warn('[CLOUD IMPORT] ⚠️ Import TMDB ignoré:', res.message || res.error);
            }
          } catch (e) {
            console.warn('[CLOUD IMPORT] ⚠️ Import TMDB ignoré (exception):', e);
          }
          this.setStatus({ done: this.status.done + 1 });
        }

        // Download location (local only)
        if (savedConfig.downloadLocation) {
          this.setStatus({ message: 'Import emplacement de téléchargement…' });
          PreferencesManager.setDownloadLocation(savedConfig.downloadLocation);
          this.setStatus({ done: this.status.done + 1 });
        }

        // Sync settings (backend Rust)
        if (savedConfig.syncSettings) {
          this.setStatus({ message: 'Import paramètres de synchronisation…' });
          const s = savedConfig.syncSettings;

          const payload: any = {};
          if (typeof s.syncEnabled === 'boolean') payload.is_enabled = s.syncEnabled ? 1 : 0;
          if (typeof s.syncFrequencyMinutes === 'number') payload.sync_frequency_minutes = s.syncFrequencyMinutes;
          if (typeof s.maxTorrentsPerCategory === 'number') payload.max_torrents_per_category = s.maxTorrentsPerCategory;
          if (typeof s.rssIncrementalEnabled === 'boolean') payload.rss_incremental_enabled = s.rssIncrementalEnabled ? 1 : 0;
          if (Array.isArray(s.syncQueriesFilms)) payload.sync_queries_films = s.syncQueriesFilms;
          if (Array.isArray(s.syncQueriesSeries)) payload.sync_queries_series = s.syncQueriesSeries;

          // Ne pas échouer si rien à appliquer
          if (Object.keys(payload).length > 0) {
            const res = await serverApi.updateSyncSettings(payload);
            if (!res.success) {
              throw new Error(res.message || res.error || 'Erreur import paramètres de synchronisation');
            }
          }

          this.setStatus({ done: this.status.done + 1 });
        }

        this.setStatus({
          phase: 'success',
          message: 'Configuration cloud importée ✅',
          finishedAt: Date.now(),
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.setStatus({
          phase: 'error',
          error: msg,
          message: 'Échec de l’import de la configuration cloud',
          finishedAt: Date.now(),
        });
      } finally {
        this.currentPromise = null;
      }
    })();

    this.currentPromise = run;
    return run;
  }

  reset() {
    // Ne reset pas si import en cours
    if (this.currentPromise) return;
    this.status = makeInitial();
    for (const l of this.listeners) l(this.status);
  }
}

export const CloudImportManager = new CloudImportManagerImpl();

