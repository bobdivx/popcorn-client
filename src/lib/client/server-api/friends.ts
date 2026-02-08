/**
 * Méthodes liées aux amis (backend Rust)
 */

import type { ApiResponse } from './types.js';

interface ServerApiClientFriendsAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
}

export const friendsMethods = {
  async syncFriendShares(
    this: ServerApiClientFriendsAccess,
    payload: { replace_all: boolean; friends: Array<{ local_user_id: string; share_type: 'none' | 'all' | 'selected'; media_ids?: string[] }> }
  ): Promise<ApiResponse<string>> {
    return this.backendRequest<string>('/api/friends/sync', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

