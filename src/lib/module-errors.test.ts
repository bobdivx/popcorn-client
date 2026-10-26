import { describe, it, expect } from 'vitest';
import {
  moduleNotInstalledCapability,
  isModuleNotInstalled,
  missingModuleCapability,
  isRouteUnsupported,
  modulesPageHref,
  moduleApiCapability,
  blockedModuleCapability,
} from './module-errors';

describe('moduleNotInstalledCapability', () => {
  it('lit le corps 404 module_not_installed du serveur', () => {
    const body = { success: false, data: { code: 'module_not_installed', capability: 'sharing' }, error: 'module non installé : sharing' };
    expect(moduleNotInstalledCapability(body)).toBe('sharing');
    expect(moduleNotInstalledCapability({ data: { code: 'module_not_installed' } })).toBe('');
  });
  it('ignore les autres corps', () => {
    expect(moduleNotInstalledCapability(null)).toBeNull();
    expect(moduleNotInstalledCapability({ error: 'x' })).toBeNull();
    expect(moduleNotInstalledCapability({ data: { code: 'other' } })).toBeNull();
  });
});

describe('isModuleNotInstalled / missingModuleCapability', () => {
  it('réponse mappée par backendRequest', () => {
    const res = { success: false, error: 'ModuleNotInstalled', message: 'module non installé : requests', details: 'requests' };
    expect(isModuleNotInstalled(res)).toBe(true);
    expect(missingModuleCapability(res, 'x')).toBe('requests');
  });
  it('repli sur le message', () => {
    const res = { success: false, error: 'BackendError', message: 'module non installé : indexers' };
    expect(isModuleNotInstalled(res)).toBe(true);
    expect(missingModuleCapability(res, 'requests')).toBe('indexers');
  });
  it('autres erreurs / succès', () => {
    expect(isModuleNotInstalled({ success: true })).toBe(false);
    expect(isModuleNotInstalled({ success: false, error: 'NotFound', message: 'Erreur 404' })).toBe(false);
    expect(missingModuleCapability({ success: false, message: 'boom' }, 'requests')).toBe('requests');
    expect(missingModuleCapability(null, 'sharing')).toBe('sharing');
  });
});

describe('isRouteUnsupported', () => {
  it('404 / 405 sans corps = serveur ancien', () => {
    expect(isRouteUnsupported({ success: false, error: 'NotFound', message: 'Erreur 404' })).toBe(true);
    expect(isRouteUnsupported({ success: false, error: 'BackendError', message: 'Erreur 405' })).toBe(true);
  });
  it('404 métier ou module_not_installed ≠ route absente', () => {
    expect(isRouteUnsupported({ success: false, error: 'BackendError', message: 'module introuvable' })).toBe(false);
    expect(isRouteUnsupported({ success: false, error: 'ModuleNotInstalled', message: 'Erreur 404' })).toBe(false);
    expect(isRouteUnsupported({ success: true })).toBe(false);
  });
});

describe('modulesPageHref', () => {
  it('lien vers Paramètres > Modules', () => {
    expect(modulesPageHref('sharing')).toBe('/settings/modules/?missing=sharing');
    expect(modulesPageHref('')).toBe('/settings/modules/');
    expect(modulesPageHref('<script>')).toBe('/settings/modules/');
  });
});

describe('routes des modules', () => {
  it('capacité de la route (plus long préfixe)', () => {
    expect(moduleApiCapability('/api/client/torrents/enriched')).toBe('torrent');
    expect(moduleApiCapability('/api/torrents/list?category=films')).toBe('indexers');
    expect(moduleApiCapability('/api/torrents/list-files?x=1')).toBe('torrent');
    expect(moduleApiCapability('/api/friends/shares')).toBe('sharing');
    expect(moduleApiCapability('/api/requests')).toBe('requests');
    expect(moduleApiCapability('/api/library')).toBeNull();
    expect(moduleApiCapability('/api/torrentsx')).toBeNull();
  });
  it('appel évité seulement si le serveur annonce la fonction absente', () => {
    const core = { features: { torrent: false, indexers: false, sharing: true } as Record<string, boolean> };
    expect(blockedModuleCapability('/api/client/torrents/enriched', core)).toBe('torrent');
    expect(blockedModuleCapability('/api/torrents/list?category=films', core)).toBe('indexers');
    expect(blockedModuleCapability('/api/friends/shares', core)).toBeNull();
    expect(blockedModuleCapability('/api/requests', core)).toBeNull();
    expect(blockedModuleCapability('/api/client/torrents/enriched', null)).toBeNull();
    expect(blockedModuleCapability('/api/client/torrents/enriched', { ...core, legacy: true })).toBeNull();
  });
});
