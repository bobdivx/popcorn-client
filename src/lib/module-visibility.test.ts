import { describe, expect, it } from 'vitest';
import { isRequestsUiVisible, isTorrentUiVisible } from './module-visibility';
import type { ServerCapabilities } from './capabilities';

const caps = (features: Record<string, boolean>, legacy = false): ServerCapabilities =>
  ({
    apiVersion: 1,
    serverVersion: '1.0.0',
    edition: legacy ? 'legacy' : 'core',
    features: {
      player: true,
      library: true,
      discover: true,
      requests: true,
      transcoding: true,
      torrent: false,
      stream_torrent: false,
      indexers: false,
      sync: false,
      uploads: false,
      ratio_tools: false,
      ...features,
    },
    modules: { host: true, specVersion: 1, defaultRepository: null, definitionsRepositoryConfigured: false },
    legacy,
    backendUrl: 'http://srv:3000',
    fetchedAt: 0,
  }) as ServerCapabilities;

const normal = { demo: false, buildEnabled: true };
const demo = { demo: true, buildEnabled: true };
const store = { demo: false, buildEnabled: false };

describe('module-visibility', () => {
  it('capacités inconnues (aucune info serveur) : masqué par défaut', () => {
    expect(isTorrentUiVisible(null, normal)).toBe(false);
    expect(isRequestsUiVisible(null, normal)).toBe(false);
  });

  it('mode démo : toujours masqué, même si le serveur annonce les modules', () => {
    expect(isTorrentUiVisible(null, demo)).toBe(false);
    expect(isRequestsUiVisible(null, demo)).toBe(false);
    const full = caps({ torrent: true, indexers: true, requests: true });
    expect(isTorrentUiVisible(full, demo)).toBe(false);
    expect(isRequestsUiVisible(full, demo)).toBe(false);
  });

  it('version store : masqué', () => {
    const full = caps({ torrent: true, indexers: true, requests: true });
    expect(isTorrentUiVisible(full, store)).toBe(false);
    expect(isRequestsUiVisible(full, store)).toBe(false);
  });

  it('serveur cœur (sans modules) : masqué', () => {
    const core = caps({});
    expect(isTorrentUiVisible(core, normal)).toBe(false);
    expect(isRequestsUiVisible(core, normal)).toBe(false);
  });

  it('serveur annonçant torrent + indexers : affiché', () => {
    const full = caps({ torrent: true, indexers: true, requests: true });
    expect(isTorrentUiVisible(full, normal)).toBe(true);
    expect(isRequestsUiVisible(full, normal)).toBe(true);
  });

  it('demandes sans indexers : masquées', () => {
    expect(isRequestsUiVisible(caps({ torrent: true, requests: true }), normal)).toBe(false);
  });

  it('serveur ancien (legacy) : comportement historique conservé', () => {
    const legacy = caps({}, true);
    expect(isTorrentUiVisible(legacy, normal)).toBe(true);
    expect(isRequestsUiVisible(legacy, normal)).toBe(true);
  });
});
