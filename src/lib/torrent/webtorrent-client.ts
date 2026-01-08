/**
 * Client WebTorrent pour gérer les torrents côté frontend
 * Remplace le backend Rust pour le téléchargement de torrents
 */

// Charger les polyfills avant webtorrent
import './polyfills';

// Importer les polyfills avant tout
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
      // S'assurer que les polyfills sont chargés avant d'importer webtorrent
      // Ordre important : events -> util -> stream -> buffer
      console.log('[WebTorrent] Chargement des polyfills...');
      
      try {
        await import('events');
        console.log('[WebTorrent] ✅ events chargé');
      } catch (e) {
        console.warn('[WebTorrent] ⚠️ Erreur lors du chargement de events:', e);
      }
      
      try {
        const utilModule = await import('util');
        let util = utilModule.default || utilModule;
        
        // S'assurer que util est disponible globalement
        if (typeof window !== 'undefined') {
          (globalThis as any).util = util;
          (window as any).util = util;
        }
        
        // Vérifier que toutes les méthodes nécessaires sont présentes
        if (!util || !util.inherits || !util.inspect || !util.promisify) {
          console.warn('[WebTorrent] ⚠️ Méthodes util manquantes, vérification du polyfill...');
          // Le polyfill devrait déjà être créé dans polyfills.ts
          const globalUtil = (globalThis as any).util || (window as any).util;
          if (globalUtil && (globalUtil.inherits || globalUtil.promisify)) {
            // Utiliser le polyfill global s'il est disponible
            util = globalUtil;
            (globalThis as any).util = util;
            (window as any).util = util;
          }
        }
        
        // S'assurer que util.promisify existe (utilisé par end-of-stream)
        if (!util.promisify) {
          console.warn('[WebTorrent] ⚠️ util.promisify manquant, création...');
          util.promisify = function(fn: Function) {
            if (typeof fn !== 'function') {
              throw new TypeError('The "original" argument must be of type Function');
            }
            return function promisified(this: any, ...args: any[]) {
              return new Promise((resolve, reject) => {
                try {
                  fn.call(this, ...args, (err: Error | null, ...results: any[]) => {
                    if (err) {
                      reject(err);
                    } else if (results.length === 1) {
                      resolve(results[0]);
                    } else {
                      resolve(results);
                    }
                  });
                } catch (err) {
                  reject(err);
                }
              });
            };
          };
        }
        
        console.log('[WebTorrent] ✅ util chargé', {
          hasInherits: !!util.inherits,
          hasInspect: !!util.inspect,
          hasPromisify: !!util.promisify,
        });
      } catch (e) {
        console.warn('[WebTorrent] ⚠️ Erreur lors du chargement de util:', e);
      }
      
      // Importer stream explicitement car end-of-stream en dépend
      try {
        await import('stream');
        console.log('[WebTorrent] ✅ stream chargé');
      } catch (e) {
        console.warn('[WebTorrent] ⚠️ Erreur lors du chargement de stream:', e);
      }
      
      try {
        await import('buffer');
        if (typeof (globalThis as any).Buffer === 'undefined' && typeof window !== 'undefined') {
          const buffer = await import('buffer');
          (globalThis as any).Buffer = buffer.Buffer;
          (window as any).Buffer = buffer.Buffer;
        }
        console.log('[WebTorrent] ✅ buffer chargé');
      } catch (e) {
        console.warn('[WebTorrent] ⚠️ Erreur lors du chargement de buffer:', e);
      }
      
      // Attendre un peu pour s'assurer que les polyfills sont prêts
      await new Promise(resolve => setTimeout(resolve, 300));
      
      console.log('[WebTorrent] Chargement de webtorrent...');
      // @ts-ignore - WebTorrent n'a pas de types complets
      const webtorrentModule = await import('webtorrent');
      const WebTorrent = webtorrentModule.default || webtorrentModule;
      
      // Attendre encore un peu pour que WebTorrent s'initialise complètement
      await new Promise(resolve => setTimeout(resolve, 200));
      
      WebTorrentModule = WebTorrent;
      console.log('[WebTorrent] ✅ WebTorrent chargé avec succès');
      return WebTorrent;
    } catch (error) {
      WebTorrentLoading = null;
      console.error('[WebTorrent] Erreur lors du chargement:', error);
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
    // En mode navigateur, désactiver complètement le DHT
    const config: any = {
      // Configuration WebTorrent
      maxConns: 55,
      nodeId: undefined, // Généré automatiquement
      peerId: undefined, // Généré automatiquement
      tracker: true, // Activer les trackers (WebSocket en mode navigateur)
      webSeeds: true,
      // Configuration pour les trackers WebSocket
      rtcConfig: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
        ],
      },
    };
    
    // Désactiver le DHT dans le navigateur (non disponible)
    if (typeof window !== 'undefined') {
      config.dht = false;
      console.log('[WebTorrent] Mode navigateur: DHT désactivé, utilisation des trackers WebSocket uniquement');
    }
    
    this.client = new WebTorrent(config);
    
    // S'assurer que le DHT n'est pas utilisé même si WebTorrent essaie de l'initialiser
    if (typeof window !== 'undefined' && this.client.dht) {
      // Remplacer le DHT par un stub si WebTorrent a créé une instance
      const DHTStub = (await import('../torrent/stubs/bittorrent-dht')).default;
      if (DHTStub && DHTStub.Client) {
        // Créer une instance du stub DHT
        const stubDHT = new DHTStub.Client();
        // Remplacer le DHT par le stub
        this.client.dht = stubDHT;
        console.log('[WebTorrent] ✅ DHT remplacé par le stub');
      } else if (this.client.dht && typeof this.client.dht.setMaxListeners !== 'function') {
        // Si le DHT existe mais n'a pas setMaxListeners, l'ajouter
        this.client.dht.setMaxListeners = function(n: number) { return this; };
        console.log('[WebTorrent] ⚠️ setMaxListeners ajouté au DHT');
      }
    }
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
        console.log('[WebTorrent] Ajout du magnet link:', magnetUri);
        
        // Extraire l'infoHash du magnet link pour vérifier s'il existe déjà
        const infoHashMatch = magnetUri.match(/btih:([a-f0-9]{40})/i);
        const expectedInfoHash = infoHashMatch ? infoHashMatch[1].toLowerCase() : null;
        
        // Vérifier si le torrent existe déjà
        if (expectedInfoHash) {
          // client.get() peut retourner le torrent directement ou null/undefined
          // Vérifier aussi dans client.torrents si c'est un tableau
          let existingTorrent: any = null;
          
          try {
            const getResult = client.get(expectedInfoHash);
            // Si c'est une Promise, l'ignorer et utiliser client.torrents à la place
            if (getResult && typeof getResult.then !== 'function' && getResult.infoHash === expectedInfoHash) {
              existingTorrent = getResult;
            } else if (client.torrents && Array.isArray(client.torrents)) {
              // Chercher dans client.torrents si c'est un tableau
              existingTorrent = client.torrents.find((t: any) => t.infoHash === expectedInfoHash);
            }
          } catch (e) {
            // Si client.get() échoue, essayer client.torrents
            if (client.torrents && Array.isArray(client.torrents)) {
              existingTorrent = client.torrents.find((t: any) => t.infoHash === expectedInfoHash);
            }
          }
          
          if (existingTorrent && existingTorrent.infoHash === expectedInfoHash) {
            console.log('[WebTorrent] Torrent déjà présent dans le client:', expectedInfoHash);
            
            // Vérifier si le torrent est bloqué ou en erreur
            const isDestroyed = existingTorrent.destroyed || false;
            const isPaused = existingTorrent.paused || false;
            const hasNoProgress = existingTorrent.done === false && existingTorrent.progress === 0;
            const hasNoPeers = existingTorrent.numPeers === 0;
            const isBlocked = isDestroyed || isPaused || (hasNoProgress && hasNoPeers);
            
            // Vérifier si le torrent a des métadonnées (sinon il est peut-être bloqué)
            const hasMetadata = existingTorrent.infoHash && existingTorrent.files && existingTorrent.files.length > 0;
            
            // Vérifier si le torrent a fait des progrès récemment (pas bloqué)
            const hasRecentProgress = existingTorrent.progress > 0 || hasMetadata;
            
            if (isBlocked || (!hasMetadata && !hasRecentProgress)) {
              console.log('[WebTorrent] Torrent bloqué ou incomplet, suppression avant réajout', {
                isDestroyed,
                isPaused,
                hasNoProgress,
                hasNoPeers,
                hasMetadata,
                hasRecentProgress,
                progress: existingTorrent.progress,
                numPeers: existingTorrent.numPeers,
                filesCount: existingTorrent.files?.length || 0,
              });
              
              // Supprimer le torrent bloqué avant d'en ajouter un nouveau
              try {
                // Vérifier que le torrent existe toujours dans le client
                // client.get() peut retourner le torrent directement ou null/undefined
                let torrentToRemove: any = null;
                
                // Essayer de récupérer le torrent depuis client.torrents (si accessible)
                // ou utiliser client.get() mais vérifier que ce n'est pas une Promise
                if (client.torrents && Array.isArray(client.torrents)) {
                  torrentToRemove = client.torrents.find((t: any) => t.infoHash === expectedInfoHash);
                } else {
                  const getResult = client.get(expectedInfoHash);
                  // Si c'est une Promise, l'ignorer et continuer
                  if (getResult && typeof getResult.then !== 'function') {
                    torrentToRemove = getResult;
                  }
                }
                
                if (torrentToRemove && torrentToRemove.infoHash === expectedInfoHash) {
                  console.log('[WebTorrent] Suppression du torrent bloqué:', expectedInfoHash);
                  
                  // Utiliser client.remove() avec callback pour éviter les problèmes
                  try {
                    client.remove(torrentToRemove, { destroyStore: false }, (err?: Error) => {
                      if (err) {
                        console.warn('[WebTorrent] ⚠️ Erreur dans le callback de remove():', err);
                      } else {
                        console.log('[WebTorrent] ✅ Torrent supprimé avec succès via callback');
                      }
                    });
                    console.log('[WebTorrent] ✅ Demande de suppression envoyée');
                  } catch (removeError) {
                    console.warn('[WebTorrent] ⚠️ Erreur lors de client.remove():', removeError);
                  }
                  
                  // Supprimer de notre map immédiatement
                  this.torrents.delete(expectedInfoHash);
                  console.log('[WebTorrent] ✅ Ancien torrent marqué pour suppression, ajout d\'un nouveau...');
                } else {
                  // Le torrent n'existe plus dans le client, juste nettoyer notre map
                  console.log('[WebTorrent] Torrent n\'existe plus dans le client, nettoyage de la map');
                  this.torrents.delete(expectedInfoHash);
                }
              } catch (removeError) {
                console.warn('[WebTorrent] ⚠️ Erreur lors de la suppression du torrent:', removeError);
                // Supprimer de notre map quand même
                this.torrents.delete(expectedInfoHash);
                // Continuer quand même avec l'ajout
              }
            } else {
              // Le torrent existe et n'est pas bloqué, l'utiliser
              console.log('[WebTorrent] ✅ Torrent valide, utilisation de l\'existant:', {
                progress: existingTorrent.progress,
                numPeers: existingTorrent.numPeers,
                files: existingTorrent.files?.length || 0,
                hasMetadata,
              });
              this.torrents.set(expectedInfoHash, existingTorrent);
              resolve({
                info_hash: expectedInfoHash,
              });
              return;
            }
          }
        }
        
        // Attendre un peu si on vient de supprimer un torrent pour qu'il soit complètement retiré
        // Mais ne pas attendre trop longtemps - WebTorrent gère bien l'ajout même si l'ancien n'est pas complètement supprimé
        
        // Ajouter le torrent avec des options pour améliorer la connexion
        const torrentOptions: any = {};
        
        // En mode navigateur, WebTorrent ne peut utiliser que des trackers WebSocket
        // Essayer d'ajouter des trackers WebSocket publics si le magnet link n'en contient pas
        const hasWebSocketTracker = magnetUri.includes('wss://') || magnetUri.includes('ws://');
        if (!hasWebSocketTracker && typeof window !== 'undefined') {
          // Ajouter des trackers WebSocket publics pour améliorer la découverte de peers
          // Note: Ces trackers peuvent ne pas être disponibles, mais ça vaut le coup d'essayer
          const wsTrackers = [
            'wss://tracker.openwebtorrent.com',
            'wss://tracker.fastcast.nz',
            'wss://tracker.btorrent.xyz',
          ];
          // Les trackers sont généralement ajoutés via le magnet link ou automatiquement par WebTorrent
          // Mais on peut essayer de les ajouter manuellement si nécessaire
          console.log('[WebTorrent] Aucun tracker WebSocket dans le magnet link, WebTorrent utilisera ses trackers par défaut');
        }
        
        const torrent = client.add(magnetUri, torrentOptions);
        console.log('[WebTorrent] Torrent ajouté, infoHash actuel:', torrent.infoHash || 'pas encore disponible');
        
        let resolved = false;
        const cleanup = () => {
          resolved = true;
        };
        
        // Timeout de 30 secondes pour l'ajout du torrent
        const timeout = setTimeout(() => {
          if (!resolved) {
            cleanup();
            // Ne pas rejeter si on a au moins l'infoHash
            if (torrent.infoHash) {
              console.log('[WebTorrent] Timeout mais infoHash disponible:', torrent.infoHash);
              this.torrents.set(torrent.infoHash, torrent);
              resolve({
                info_hash: torrent.infoHash,
              });
            } else {
              console.error('[WebTorrent] Timeout lors de l\'ajout du torrent, pas d\'infoHash disponible');
              reject(new Error('Timeout: Le torrent n\'a pas pu être ajouté dans les 30 secondes'));
            }
          }
        }, 30000);
        
        // Écouter l'événement 'infoHash' qui se déclenche dès que l'infoHash est disponible
        if (torrent.infoHash && !resolved) {
          console.log('[WebTorrent] InfoHash immédiatement disponible:', torrent.infoHash);
          cleanup();
          clearTimeout(timeout);
          this.torrents.set(torrent.infoHash, torrent);
          resolve({
            info_hash: torrent.infoHash,
          });
          return;
        }
        
        // Écouter tous les événements pour déboguer
        torrent.on('infoHash', (infoHash: string) => {
          console.log('[WebTorrent] Événement infoHash:', infoHash);
        });
        
        // Écouter l'événement 'metadata' qui peut se déclencher avant 'ready'
        torrent.on('metadata', () => {
          console.log('[WebTorrent] ✅ Événement metadata déclenché pour:', torrent.infoHash, {
            filesCount: torrent.files?.length || 0,
            numPeers: torrent.numPeers || 0,
            length: torrent.length || 0,
          });
          if (!resolved && torrent.infoHash) {
            // Attendre un peu pour que les fichiers soient disponibles
            setTimeout(() => {
              if (!resolved && torrent.infoHash) {
                cleanup();
                clearTimeout(timeout);
                clearInterval(checkInterval);
                this.torrents.set(torrent.infoHash, torrent);
                console.log('[WebTorrent] ✅ Torrent résolu via metadata, fichiers disponibles:', torrent.files?.length || 0);
                resolve({
                  info_hash: torrent.infoHash,
                });
              }
            }, 500);
          }
        });
        
        // Écouter l'événement 'ready' (déclenché quand les métadonnées sont prêtes)
        torrent.on('ready', () => {
          console.log('[WebTorrent] ✅ Événement ready déclenché pour:', torrent.infoHash, {
            filesCount: torrent.files?.length || 0,
            numPeers: torrent.numPeers || 0,
            length: torrent.length || 0,
          });
          if (!resolved && torrent.infoHash) {
            cleanup();
            clearTimeout(timeout);
            this.torrents.set(torrent.infoHash, torrent);
            resolve({
              info_hash: torrent.infoHash,
            });
          } else if (!resolved) {
            cleanup();
            clearTimeout(timeout);
            reject(new Error('Aucun infoHash retourné après ajout du magnet link'));
          }
        });
        
        // Écouter les autres événements pour déboguer
        torrent.on('wire', (wire: any) => {
          console.log('[WebTorrent] ✅ Nouveau peer connecté', {
            infoHash: torrent.infoHash,
            numPeers: torrent.numPeers || 0,
          });
        });
        
        torrent.on('noPeers', (announceType: string) => {
          console.warn('[WebTorrent] ⚠️ Aucun peer trouvé pour:', announceType, {
            infoHash: torrent.infoHash,
            numPeers: torrent.numPeers || 0,
            trackers: torrent.trackers?.length || 0,
            note: 'En mode navigateur, seuls les trackers WebSocket fonctionnent',
          });
        });
        
        // Gérer les erreurs du torrent
        torrent.on('error', (err: Error) => {
          console.error('[WebTorrent] ❌ Erreur du torrent:', err.message, {
            infoHash: torrent.infoHash,
            numPeers: torrent.numPeers || 0,
          });
          // Ne pas rejeter la promesse sur une erreur de torrent
          // Le torrent peut toujours récupérer des métadonnées même en cas d'erreur
          if (!resolved && err.message.includes('No torrent with id')) {
            // Erreur critique, rejeter
            cleanup();
            clearTimeout(timeout);
            clearInterval(checkInterval);
            reject(err);
          }
        });
        
        // Vérifier périodiquement si l'infoHash est disponible (pour le cas où les événements ne se déclenchent pas)
        let checkCount = 0;
        const checkInterval = setInterval(() => {
          checkCount++;
          if (torrent.infoHash && !resolved) {
            // Vérifier si le torrent a des fichiers (métadonnées disponibles)
            const hasFiles = torrent.files && torrent.files.length > 0;
            
            // Résoudre même sans fichiers après 10 secondes (20 vérifications)
            // Car parfois les fichiers peuvent être chargés plus tard
            if (hasFiles || checkCount > 20) {
              // Si on a des fichiers ou si on a attendu assez longtemps (10 secondes)
              console.log('[WebTorrent] InfoHash détecté via vérification périodique:', torrent.infoHash, {
                hasFiles,
                filesCount: torrent.files?.length || 0,
                checkCount,
                numPeers: torrent.numPeers || 0,
                progress: torrent.progress || 0,
              });
              cleanup();
              clearInterval(checkInterval);
              clearTimeout(timeout);
              this.torrents.set(torrent.infoHash, torrent);
              resolve({
                info_hash: torrent.infoHash,
              });
            } else {
              // Continuer à attendre si on n'a pas encore de fichiers
              if (checkCount % 10 === 0) { // Log toutes les 5 secondes
                const numPeers = torrent.numPeers || 0;
                console.log('[WebTorrent] InfoHash disponible mais pas encore de fichiers, attente...', {
                  checkCount,
                  hasFiles,
                  numPeers,
                  progress: torrent.progress || 0,
                  note: numPeers === 0 ? '⚠️ Aucun peer disponible, attente de connexion...' : 'Métadonnées en cours de récupération...',
                });
              }
            }
          } else if (checkCount > 60) {
            // Arrêter après 60 vérifications (30 secondes)
            clearInterval(checkInterval);
            console.log('[WebTorrent] ⚠️ Arrêt de la vérification périodique après 30 secondes');
          }
        }, 500);
        
      } catch (error) {
        console.error('[WebTorrent] Exception lors de l\'ajout du torrent:', error);
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
        console.log('[WebTorrent] Ajout du fichier .torrent:', file instanceof File ? file.name : 'Buffer');
        
        // Convertir File en Buffer si nécessaire
        const bufferPromise = file instanceof File
          ? file.arrayBuffer().then(buf => Buffer.from(buf))
          : Promise.resolve(file as Buffer);

        bufferPromise.then((buffer) => {
          const torrent = client.add(buffer);
          console.log('[WebTorrent] Fichier .torrent ajouté, infoHash actuel:', torrent.infoHash || 'pas encore disponible');
          
          // Le fichier .torrent contient déjà les métadonnées, donc 'ready' devrait se déclencher rapidement
          torrent.on('metadata', () => {
            console.log('[WebTorrent] ✅ Métadonnées chargées depuis le fichier .torrent:', {
              infoHash: torrent.infoHash,
              filesCount: torrent.files?.length || 0,
              length: torrent.length || 0,
              trackers: torrent.trackers?.length || 0,
            });
          });
          
          torrent.on('ready', () => {
            console.log('[WebTorrent] ✅ Fichier .torrent prêt:', {
              infoHash: torrent.infoHash,
              filesCount: torrent.files?.length || 0,
              length: torrent.length || 0,
              numPeers: torrent.numPeers || 0,
              trackers: torrent.trackers?.length || 0,
              note: 'Les trackers du fichier .torrent sont maintenant actifs',
            });
            if (torrent.infoHash) {
              this.torrents.set(torrent.infoHash, torrent);
              resolve({
                info_hash: torrent.infoHash,
              });
            } else {
              reject(new Error('Aucun infoHash retourné après ajout du fichier torrent'));
            }
          });
          
          torrent.on('error', (err: Error) => {
            console.error('[WebTorrent] ❌ Erreur lors de l\'ajout du fichier .torrent:', err.message);
            reject(err);
          });
          
          // Si le torrent est déjà prêt (métadonnées dans le fichier)
          if (torrent.ready && torrent.infoHash) {
            console.log('[WebTorrent] ✅ Torrent déjà prêt (métadonnées immédiates)');
            this.torrents.set(torrent.infoHash, torrent);
            resolve({
              info_hash: torrent.infoHash,
            });
          }
        }).catch(reject);
      } catch (error) {
        console.error('[WebTorrent] ❌ Erreur lors du traitement du fichier .torrent:', error);
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
    try {
      const torrent = this.torrents.get(infoHash);
      if (torrent) {
        // Vérifier si torrent.resume existe et est une fonction
        if (typeof torrent.resume === 'function') {
          torrent.resume();
        } else {
          console.warn('[WebTorrent] resume() n\'est pas disponible sur ce torrent, tentative de reprise manuelle');
          // Essayer de forcer la reprise en détruisant et recréant les connexions
          // Note: WebTorrent gère généralement cela automatiquement
        }
      } else {
        throw new Error(`Torrent ${infoHash} non trouvé`);
      }
    } catch (error) {
      console.error('[WebTorrent] Erreur lors de la reprise du torrent:', error);
      // Ne pas propager l'erreur, juste logger
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
