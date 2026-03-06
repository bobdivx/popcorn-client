import { runAllFromCloud } from '../sync/index.js';
import type { UserConfig } from '../api/popcorn-web.js';

export type CloudImportPhase = 'idle' | 'running' | 'success' | 'error';

export interface CloudImportStatus {
  phase: CloudImportPhase;
  total: number;
  done: number;
  message: string;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
  importedData?: UserConfig;
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
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private setStatus(patch: Partial<CloudImportStatus>) {
    this.status = { ...this.status, ...patch };
    for (const l of this.listeners) l(this.status);
  }

  async startImport(savedConfig: UserConfig): Promise<void> {
    if (this.currentPromise) return this.currentPromise;

    const total =
      (savedConfig.indexers?.length ?? 0) +
      (savedConfig.indexerCategories && Object.keys(savedConfig.indexerCategories).length > 0 ? 1 : 0) +
      (savedConfig.tmdbApiKey ? 1 : 0) +
      (savedConfig.downloadLocation ? 1 : 0) +
      (savedConfig.syncSettings ? 1 : 0) +
      (savedConfig.language ? 1 : 0);

    const parts: string[] = [];
    if (savedConfig.indexers?.length) parts.push(`${savedConfig.indexers.length} indexer(s)`);
    if (savedConfig.indexerCategories && Object.keys(savedConfig.indexerCategories).length > 0) parts.push('catégories');
    if (savedConfig.tmdbApiKey) parts.push('clé TMDB');
    if (savedConfig.downloadLocation) parts.push('emplacement de téléchargement');
    if (savedConfig.syncSettings) parts.push('paramètres de sync');
    if (savedConfig.language) parts.push('langue');
    const initialMessage =
      total > 0
        ? `Import depuis le cloud : ${parts.join(', ')}…`
        : 'Aucune configuration à importer';

    this.setStatus({
      phase: 'running',
      total,
      done: 0,
      message: initialMessage,
      error: undefined,
      startedAt: Date.now(),
      finishedAt: undefined,
    });

    const run = (async () => {
      try {
        const result = await runAllFromCloud({
          config: savedConfig,
          onProgress: (message) => this.setStatus({ message }),
          onDoneIncrement: (n) => this.setStatus({ done: this.status.done + n }),
        });

        if (!result.success) {
          throw new Error(result.error || 'Erreur lors de l\'import');
        }

        this.setStatus({
          phase: 'success',
          message: 'Configuration cloud importée ✅',
          finishedAt: Date.now(),
          importedData: savedConfig,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.setStatus({
          phase: 'error',
          error: msg,
          message: "Échec de l'import de la configuration cloud",
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
    if (this.currentPromise) return;
    this.status = makeInitial();
    for (const l of this.listeners) l(this.status);
  }
}

export const CloudImportManager = new CloudImportManagerImpl();
