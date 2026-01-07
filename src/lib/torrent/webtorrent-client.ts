/**
 * Client WebTorrent pour gérer les torrents côté frontend
 * Remplace le backend Rust pour le téléchargement de torrents
 */

// Charger les polyfills avant webtorrent
import './polyfills';

// Charger WebTorrent dynamiquement pour s'assurer que les polyfills sont prêts
let WebTorrentModule: any = null;
let WebTorrentLoading: Promise<any> | null = null;

async function loadWebTorrent() {
  if (WebTorrentModule) {
    return WebTorrentModule;
  }
  
  if (WebTorrentLoading) {
    return WebTorrentLoading;
  }
  
  WebTorrentLoading = (async () => {
    try {
      // @ts-ignore - WebTorrent n'a pas de types complets
      const WebTorrent = (await import('webtorrent')).default;
      WebTorrentModule = WebTorrent;
      return WebTorrent;
    } catch (error) {
      WebTorrentLoading = null;
      throw error;
    }
  })();
  
  return WebTorrentLoading;
}

// Types pour compatibilité
interface Torrent {
  infoHash: string;
  name: string;
  length: number;
  downloaded: number;
  uploaded: number;
  progress: number;
  downloadSpeed: number;
  uploadSpeed: number;
  numPeers: number;
  done: boolean;
  paused: boolean;
  ready: boolean;
  files: TorrentFile[];
  pause: () => void;
  resume: () => void;
  destroy: (opts?: { destroyStore?: boolean }) => void;
}

interface TorrentFile {
  name: string;
  path: string;
  length: number;
  getBlobURL: (callback: (err: Error | null, url?: string) => void) => void;
  createReadStream: (opts?: any) => ReadableStream;
}

// Types pour compatibilité avec le code existant
export interface ClientTorrentStats {
  info_hash: string;
  name: string;
  state: 'queued' | 'downloading' | 'seeding' | 'paused' | 'completed' | 'error';
  downloaded_bytes: number;
  uploaded_bytes: number;
  total_bytes: number;
  progress: number;
  download_speed: number; // bytes/s
  upload_speed: number; // bytes/s
  peers_connected: number;
  peers_total: number;
  seeders: number;
  leechers: number;
  eta_seconds: number | null;
  download_dir?: string;
  files_size?: number;
  status_reason?: string;
}

export interface AddTorrentResponse {
  info_hash: string;
}

export interface WebTorrentFile extends TorrentFile {
  is_video?: boolean;
  mime_type?: string;
}

class WebTorrentClient {
  private client: any = null;
  private torrents: Map<string, Torrent> = new Map();

  private async ensureClient() {
    if (this.client) {
      return this.client;
    }
    
    const WebTorrent = await loadWebTorrent();
    // Initialiser le client WebTorrent
    this.client = new WebTorrent({
      // Configuration WebTorrent
      maxConns: 55,
      nodeId: undefined, // Généré automatiquement
      peerId: undefined, // Généré automatiquement
      tracker: true,
      dht: true,
      webSeeds: true,
    });
    return this.client;
  }

  /**
   * Ajouter un torrent via magnet link
   */
  async addMagnetLink(
    magnetUri: string,
    name: string,
    forStreaming: boolean = false
  ): Promise<AddTorrentResponse> {
    const client = await this.ensureClient();
    return new Promise((resolve, reject) => {
      try {
        const torrent = client.add(magnetUri);
        
        torrent.on('ready', () => {
          if (torrent.infoHash) {
            this.torrents.set(torrent.infoHash, torrent);
            resolve({
              info_hash: torrent.infoHash,
            });
          } else {
            reject(new Error('Aucun infoHash retourné après ajout du magnet link'));
          }
        });

        // Gérer les erreurs
        torrent.on('error', (err: Error) => {
          reject(err);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Ajouter un torrent via fichier .torrent
   */
  async addTorrentFile(
    file: File | Buffer,
    forStreaming: boolean = false
  ): Promise<AddTorrentResponse> {
    const client = await this.ensureClient();
    return new Promise((resolve, reject) => {
      try {
        // Convertir File en Buffer si nécessaire
        const bufferPromise = file instanceof File
          ? file.arrayBuffer().then(buf => Buffer.from(buf))
          : Promise.resolve(file as Buffer);

        bufferPromise.then((buffer) => {
          const torrent = client.add(buffer);
          
          torrent.on('ready', () => {
            if (torrent.infoHash) {
              this.torrents.set(torrent.infoHash, torrent);
              resolve({
                info_hash: torrent.infoHash,
              });
            } else {
              reject(new Error('Aucun infoHash retourné après ajout du fichier torrent'));
            }
          });

          // Gérer les erreurs
          torrent.on('error', (err: Error) => {
            reject(err);
          });
        }).catch(reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Récupérer les stats d'un torrent
   */
  async getTorrent(infoHash: string): Promise<ClientTorrentStats | null> {
    const torrent = this.torrents.get(infoHash);
    if (!torrent) {
      return null;
    }

    // Déterminer l'état
    let state: ClientTorrentStats['state'] = 'queued';
    if (torrent.done) {
      state = 'completed';
    } else if (torrent.paused) {
      state = 'paused';
    } else if (torrent.ready) {
      state = torrent.progress === 1 ? 'seeding' : 'downloading';
    }

    // Calculer l'ETA
    const downloadSpeed = torrent.downloadSpeed || 0;
    const remaining = torrent.length - torrent.downloaded;
    const eta = downloadSpeed > 0 ? Math.ceil(remaining / downloadSpeed) : null;

    return {
      info_hash: torrent.infoHash,
      name: torrent.name,
      state,
      downloaded_bytes: torrent.downloaded,
      uploaded_bytes: torrent.uploaded,
      total_bytes: torrent.length,
      progress: torrent.progress,
      download_speed: downloadSpeed,
      upload_speed: torrent.uploadSpeed || 0,
      peers_connected: torrent.numPeers,
      peers_total: torrent.numPeers,
      seeders: torrent.numPeers,
      leechers: torrent.numPeers - torrent.numPeers, // Approximation
      eta_seconds: eta,
    };
  }

  /**
   * Mettre en pause un torrent
   */
  async pauseTorrent(infoHash: string): Promise<void> {
    const torrent = this.torrents.get(infoHash);
    if (torrent) {
      torrent.pause();
    } else {
      throw new Error(`Torrent ${infoHash} non trouvé`);
    }
  }

  /**
   * Reprendre un torrent
   */
  async resumeTorrent(infoHash: string): Promise<void> {
    const torrent = this.torrents.get(infoHash);
    if (torrent) {
      torrent.resume();
    } else {
      throw new Error(`Torrent ${infoHash} non trouvé`);
    }
  }

  /**
   * Supprimer un torrent
   */
  async removeTorrent(infoHash: string, deleteFiles: boolean = false): Promise<void> {
    const client = await this.ensureClient();
    const torrent = this.torrents.get(infoHash);
    if (torrent) {
      client.remove(torrent, { destroyStore: deleteFiles }, () => {
        this.torrents.delete(infoHash);
      });
    } else {
      throw new Error(`Torrent ${infoHash} non trouvé`);
    }
  }

  /**
   * Récupérer la liste de tous les torrents
   */
  async listTorrents(): Promise<ClientTorrentStats[]> {
    const stats: ClientTorrentStats[] = [];
    for (const [infoHash, torrent] of this.torrents.entries()) {
      const stat = await this.getTorrent(infoHash);
      if (stat) {
        stats.push(stat);
      }
    }
    return stats;
  }

  /**
   * Récupérer les fichiers d'un torrent
   */
  getTorrentFiles(infoHash: string): WebTorrentFile[] {
    const torrent = this.torrents.get(infoHash);
    if (!torrent || !torrent.ready) {
      return [];
    }

    return torrent.files.map((file) => {
      // Déterminer le type MIME
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isVideo = /^(mp4|mkv|avi|mov|wmv|flv|webm|m4v|3gp|ogv)$/i.test(ext);
      let mimeType = 'application/octet-stream';
      if (isVideo) {
        if (ext === 'mp4' || ext === 'm4v') {
          mimeType = 'video/mp4';
        } else if (ext === 'webm') {
          mimeType = 'video/webm';
        } else if (ext === 'ogv') {
          mimeType = 'video/ogg';
        } else {
          mimeType = `video/${ext}`;
        }
      }

      return {
        ...file,
        is_video: isVideo,
        mime_type: mimeType,
      };
    });
  }

  /**
   * Créer une Blob URL pour un fichier du torrent
   */
  async createBlobUrl(infoHash: string, fileIndex: number): Promise<string | null> {
    const torrent = this.torrents.get(infoHash);
    if (!torrent || !torrent.ready) {
      return null;
    }

    const file = torrent.files[fileIndex];
    if (!file) {
      return null;
    }

    return new Promise((resolve, reject) => {
      file.getBlobURL((err: Error | null, url?: string) => {
        if (err) {
          reject(err);
        } else {
          resolve(url || null);
        }
      });
    });
  }

  /**
   * Créer un stream pour un fichier du torrent
   */
  getFileStream(infoHash: string, fileIndex: number): ReadableStream | null {
    const torrent = this.torrents.get(infoHash);
    if (!torrent || !torrent.ready) {
      return null;
    }

    const file = torrent.files[fileIndex];
    if (!file) {
      return null;
    }

    // WebTorrent fournit un stream via file.createReadStream()
    // Mais pour le navigateur, on utilise plutôt getBlobURL
    return null;
  }

  /**
   * Obtenir le torrent natif WebTorrent
   */
  getNativeTorrent(infoHash: string): Torrent | null {
    return this.torrents.get(infoHash) || null;
  }

  /**
   * Vérifier la santé du client
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.ensureClient();
      return this.client !== null;
    } catch {
      return false;
    }
  }
}

// Instance singleton
export const webtorrentClient = new WebTorrentClient();

// Compatibilité avec l'API existante
export const clientApi = {
  addMagnetLink: (magnetUri: string, name: string, forStreaming: boolean = false) =>
    webtorrentClient.addMagnetLink(magnetUri, name, forStreaming),
  addTorrentFile: (file: File | Buffer, forStreaming: boolean = false) =>
    webtorrentClient.addTorrentFile(file, forStreaming),
  getTorrent: (infoHash: string) => webtorrentClient.getTorrent(infoHash),
  pauseTorrent: (infoHash: string) => webtorrentClient.pauseTorrent(infoHash),
  resumeTorrent: (infoHash: string) => webtorrentClient.resumeTorrent(infoHash),
  removeTorrent: (infoHash: string, deleteFiles: boolean = false) =>
    webtorrentClient.removeTorrent(infoHash, deleteFiles),
  listTorrents: () => webtorrentClient.listTorrents(),
  getTorrentFiles: (infoHash: string) => webtorrentClient.getTorrentFiles(infoHash),
  createBlobUrl: (infoHash: string, fileIndex: number) =>
    webtorrentClient.createBlobUrl(infoHash, fileIndex),
  healthCheck: () => webtorrentClient.healthCheck(),
};
