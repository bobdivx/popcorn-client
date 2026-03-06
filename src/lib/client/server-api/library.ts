/**
 * Méthodes bibliothèque et favoris
 */

import type { ApiResponse, LibraryItem } from './types.js';

/** TTL du cache bibliothèque côté client (ms). Réduit les appels répétés quand on change d'onglet Films/Séries → Bibliothèque. */
const LIBRARY_CACHE_TTL_MS = 45_000;

type LibraryCacheEntry = { data: ApiResponse<LibraryItem[]>; at: number };

/** Cache en mémoire de la réponse GET /library (clé = userId ou ''). Invalidation manuelle via invalidateLibraryCache(). */
let libraryCache: { key: string; entry: LibraryCacheEntry } | null = null;

/**
 * Invalide le cache client de la bibliothèque (à appeler après un scan/sync pour forcer un prochain rechargement).
 */
export function invalidateLibraryCache(): void {
  libraryCache = null;
}

/**
 * Interface pour accéder aux méthodes privées de ServerApiClient nécessaires pour la bibliothèque
 */
interface ServerApiClientLibraryAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit, retryCount?: number, baseUrlOverride?: string): Promise<ApiResponse<T>>;
  getCurrentUserId(): string | null;
}

export const libraryMethods = {
  /**
   * Récupère la bibliothèque de l'utilisateur
   * Envoie X-User-ID pour que le backend utilise la clé TMDB de l'utilisateur (enrichissement).
   * Utilise un cache client (TTL 45s) pour afficher rapidement l'onglet Bibliothèque.
   */
  async getLibrary(this: ServerApiClientLibraryAccess): Promise<ApiResponse<LibraryItem[]>> {
    const userId = this.getCurrentUserId();
    const cacheKey = userId ?? '';
    const now = Date.now();
    if (libraryCache && libraryCache.key === cacheKey && now - libraryCache.entry.at < LIBRARY_CACHE_TTL_MS) {
      return libraryCache.entry.data;
    }
    const headers: HeadersInit = userId ? { 'X-User-ID': userId } : {};
    const data = await this.backendRequest<any[]>('/library', { method: 'GET', headers }) as unknown as ApiResponse<LibraryItem[]>;
    libraryCache = { key: cacheKey, entry: { data, at: now } };
    return data;
  },

  /**
   * Récupère la bibliothèque depuis une URL backend donnée (ex. "mon serveur" sur la page Bibliothèque).
   */
  async getLibraryFromBaseUrl(this: ServerApiClientLibraryAccess, baseUrl: string): Promise<ApiResponse<LibraryItem[]>> {
    const userId = this.getCurrentUserId();
    const headers: HeadersInit = userId ? { 'X-User-ID': userId } : {};
    const base = baseUrl.trim().replace(/\/$/, '');
    return this.backendRequest<any[]>('/library', { method: 'GET', headers }, 0, base) as unknown as ApiResponse<LibraryItem[]>;
  },

  /**
   * Récupère le statut de sync bibliothèque depuis une URL backend donnée.
   */
  async getLibrarySyncStatusFromBaseUrl(
    this: ServerApiClientLibraryAccess,
    baseUrl: string
  ): Promise<ApiResponse<{ sync_in_progress: boolean; scanning_source_id?: string }>> {
    const userId = this.getCurrentUserId();
    const headers: HeadersInit = userId ? { 'X-User-ID': userId } : {};
    const base = baseUrl.trim().replace(/\/$/, '');
    return this.backendRequest<{ sync_in_progress: boolean; scanning_source_id?: string }>(
      '/api/library/status',
      { method: 'GET', headers },
      0,
      base
    );
  },

  /**
   * Ajoute un élément à la bibliothèque
   * Note: La bibliothèque est gérée localement, cette méthode peut être désactivée ou adaptée
   */
  async addToLibrary(
    this: ServerApiClientLibraryAccess,
    contentId: string,
    title: string,
    type: 'movie' | 'tv',
    encryptedData?: string
  ): Promise<ApiResponse<LibraryItem>> {
    // Unifié : pour l'instant, retourner un succès simulé car la bibliothèque n'est pas encore implémentée côté backend Rust
    return { success: true, data: { id: contentId, contentId, title, type, addedAt: new Date().toISOString() } as LibraryItem };
  },

  /**
   * Supprime un élément de la bibliothèque
   */
  async removeFromLibrary(this: ServerApiClientLibraryAccess, libraryId: string): Promise<ApiResponse<void>> {
    // Unifié : appel direct au backend Rust (si implémenté)
    // Pour l'instant, retourner un succès simulé car la bibliothèque n'est pas encore implémentée côté backend Rust
    return { success: true };
  },

  /**
   * Récupère les favoris de l'utilisateur
   */
  async getFavorites(this: ServerApiClientLibraryAccess): Promise<ApiResponse<LibraryItem[]>> {
    // Unifié : pas de feature "favorites" côté backend Rust pour l'instant
    return { success: true, data: [] };
  },

  /**
   * Ajoute un favori
   */
  async addFavorite(
    this: ServerApiClientLibraryAccess,
    contentId: string,
    encryptedData?: string
  ): Promise<ApiResponse<LibraryItem>> {
    // Unifié : pas encore implémenté
    return { success: true, data: { id: contentId, contentId, title: '', type: 'movie', addedAt: new Date().toISOString() } as LibraryItem };
  },

  /**
   * Supprime un favori
   * Note: Pas encore implémenté côté backend Rust
   */
  async removeFavorite(this: ServerApiClientLibraryAccess, favoriteId: string): Promise<ApiResponse<void>> {
    // Unifié : pas encore implémenté
    return { success: true };
  },

  /**
   * Lance le scan et l'enrichissement des fichiers locaux
   */
  async scanLocalMedia(this: ServerApiClientLibraryAccess): Promise<ApiResponse<string>> {
    const userId = this.getCurrentUserId();
    const url = userId 
      ? `/api/library/scan?user_id=${encodeURIComponent(userId)}`
      : '/api/library/scan';
    return this.backendRequest<string>(url, { method: 'POST' });
  },

  /**
   * Indique si un scan bibliothèque est en cours et quelle source est en cours de scan
   */
  async getLibrarySyncStatus(
    this: ServerApiClientLibraryAccess
  ): Promise<ApiResponse<{ sync_in_progress: boolean; scanning_source_id?: string }>> {
    const userId = this.getCurrentUserId();
    const headers: HeadersInit = userId ? { 'X-User-ID': userId } : {};
    return this.backendRequest<{ sync_in_progress: boolean; scanning_source_id?: string }>('/api/library/status', {
      method: 'GET',
      headers,
    });
  },

  // ---------- Sources de bibliothèque (dossiers externes : autre NAS, etc.) ----------

  async getLibrarySources(this: ServerApiClientLibraryAccess): Promise<ApiResponse<LibrarySource[]>> {
    return this.backendRequest<LibrarySource[]>('/api/library/sources', { method: 'GET' });
  },

  async createLibrarySource(
    this: ServerApiClientLibraryAccess,
    body: { path: string; category: 'FILM' | 'SERIES'; label?: string; share_with_friends?: boolean }
  ): Promise<ApiResponse<LibrarySource>> {
    return this.backendRequest<LibrarySource>('/api/library/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  async updateLibrarySource(
    this: ServerApiClientLibraryAccess,
    id: string,
    body: { path?: string; category?: string; label?: string; share_with_friends?: boolean }
  ): Promise<ApiResponse<LibrarySource>> {
    return this.backendRequest<LibrarySource>(`/api/library/sources/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  },

  async deleteLibrarySource(this: ServerApiClientLibraryAccess, id: string): Promise<ApiResponse<void>> {
    return this.backendRequest<void>(`/api/library/sources/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async setLibrarySourceShare(
    this: ServerApiClientLibraryAccess,
    id: string,
    share_with_friends: boolean
  ): Promise<ApiResponse<void>> {
    return this.backendRequest<void>(`/api/library/sources/${encodeURIComponent(id)}/share`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ share_with_friends }),
    });
  },

  async setLibrarySourceEnabled(
    this: ServerApiClientLibraryAccess,
    id: string,
    is_enabled: boolean
  ): Promise<ApiResponse<void>> {
    return this.backendRequest<void>(`/api/library/sources/${encodeURIComponent(id)}/enabled`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_enabled }),
    });
  },

  async scanLibrarySource(this: ServerApiClientLibraryAccess, id: string): Promise<ApiResponse<string>> {
    const userId = this.getCurrentUserId();
    const url = userId
      ? `/api/library/sources/${encodeURIComponent(id)}/scan?user_id=${encodeURIComponent(userId)}`
      : `/api/library/sources/${encodeURIComponent(id)}/scan`;
    return this.backendRequest<string>(url, { method: 'POST' });
  },

  /** Liste tous les médias indexés (local_media) pour la gestion dans Paramètres > Bibliothèque */
  async getLibraryMedia(
    this: ServerApiClientLibraryAccess
  ): Promise<ApiResponse<LibraryMediaEntry[]>> {
    return this.backendRequest<LibraryMediaEntry[]>('/api/library/media', { method: 'GET' });
  },

  /** Met à jour le chemin d'un média (ne déplace pas le fichier sur disque) */
  async updateLibraryMedia(
    this: ServerApiClientLibraryAccess,
    id: string,
    file_path: string
  ): Promise<ApiResponse<LibraryMediaEntry>> {
    return this.backendRequest<LibraryMediaEntry>(
      `/api/library/media/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path }),
      }
    );
  },

  /** Supprime un média de la base (ne supprime pas le fichier sur disque) */
  async deleteLibraryMedia(
    this: ServerApiClientLibraryAccess,
    id: string
  ): Promise<ApiResponse<void>> {
    return this.backendRequest<void>(`/api/library/media/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  /** Supprime le fichier sur disque puis l'entrée en base (répertoire de téléchargement local uniquement) */
  async deleteLibraryMediaFile(
    this: ServerApiClientLibraryAccess,
    id: string
  ): Promise<ApiResponse<void>> {
    return this.backendRequest<void>(`/api/library/media/${encodeURIComponent(id)}/file`, {
      method: 'DELETE',
    });
  },
};

export interface LibrarySource {
  id: string;
  path: string;
  category: string;
  label: string | null;
  share_with_friends: boolean;
  is_enabled?: boolean;
  created_at: number;
  updated_at: number;
  /** Timestamp du dernier scan réussi (Unix sec). Undefined si jamais scanné. */
  last_scanned_at?: number | null;
  /** Nombre de médias (fichiers) indexés pour cette source */
  media_count?: number;
  /** Nombre de dossiers distincts contenant au moins un média */
  folder_count?: number;
}

/** Média indexé dans la bibliothèque (local_media) — pour la gestion dans Paramètres > Bibliothèque */
export interface LibraryMediaEntry {
  id: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  category: string;
  tmdb_id: number | null;
  tmdb_type: string | null;
  tmdb_title: string | null;
  slug: string | null;
  poster_url: string | null;
  hero_image_url: string | null;
  library_source_id: string | null;
}
