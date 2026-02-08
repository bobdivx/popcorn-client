/**
 * Client API torrent en mode démo : réponses simulées (liste vide, pas de téléchargement réel).
 */

import type { ClientTorrentStats, AddTorrentResponse } from '../types.js';

function emptyList(): ClientTorrentStats[] {
  return [];
}

function mockAddResponse(): AddTorrentResponse {
  return {
    info_hash: 'demo-info-hash',
    name: 'Démo',
    stats: null,
  };
}

/**
 * Objet qui simule ClientApi pour le mode démo.
 * Toutes les opérations sont simulées (liste vide, pas d'appel backend).
 */
export function createDemoClientApi(): Record<string, unknown> {
  return {
    get health() {
      return {
        healthCheck: async () => true,
      };
    },
    get torrents() {
      return {
        listTorrents: emptyList,
        getTorrent: async (_infoHash: string) => null as ClientTorrentStats | null,
        getTorrentVerification: async () => ({ available: false, downloading: false, has_files: false }),
        getTorrentStatsV1: async () => null,
        getLibrqbitSessionStats: async () => null,
        getLibrqbitStreamLogsUrl: async () => '',
        postLibrqbitLimits: async () => {},
        getLibrqbitDhtStats: async () => null,
        getLibrqbitDhtTable: async () => null,
        postLibrqbitRustLog: async () => {},
        findLocalMediaByTmdb: async () => [] as Array<{
          id: string;
          file_path: string;
          file_name: string;
          category: string;
        }>,
        addTorrentFile: async () => mockAddResponse(),
        addMagnetLink: async () => mockAddResponse(),
        removeTorrent: async () => {},
        getTorrentFiles: async () => [] as Array<{ path: string; size: number; mime_type: string; is_video: boolean }>,
        getTorrentLogs: async () => [],
        getTorrentDownloadPath: async () => '',
        downloadTorrentFile: async () => {},
        forceTrackerUpdate: async () => {},
      };
    },
    async healthCheck() {
      return true;
    },
    async listTorrents() {
      return emptyList();
    },
    async getTorrent(_infoHash: string) {
      return null as ClientTorrentStats | null;
    },
    async getTorrentVerification() {
      return { available: false, downloading: false, has_files: false };
    },
    async getTorrentStatsV1() {
      return null;
    },
    async getLibrqbitSessionStats() {
      return null;
    },
    async getLibrqbitStreamLogsUrl() {
      return '';
    },
    async postLibrqbitLimits() {},
    async getLibrqbitDhtStats() {
      return null;
    },
    async getLibrqbitDhtTable() {
      return null;
    },
    async postLibrqbitRustLog() {},
    async findLocalMediaByTmdb() {
      return [];
    },
    async addTorrentFile() {
      return mockAddResponse();
    },
    async addMagnetLink() {
      return mockAddResponse();
    },
    async removeTorrent() {},
    async pauseTorrent() {},
    async resumeTorrent() {},
    async getTorrentLogs() {
      return [];
    },
    async getTorrentDownloadPath() {
      return '';
    },
    async getTorrentFiles() {
      return [];
    },
    async downloadTorrentFile() {},
    async forceTrackerUpdate() {},
    async getRequestUrl(path: string) {
      return `http://demo.local/api/client/${path}`;
    },
  };
}

let demoClientApiInstance: ReturnType<typeof createDemoClientApi> | null = null;

export function getDemoClientApi(): ReturnType<typeof createDemoClientApi> {
  if (!demoClientApiInstance) {
    demoClientApiInstance = createDemoClientApi();
  }
  return demoClientApiInstance;
}
