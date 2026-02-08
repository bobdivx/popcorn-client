import type {
  ClientTorrentStats,
  AddTorrentResponse,
  AddMagnetRequest,
  TorrentVerificationResponse,
} from '../types.js';
import type { ClientApi } from './index.js';
import { handleResponse, handleError, extractInfoHashFromError } from './utils.js';

/**
 * Service pour la gestion des torrents
 */
export class TorrentsService {
  constructor(private clientApi: ClientApi) {}

  /**
   * Obtenir l'URL de requête
   */
  private async getRequestUrl(path: string): Promise<string> {
    return this.clientApi['getRequestUrl'](path);
  }

  /**
   * Récupérer la liste de tous les torrents
   */
  async listTorrents(): Promise<ClientTorrentStats[]> {
    try {
      const url = await this.getRequestUrl('torrents');
      const response = await fetch(url);
      const data = await handleResponse<ClientTorrentStats[]>(response);
      return data.data || [];
    } catch (error) {
      throw handleError(error);
    }
  }

  /**
   * Récupérer les statistiques d'un torrent spécifique
   * 
   * Note: Cette méthode peut générer des erreurs 404 dans la console du navigateur
   * si le torrent n'est pas encore téléchargé. C'est normal et attendu - ces erreurs
   * sont gérées silencieusement dans le code et ne doivent pas être considérées comme
   * des problèmes. Le navigateur affiche ces erreurs par défaut pour toutes les requêtes
   * HTTP qui retournent un 404, et cela ne peut pas être complètement supprimé.
   */
  async getTorrent(infoHash: string): Promise<ClientTorrentStats | null> {
    try {
      const url = await this.getRequestUrl(`torrents/${encodeURIComponent(infoHash)}`);
      
      // Utiliser un AbortController pour pouvoir annuler la requête si nécessaire
      const controller = new AbortController();
      
      // Faire la requête avec un signal pour pouvoir l'annuler
      const response = await fetch(url, {
        signal: controller.signal,
      }).catch((err) => {
        // Intercepter les erreurs réseau
        if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
          // Erreur réseau (serveur non accessible), retourner null silencieusement
          return null;
        }
        // Si c'est une erreur d'abort, retourner null silencieusement
        if (err.name === 'AbortError') {
          return null;
        }
        throw err;
      });
      
      if (!response) {
        // Erreur réseau interceptée
        return null;
      }
      
      // Si le torrent n'existe pas (404), retourner null sans logger d'erreur
      // Note: Le navigateur affichera quand même l'erreur 404 dans la console,
      // mais c'est le comportement par défaut et ne peut pas être complètement supprimé
      if (response.status === 404) {
        // Retourner null silencieusement - c'est normal pour un torrent qui n'existe pas encore
        return null;
      }
      
      if (!response.ok) {
        // Autre erreur HTTP, retourner null silencieusement
        return null;
      }
      
      const data = await handleResponse<ClientTorrentStats>(response);
      return data.data || null;
    } catch (error) {
      // Ne logger que les erreurs non-404 et non liées à la connexion
      if (error instanceof Error) {
        const is404 = error.message.includes('404') || error.message.includes('Not found');
        const isNetworkError = error.message.includes('Failed to fetch') || error.message.includes('NetworkError');
        const isAbort = error.name === 'AbortError';
        
        // Ne logger que les erreurs critiques (pas les 404, ni les erreurs réseau temporaires, ni les aborts)
        if (!is404 && !isNetworkError && !isAbort) {
          console.debug('Failed to get torrent:', error);
        }
      }
      return null;
    }
  }

  /**
   * Récupérer l'état de vérification d'un torrent (disponibilité, peers, téléchargement actif, fichiers sur disque).
   * Utilisé par le panneau d'animation de vérification au lancement d'un téléchargement.
   */
  async getTorrentVerification(infoHash: string): Promise<TorrentVerificationResponse | null> {
    try {
      const url = await this.getRequestUrl(
        `torrents/${encodeURIComponent(infoHash)}/verification`
      );
      const response = await fetch(url);
      if (response.status === 404 || !response.ok) {
        return null;
      }
      const data = await handleResponse<TorrentVerificationResponse>(response);
      return data.data ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Stats détaillées v1 (débit, ETA, peers) pour un torrent.
   * GET /api/client/torrents/:id/stats/v1
   */
  async getTorrentStatsV1(infoHash: string): Promise<Record<string, unknown> | null> {
    try {
      const url = await this.getRequestUrl(
        `torrents/${encodeURIComponent(infoHash)}/stats/v1`
      );
      const response = await fetch(url);
      if (response.status === 404 || !response.ok) {
        return null;
      }
      const data = await handleResponse<Record<string, unknown>>(response);
      return data.data ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Stats session globales librqbit (débit up/down, uploaded/fetched, uptime, peers).
   * GET /api/client/librqbit/stats
   */
  async getLibrqbitSessionStats(): Promise<Record<string, unknown> | null> {
    try {
      const url = await this.getRequestUrl('librqbit/stats');
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      const data = await handleResponse<Record<string, unknown>>(response);
      return data.data ?? null;
    } catch {
      return null;
    }
  }

  /**
   * URL du flux SSE des logs session (GET /api/client/librqbit/stream_logs).
   * Utiliser avec EventSource ou fetch + ReadableStream pour afficher les logs en temps réel.
   */
  async getLibrqbitStreamLogsUrl(): Promise<string> {
    return this.getRequestUrl('librqbit/stream_logs');
  }

  async postLibrqbitLimits(uploadBps?: number, downloadBps?: number): Promise<void> {
    const url = await this.getRequestUrl('librqbit/limits');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upload_bps: uploadBps ?? null, download_bps: downloadBps ?? null }),
    });
    await handleResponse<void>(res);
  }

  async getLibrqbitDhtStats(): Promise<Record<string, unknown> | null> {
    try {
      const url = await this.getRequestUrl('librqbit/dht/stats');
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await handleResponse<Record<string, unknown>>(res);
      return data.data ?? null;
    } catch {
      return null;
    }
  }

  async getLibrqbitDhtTable(): Promise<Record<string, unknown> | null> {
    try {
      const url = await this.getRequestUrl('librqbit/dht/table');
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await handleResponse<Record<string, unknown>>(res);
      return data.data ?? null;
    } catch {
      return null;
    }
  }

  async postLibrqbitRustLog(value: string): Promise<void> {
    const url = await this.getRequestUrl('librqbit/rust_log');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: value,
    });
    await handleResponse<void>(res);
  }

  /**
   * Rechercher les médias locaux par TMDB ID
   */
  async findLocalMediaByTmdb(tmdbId: number, tmdbType?: string): Promise<Array<{
    id: string;
    file_path: string;
    file_name: string;
    file_size?: number;
    category: string;
    tmdb_id?: number;
    tmdb_type?: string;
    slug?: string;
    poster_url?: string;
    hero_image_url?: string;
    synopsis?: string;
    release_date?: string;
    genres?: string;
    vote_average?: number;
    runtime?: number;
    info_hash?: string;
    quality?: string;
    resolution?: string;
    language?: string;
  }>> {
    try {
      let url = await this.getRequestUrl('local-media/by-tmdb');
      const params = new URLSearchParams({ tmdb_id: tmdbId.toString() });
      if (tmdbType) {
        params.append('tmdb_type', tmdbType);
      }
      url = `${url}?${params.toString()}`;
      
      const response = await fetch(url);
      if (response.status === 404) {
        return [];
      }
      if (!response.ok) {
        return [];
      }
      
      const data = await handleResponse<Array<{
        id: string;
        file_path: string;
        file_name: string;
        file_size?: number;
        category: string;
        tmdb_id?: number;
        tmdb_type?: string;
        slug?: string;
        poster_url?: string;
        hero_image_url?: string;
        synopsis?: string;
        release_date?: string;
        genres?: string;
        vote_average?: number;
        runtime?: number;
        info_hash?: string;
        quality?: string;
        resolution?: string;
        language?: string;
      }>>(response);
      return data.data || [];
    } catch (error) {
      // Ignorer silencieusement les erreurs
      return [];
    }
  }

  /**
   * Ajouter un torrent depuis un fichier .torrent
   * @param file - Le fichier .torrent
   * @param forStreaming - DEPRECATED: Ne plus utiliser, toujours false. Les téléchargements vont dans media/films ou media/series
   * @param downloadType - Type de téléchargement: "film" ou "serie" (détermine le chemin: media/films ou media/series)
   * @param customDownloadPath - Chemin personnalisé (optionnel)
   */
  async addTorrentFile(
    file: File, 
    forStreaming: boolean = false,
    downloadType?: string,
    customDownloadPath?: string
  ): Promise<AddTorrentResponse> {
    try {
      const fileBuffer = await file.arrayBuffer();
      const url = await this.getRequestUrl('torrents');
      
      const headers: HeadersInit = {
        'Content-Type': 'application/x-bittorrent',
      };
      
      if (forStreaming) {
        headers['X-For-Streaming'] = 'true';
      } else {
        // Pour les téléchargements normaux, ajouter le type et le chemin personnalisé
        if (downloadType) {
          headers['X-Download-Type'] = downloadType;
        }
        if (customDownloadPath) {
          headers['X-Custom-Download-Path'] = customDownloadPath;
        }
      }
      
      // Créer un AbortController avec un timeout plus long pour l'ajout de torrent
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 secondes
      
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: fileBuffer,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
          throw new Error('Timeout: Le backend ne répond pas dans les 60 secondes. L\'ajout du torrent peut prendre du temps à cause de la validation checksum.');
        }
        throw err;
      }

      // Si le torrent existe déjà (400), essayer d'extraire l'infoHash depuis l'erreur
      if (response.status === 400) {
        const contentType = response.headers.get('content-type');
        let errorData: any = {};
        let errorMsg = '';
        
        if (contentType && contentType.includes('application/json')) {
          errorData = await response.json();
          errorMsg = errorData.error || errorData.message || JSON.stringify(errorData);
        } else {
          const text = await response.text();
          errorMsg = text;
          try {
            errorData = JSON.parse(text);
            errorMsg = errorData.error || errorData.message || errorMsg;
          } catch {
            // Ce n'est pas du JSON, utiliser le texte brut
          }
        }
        
        const infoHash = extractInfoHashFromError(errorMsg);
        if (infoHash) {
          return {
            info_hash: infoHash,
          };
        }
        
        throw new Error(errorMsg || `HTTP error! status: ${response.status}`);
      }

      const data = await handleResponse<AddTorrentResponse>(response);
      if (!data.data) {
        throw new Error(data.error || 'Failed to add torrent');
      }
      return data.data;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const infoHash = extractInfoHashFromError(errorMsg);
      
      if (infoHash) {
        return {
          info_hash: infoHash,
        };
      }
      
      throw handleError(error);
    }
  }

  /**
   * Ajouter un torrent depuis un lien magnet
   * @param magnetUri - L'URI magnet du torrent
   * @param name - Le nom du torrent
   * @param forStreaming - DEPRECATED: Ne plus utiliser, toujours false. Les téléchargements vont dans media/films ou media/series
   * @param downloadType - Type de téléchargement: "film" ou "serie" (détermine le chemin: media/films ou media/series)
   * @param customDownloadPath - Chemin personnalisé (optionnel)
   */
  async addMagnetLink(
    magnetUri: string, 
    name: string, 
    forStreaming: boolean = false,
    downloadType?: string,
    customDownloadPath?: string
  ): Promise<AddTorrentResponse> {
    try {
      const request: AddMagnetRequest = {
        magnet_uri: magnetUri,
        name: name,
        for_streaming: forStreaming,
      };

      const url = await this.getRequestUrl('torrents/magnet');
      
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      
      if (forStreaming) {
        headers['X-For-Streaming'] = 'true';
      } else {
        if (downloadType) {
          headers['X-Download-Type'] = downloadType;
        }
        if (customDownloadPath) {
          headers['X-Custom-Download-Path'] = customDownloadPath;
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
      } catch (err) {
        clearTimeout(timeoutId);
        if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
          throw new Error('Timeout: Le backend ne répond pas dans les 60 secondes. L\'ajout du torrent magnet peut prendre du temps.');
        }
        throw err;
      }

      const data = await handleResponse<AddTorrentResponse>(response);
      if (!data.data) {
        throw new Error(data.error || 'Failed to add magnet link');
      }
      return data.data;
    } catch (error) {
      throw handleError(error);
    }
  }

  /**
   * Supprimer un torrent
   */
  async removeTorrent(infoHash: string, deleteFiles: boolean = false): Promise<void> {
    let url = await this.getRequestUrl(`torrents/${encodeURIComponent(infoHash)}`);
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}delete_files=${deleteFiles}`;
    
    const response = await fetch(url, {
      method: 'DELETE',
    });

    await handleResponse<void>(response);
  }

  /**
   * Mettre en pause un torrent
   */
  async pauseTorrent(infoHash: string): Promise<void> {
    const url = await this.getRequestUrl(`torrents/${encodeURIComponent(infoHash)}/pause`);
    const response = await fetch(url, {
      method: 'POST',
    });

    await handleResponse<void>(response);
  }

  /**
   * Reprendre un torrent
   */
  async resumeTorrent(infoHash: string): Promise<void> {
    const url = await this.getRequestUrl(`torrents/${encodeURIComponent(infoHash)}/resume`);
    const response = await fetch(url, {
      method: 'POST',
    });

    await handleResponse<void>(response);
  }

  /**
   * Récupérer les logs d'un torrent
   * @param filtered - Si true, filtre et résume les logs répétitifs (par défaut: true pour le debug)
   */
  async getTorrentLogs(infoHash: string, filtered: boolean = true): Promise<TorrentLogEntry[]> {
    try {
      let url = await this.getRequestUrl(`torrents/${encodeURIComponent(infoHash)}/logs`);
      // Ajouter le paramètre filtered=true par défaut pour le debug
      const separator = url.includes('?') ? '&' : '?';
      url = `${url}${separator}filtered=${filtered}`;
      const response = await fetch(url);
      const data = await handleResponse<TorrentLogEntry[]>(response);
      return data.data || [];
    } catch (error) {
      throw handleError(error);
    }
  }

  /**
   * Récupérer le chemin de téléchargement d'un torrent
   */
  async getTorrentDownloadPath(infoHash: string): Promise<string> {
    try {
      const url = await this.getRequestUrl(`torrents/${encodeURIComponent(infoHash)}/path`);
      const response = await fetch(url);
      const data = await handleResponse<string>(response);
      return data.data || '';
    } catch (error) {
      throw handleError(error);
    }
  }

  /**
   * Récupérer les fichiers d'un torrent par son info_hash
   */
  async getTorrentFiles(infoHash: string): Promise<Array<{path: string, size: number, mime_type: string, is_video: boolean}>> {
    try {
      const url = await this.getRequestUrl(`torrents/${encodeURIComponent(infoHash)}/files`);
      const response = await fetch(url);
      
      if (response.status === 404) {
        return [];
      }
      
      if (!response.ok && response.status !== 200) {
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            if (!data.success || (data.data && Array.isArray(data.data) && data.data.length === 0)) {
              return [];
            }
          }
        } catch {
          return [];
        }
      }
      
      const data = await handleResponse<Array<{path: string, size: number, mime_type: string, is_video: boolean}>>(response);
      
      if (!data.success) {
        return [];
      }
      
      return data.data || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Forcer une mise à jour du tracker pour un torrent
   */
  async forceTrackerUpdate(infoHash: string): Promise<void> {
    try {
      const url = await this.getRequestUrl(`torrents/${encodeURIComponent(infoHash)}/force-tracker-update`);
      const response = await fetch(url, {
        method: 'POST',
      });

      await handleResponse<void>(response);
    } catch (error) {
      throw handleError(error);
    }
  }

  /**
   * Télécharger le fichier .torrent d'un torrent actif
   */
  async downloadTorrentFile(infoHash: string, name: string): Promise<void> {
    try {
      let response = await fetch(`/api/torrents/${encodeURIComponent(infoHash)}/download`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${name || infoHash}.torrent`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        return;
      }
      
      if (response.status === 404) {
        const externalUrl = new URL('/api/torrents/external/download', window.location.origin);
        externalUrl.searchParams.set('infoHash', infoHash);
        if (name) {
          externalUrl.searchParams.set('torrentName', name);
        }
        
        response = await fetch(externalUrl.toString());
        
        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          
          if (contentType.includes('application/json')) {
            const data = await response.json();
            if (data.magnetUri) {
              try {
                await navigator.clipboard.writeText(data.magnetUri);
                alert('Ce torrent est disponible uniquement sous forme de lien magnet. Le lien a été copié dans le presse-papier.\n\n' + data.magnetUri);
              } catch {
                alert('Ce torrent est disponible uniquement sous forme de lien magnet:\n\n' + data.magnetUri);
              }
              return;
            }
          }
          
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${name || infoHash}.torrent`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
          return;
        }
        
        if (response.status === 404) {
          alert('Le fichier .torrent n\'est pas disponible dans la base de données locale.');
          return;
        }
      }
      
      alert(`Erreur lors du téléchargement du fichier .torrent: ${response.status}`);
    } catch (error) {
      console.error('Failed to download torrent file:', error);
      alert(`Erreur lors du téléchargement du fichier .torrent: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }
}

export interface TorrentLogEntry {
  timestamp: number;
  level: string;
  message: string;
}
