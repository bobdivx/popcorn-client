/**
 * Méthodes bibliothèque et favoris
 */

import type { ApiResponse, LibraryItem } from './types.js';

/**
 * Interface pour accéder aux méthodes privées de ServerApiClient nécessaires pour la bibliothèque
 */
interface ServerApiClientLibraryAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
  getCurrentUserId(): string | null;
}

export const libraryMethods = {
  /**
   * Récupère la bibliothèque de l'utilisateur
   * Envoie X-User-ID pour que le backend utilise la clé TMDB de l'utilisateur (enrichissement).
   */
  async getLibrary(this: ServerApiClientLibraryAccess): Promise<ApiResponse<LibraryItem[]>> {
    const userId = this.getCurrentUserId();
    const headers: HeadersInit = userId ? { 'X-User-ID': userId } : {};
    return this.backendRequest<any[]>('/library', { method: 'GET', headers }) as unknown as ApiResponse<LibraryItem[]>;
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
   * Indique si un scan bibliothèque est en cours (pour afficher une animation)
   */
  async getLibrarySyncStatus(this: ServerApiClientLibraryAccess): Promise<ApiResponse<{ sync_in_progress: boolean }>> {
    const userId = this.getCurrentUserId();
    const headers: HeadersInit = userId ? { 'X-User-ID': userId } : {};
    return this.backendRequest<{ sync_in_progress: boolean }>('/api/library/status', { method: 'GET', headers });
  },
};
