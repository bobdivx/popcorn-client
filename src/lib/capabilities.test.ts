import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./backend-config', () => ({ getBackendUrl: () => 'http://srv.test' }));

import {
  parseCapabilities,
  isFeatureEnabled,
  isSharingEnabled,
  isRequestsEnabled,
  supportsModuleToggle,
  getCachedCapabilities,
  invalidateCapabilities,
  refreshCapabilitiesNow,
  loadCapabilities,
  type ServerCapabilities,
} from './capabilities';

const URL = 'http://srv.test';

/** Réponse du serveur en production (branche dev) : ni `sharing`, ni `enabled`, ni `process`. */
const PROD_PAYLOAD = {
  success: true,
  data: {
    api_version: 1,
    server_version: '1.0.0',
    edition: 'full',
    features: { player: true, library: true, discover: true, requests: true, torrent: true, indexers: true, sync: true },
    modules: { host: true, spec_version: 1, installed: [{ id: 'defs', name: 'Defs', kind: 'data', provides: ['indexer_definitions'] }] },
  },
};

/** Réponse du serveur modulaire (refactor/core-modules). */
function modularPayload(over: Record<string, boolean> = {}, enabled = true) {
  return {
    success: true,
    data: {
      api_version: 1,
      edition: 'core',
      features: { player: true, requests: true, indexers: true, sync: true, torrent: false, sharing: true, ai: false, ...over },
      modules: {
        host: true,
        installed: [{ id: 'indexers', name: 'Indexers', kind: 'data', provides: ['indexers'], active: true, enabled }],
        process: [{ id: 'sharing', version: '0.1.0', enabled: true, state: 'running', provides: ['sharing'] }],
      },
    },
  };
}

function caps(json: unknown): ServerCapabilities {
  const c = parseCapabilities(json, URL);
  if (!c) throw new Error('parse failed');
  return c;
}

describe('parseCapabilities', () => {
  it('rejette une réponse sans features', () => {
    expect(parseCapabilities(null, URL)).toBeNull();
    expect(parseCapabilities({ data: {} }, URL)).toBeNull();
  });

  it('serveur en production : pas de routes enable/disable, modules actifs par défaut', () => {
    const c = caps(PROD_PAYLOAD);
    expect(c.legacy).toBe(false);
    expect(c.modules.toggleRoutes).toBe(false);
    expect(c.modules.process).toEqual([]);
    expect(c.modules.processHost).toBe(false);
    expect(c.modules.installed![0].enabled).toBe(true);
    expect(c.features.sharing).toBeUndefined();
    expect(c.features.uploads).toBe(false);
  });

  it('serveur modulaire : sharing, process et enabled lus, routes détectées', () => {
    const c = caps(modularPayload({}, false));
    expect(c.edition).toBe('core');
    expect(c.features.sharing).toBe(true);
    expect(c.features.torrent).toBe(false);
    expect(c.modules.toggleRoutes).toBe(true);
    expect(c.modules.installed![0].enabled).toBe(false);
    expect(c.modules.process![0]).toMatchObject({ id: 'sharing', enabled: true, state: 'running', provides: ['sharing'] });
  });

  it('détecte les routes même sans sharing si un module expose enabled', () => {
    const json = { data: { features: {}, modules: { installed: [{ id: 'x', enabled: true }] } } };
    expect(caps(json).modules.toggleRoutes).toBe(true);
  });
});

describe('isFeatureEnabled', () => {
  it('capacités inconnues ou serveur legacy : tout visible (sauf uploads / ratio)', () => {
    expect(isFeatureEnabled(null, 'sharing')).toBe(true);
    expect(isFeatureEnabled(null, 'uploads')).toBe(false);
    expect(isFeatureEnabled({ ...caps(PROD_PAYLOAD), legacy: true }, 'torrent')).toBe(true);
  });
  it('clé absente → vrai, valeur annoncée sinon', () => {
    const c = caps(modularPayload());
    expect(isFeatureEnabled(c, 'webos_deployment')).toBe(true);
    expect(isFeatureEnabled(c, 'ai')).toBe(false);
    expect(isFeatureEnabled(c, 'sharing')).toBe(true);
    expect(isFeatureEnabled(c, 'ratio_tools')).toBe(false);
  });
});

describe('isSharingEnabled', () => {
  it('serveur sans la clé (production) → visible', () => {
    expect(isSharingEnabled(null)).toBe(true);
    expect(isSharingEnabled(caps(PROD_PAYLOAD))).toBe(true);
  });
  it('module partage actif / inactif', () => {
    expect(isSharingEnabled(caps(modularPayload({ sharing: true })))).toBe(true);
    expect(isSharingEnabled(caps(modularPayload({ sharing: false })))).toBe(false);
    expect(isSharingEnabled(caps(modularPayload({ sharing: false, friends: true })))).toBe(true);
  });
});

describe('isRequestsEnabled', () => {
  it('inconnu / legacy → visible', () => {
    expect(isRequestsEnabled(null)).toBe(true);
  });
  it('exige requests ET indexers', () => {
    expect(isRequestsEnabled(caps(PROD_PAYLOAD))).toBe(true);
    expect(isRequestsEnabled(caps(modularPayload({ requests: true, indexers: false })))).toBe(false);
    expect(isRequestsEnabled(caps(modularPayload({ requests: false, indexers: true })))).toBe(false);
    expect(isRequestsEnabled(caps(modularPayload({ requests: true, indexers: true })))).toBe(true);
  });
});

describe('supportsModuleToggle', () => {
  it('uniquement si le serveur annonce les nouvelles routes', () => {
    expect(supportsModuleToggle(null)).toBe(false);
    expect(supportsModuleToggle(caps(PROD_PAYLOAD))).toBe(false);
    expect(supportsModuleToggle(caps(modularPayload()))).toBe(true);
    expect(supportsModuleToggle({ ...caps(modularPayload()), legacy: true })).toBe(false);
  });
});

describe('invalidateCapabilities / refreshCapabilitiesNow', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    window.localStorage.clear();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respond(json: unknown) {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => json });
  }

  it('recharge immédiatement sans attendre le TTL', async () => {
    respond(modularPayload({ sharing: true }));
    await loadCapabilities({ force: true });
    expect(isSharingEnabled(getCachedCapabilities())).toBe(true);

    // Dans le TTL : pas de nouvel appel.
    await loadCapabilities();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    respond(modularPayload({ sharing: false }));
    await refreshCapabilitiesNow();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(isSharingEnabled(getCachedCapabilities())).toBe(false);
  });

  it('invalidate force la prochaine lecture à recharger', async () => {
    respond(PROD_PAYLOAD);
    await loadCapabilities({ force: true });
    invalidateCapabilities();
    expect(getCachedCapabilities()?.fetchedAt).toBe(0);
    respond(modularPayload());
    await loadCapabilities();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(supportsModuleToggle(getCachedCapabilities())).toBe(true);
  });

  it('ancien serveur sans /capabilities (404) → legacy, tout visible', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => null });
    const c = await refreshCapabilitiesNow();
    expect(c?.legacy).toBe(true);
    expect(isSharingEnabled(c)).toBe(true);
    expect(isRequestsEnabled(c)).toBe(true);
    expect(supportsModuleToggle(c)).toBe(false);
  });
});
