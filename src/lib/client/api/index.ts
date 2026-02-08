import { getBaseUrl } from './utils.js';
import { HealthService } from './health.js';
import { TorrentsService } from './torrents.js';
import type { ClientTorrentStats, AddTorrentResponse } from '../types.js';
import { isDemoMode } from '../../backend-config.js';
import { getDemoClientApi } from './demo-client.js';

/**
 * Classe principale pour interagir avec l'API client torrent
 */
export class ClientApi {
  private baseUrl: string | null = null;
  private _health: HealthService;
  private _torrents: TorrentsService;

  constructor(baseUrl?: string) {
    if (baseUrl) {
      this.baseUrl = baseUrl;
    }
    this._health = new HealthService(this);
    this._torrents = new TorrentsService(this);
  }

  /**
   * Obtenir l'URL de base pour les requêtes
   * Utilise des requêtes relatives côté client (navigateur) pour passer par le proxy Astro
   */
  async getRequestUrl(path: string): Promise<string> {
    // Dans le navigateur (y compris site statique), on parle directement au backend Rust configuré.
    // Ça évite les 404 "bruyants" sur /api/client/* quand l'UI est servie sans proxy (Astro SSR absent).
    if (typeof window !== 'undefined') {
      const { getBackendUrl } = await import('../../backend-config.js');
      const backend = (getBackendUrl?.() || '').trim().replace(/\/$/, '');
      const envFallback = (import.meta.env.PUBLIC_BACKEND_URL || import.meta.env.BACKEND_URL || '')
        .trim()
        .replace(/\/$/, '');
      // 3000 = port backend par défaut. (4326 est le port Astro dev, pas le backend Rust.)
      const base = backend || envFallback || 'http://127.0.0.1:3000';
      return `${base}/api/client/${path}`;
    }

    // Sinon (SSR), utiliser l'URL absolue du backend Rust
    const baseUrl = this.baseUrl || await getBaseUrl();
    return `${baseUrl}/api/client/${path}`;
  }

  // Exposer les services comme propriétés
  get health() {
    return this._health;
  }

  get torrents() {
    return this._torrents;
  }

  // Méthodes de compatibilité pour l'API existante

  /**
   * Vérifier la santé du serveur
   */
  async healthCheck(): Promise<boolean> {
    return this._health.healthCheck();
  }

  /**
   * Récupérer la liste de tous les torrents
   */
  async listTorrents(): Promise<ClientTorrentStats[]> {
    return this._torrents.listTorrents();
  }

  /**
   * Récupérer les statistiques d'un torrent spécifique
   */
  async getTorrent(infoHash: string): Promise<ClientTorrentStats | null> {
    return this._torrents.getTorrent(infoHash);
  }

  /**
   * Récupérer l'état de vérification d'un torrent (disponibilité, peers, téléchargement actif, fichiers sur disque)
   */
  async getTorrentVerification(infoHash: string) {
    return this._torrents.getTorrentVerification(infoHash);
  }

  /**
   * Stats détaillées v1 (débit, ETA, peers) pour un torrent.
   */
  async getTorrentStatsV1(infoHash: string): Promise<Record<string, unknown> | null> {
    return this._torrents.getTorrentStatsV1(infoHash);
  }

  /**
   * Stats session globales librqbit (débit, uploaded/fetched, uptime, peers).
   */
  async getLibrqbitSessionStats(): Promise<Record<string, unknown> | null> {
    return this._torrents.getLibrqbitSessionStats();
  }

  /**
   * URL du flux SSE des logs session (pour EventSource / fetch).
   */
  async getLibrqbitStreamLogsUrl(): Promise<string> {
    return this._torrents.getLibrqbitStreamLogsUrl();
  }

  async postLibrqbitLimits(uploadBps?: number, downloadBps?: number): Promise<void> {
    return this._torrents.postLibrqbitLimits(uploadBps, downloadBps);
  }

  async getLibrqbitDhtStats(): Promise<Record<string, unknown> | null> {
    return this._torrents.getLibrqbitDhtStats();
  }

  async getLibrqbitDhtTable(): Promise<Record<string, unknown> | null> {
    return this._torrents.getLibrqbitDhtTable();
  }

  async postLibrqbitRustLog(value: string): Promise<void> {
    return this._torrents.postLibrqbitRustLog(value);
  }

  /**
   * Ajouter un torrent depuis un fichier .torrent
   */
  async addTorrentFile(
    file: File, 
    forStreaming: boolean = false,
    downloadType?: string,
    customDownloadPath?: string
  ): Promise<AddTorrentResponse> {
    return this._torrents.addTorrentFile(file, forStreaming, downloadType, customDownloadPath);
  }

  /**
   * Ajouter un torrent depuis un lien magnet
   */
  async addMagnetLink(
    magnetUri: string, 
    name: string, 
    forStreaming: boolean = false,
    downloadType?: string,
    customDownloadPath?: string
  ): Promise<AddTorrentResponse> {
    return this._torrents.addMagnetLink(magnetUri, name, forStreaming, downloadType, customDownloadPath);
  }

  /**
   * Supprimer un torrent
   */
  async removeTorrent(infoHash: string, deleteFiles: boolean = false): Promise<void> {
    return this._torrents.removeTorrent(infoHash, deleteFiles);
  }

  /**
   * Mettre en pause un torrent
   */
  async pauseTorrent(infoHash: string): Promise<void> {
    return this._torrents.pauseTorrent(infoHash);
  }

  /**
   * Reprendre un torrent
   */
  async resumeTorrent(infoHash: string): Promise<void> {
    return this._torrents.resumeTorrent(infoHash);
  }

  /**
   * Récupérer les logs d'un torrent
   * @param filtered - Si true, filtre et résume les logs répétitifs (par défaut: true pour le debug)
   */
  async getTorrentLogs(infoHash: string, filtered: boolean = true): Promise<import('./torrents.js').TorrentLogEntry[]> {
    return this._torrents.getTorrentLogs(infoHash, filtered);
  }

  /**
   * Récupérer le chemin de téléchargement d'un torrent
   */
  async getTorrentDownloadPath(infoHash: string): Promise<string> {
    return this._torrents.getTorrentDownloadPath(infoHash);
  }

  /**
   * Récupérer les fichiers d'un torrent par son info_hash
   */
  async getTorrentFiles(infoHash: string): Promise<Array<{path: string, size: number, mime_type: string, is_video: boolean}>> {
    return this._torrents.getTorrentFiles(infoHash);
  }

  /**
   * Télécharger le fichier .torrent d'un torrent actif
   */
  async downloadTorrentFile(infoHash: string, name: string): Promise<void> {
    return this._torrents.downloadTorrentFile(infoHash, name);
  }

  /**
   * Forcer une mise à jour du tracker pour un torrent
   */
  async forceTrackerUpdate(infoHash: string): Promise<void> {
    return this._torrents.forceTrackerUpdate(infoHash);
  }
}

// Instance réelle
const realClientApi = new ClientApi();

/**
 * En mode démo, les appels au client torrent sont délégués à un client simulé
 * (liste vide, pas de téléchargement réel).
 */
export const clientApi = new Proxy(realClientApi, {
  get(target, prop, receiver) {
    if (typeof window !== 'undefined' && isDemoMode()) {
      const demo = getDemoClientApi();
      const val = (demo as Record<string | symbol, unknown>)[prop];
      if (val !== undefined) {
        if (typeof val === 'function') {
          return (val as (...args: unknown[]) => unknown).bind(demo);
        }
        return val;
      }
    }
    return Reflect.get(target, prop, receiver);
  },
}) as ClientApi;
