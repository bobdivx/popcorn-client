import type { ApiResponse } from './types.js';

export interface LocalAudioStreamTrack {
  index: number;
  language?: string | null;
  title?: string | null;
  codec?: string | null;
  channels?: number | null;
  default?: boolean;
}

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
    return this.backendRequest(`/api/client/local-media/by-info-hash/${encodeURIComponent(hash)}`, { method: 'GET' });
  },

  /** GET /api/local/audio-streams?path=&info_hash= — pistes audio du fichier source (ffprobe). */
  async getLocalAudioStreams(
    this: ServerApiClientLocalMediaAccess,
    opts: { path?: string; infoHash?: string }
  ): Promise<ApiResponse<{ tracks: LocalAudioStreamTrack[] }>> {
    const params = new URLSearchParams();
    if (opts.path) params.set('path', opts.path);
    if (opts.infoHash) params.set('info_hash', opts.infoHash);
    const q = params.toString();
    if (!q) return { success: false, message: 'path ou info_hash requis' };
    return this.backendRequest(`/api/local/audio-streams?${q}`, { method: 'GET' });
  },
};

