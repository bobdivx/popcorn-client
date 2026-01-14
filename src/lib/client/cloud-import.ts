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
      (savedConfig.downloadLocation ? 1 : 0);

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
                apiKey: indexer.apiKey || undefined,
                jackettIndexerName: indexer.jackettIndexerName || undefined,
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
          const res = await serverApi.saveTmdbKey(savedConfig.tmdbApiKey);
          if (!res.success) {
            throw new Error(res.message || res.error || 'Erreur import clé TMDB');
          }
          this.setStatus({ done: this.status.done + 1 });
        }

        // Download location (local only)
        if (savedConfig.downloadLocation) {
          this.setStatus({ message: 'Import emplacement de téléchargement…' });
          PreferencesManager.setDownloadLocation(savedConfig.downloadLocation);
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

