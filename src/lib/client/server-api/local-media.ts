import type { ApiResponse } from './types.js';

interface ServerApiClientLocalMediaAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
}

export const localMediaMethods = {
  /** GET /api/local-media/by-info-hash/:info_hash */
  async findLocalMediaByInfoHash(
    this: ServerApiClientLocalMediaAccess,
    infoHash: string
  ): Promise<ApiResponse<any>> {
    const hash = (infoHash || '').trim().toLowerCase();
    if (!hash) return { success: false, message: 'info_hash requis' };
    return this.backendRequest(`/api/local-media/by-info-hash/${encodeURIComponent(hash)}`, { method: 'GET' });
  },
};

