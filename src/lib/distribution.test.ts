import { describe, expect, it, vi, beforeEach } from 'vitest';

/** Capacités simulées du serveur (`null` = inconnues / serveur ancien). */
let features: Record<string, boolean> | null = null;

vi.mock('./capabilities', () => ({
  getCachedCapabilities: () => (features ? { features, modules: { installed: [] } } : null),
  isCapabilityAvailable: (f: string) => (features ? features[f] === true : f !== 'uploads' && f !== 'ratio_tools'),
}));

import {
  isCarModuleAvailable,
  isDiscoverAvailable,
  isModuleSettingsRoute,
  isSettingsCategoryAvailable,
  missingCapabilityForRoute,
} from './distribution';

const CORE = { player: true, library: true, discover: true, requests: true, car_lab: true };

describe('routes selon les capacités du serveur', () => {
  beforeEach(() => {
    features = null;
  });

  it('capacités inconnues : tout reste affiché', () => {
    for (const p of ['/search', '/discover', '/plateformes/', '/settings/blacklist', '/car', '/car/lab', '/downloads']) {
      expect(missingCapabilityForRoute(p)).toBeNull();
    }
  });

  it('media center (ni torrent ni indexers) : recherche locale, pas de découverte', () => {
    features = { ...CORE, torrent: false, indexers: false };
    expect(missingCapabilityForRoute('/search')).toBeNull();
    expect(missingCapabilityForRoute('/discover')).not.toBeNull();
    expect(missingCapabilityForRoute('/plateformes/')).not.toBeNull();
    expect(missingCapabilityForRoute('/downloads')).toBe('torrent');
    expect(missingCapabilityForRoute('/settings/indexers')).toBe('indexers');
    expect(missingCapabilityForRoute('/settings/sync')).toBe('indexers');
    expect(missingCapabilityForRoute('/settings/tmdb')).toBeNull();
    expect(missingCapabilityForRoute('/car')).toBeNull();
    expect(isDiscoverAvailable()).toBe(false);
  });

  it('torrent sans indexers : téléchargements oui, réglages indexers / découverte non', () => {
    features = { ...CORE, torrent: true, indexers: false };
    expect(missingCapabilityForRoute('/downloads')).toBeNull();
    expect(missingCapabilityForRoute('/search')).toBeNull();
    for (const p of ['/settings/blacklist', '/settings/discover-sliders', '/settings/discovery', '/settings/content', '/settings/library-indexer', '/discover', '/demandes']) {
      expect(missingCapabilityForRoute(p)).not.toBeNull();
    }
    expect(isSettingsCategoryAvailable('content')).toBe(false);
    expect(isSettingsCategoryAvailable('discovery')).toBe(false);
    expect(isSettingsCategoryAvailable('downloads')).toBe(true);
  });

  it('indexers sans torrent : demandes proposées, téléchargements non', () => {
    features = { ...CORE, torrent: false, indexers: true, requests: true };
    expect(missingCapabilityForRoute('/demandes')).toBeNull();
    expect(missingCapabilityForRoute('/settings/requests-admin')).toBeNull();
    expect(missingCapabilityForRoute('/downloads')).toBe('torrent');
    expect(missingCapabilityForRoute('/settings/indexers')).toBeNull();
    expect(missingCapabilityForRoute('/settings/sync')).toBeNull();
    expect(missingCapabilityForRoute('/settings/librqbit')).toBe('torrent');
    features = { ...CORE, torrent: true, indexers: true, requests: false };
    expect(missingCapabilityForRoute('/demandes')).toBe('requests');
  });

  it('serveur complet : tout est disponible', () => {
    features = { ...CORE, torrent: true, indexers: true };
    for (const p of ['/search', '/discover', '/plateformes/', '/settings/blacklist', '/settings/discover-sliders', '/settings/content', '/demandes']) {
      expect(missingCapabilityForRoute(p)).toBeNull();
    }
  });

  it('discover désactivé : découverte et rangées masquées', () => {
    features = { ...CORE, discover: false, torrent: true, indexers: true };
    expect(missingCapabilityForRoute('/discover')).toBe('discover');
    expect(missingCapabilityForRoute('/settings/discover-sliders')).toBe('discover');
    expect(missingCapabilityForRoute('/settings/blacklist')).toBeNull();
  });

  it('module Voiture désactivé : /car, /car/lab et /car/probe masqués', () => {
    features = { ...CORE, car_lab: false, torrent: true, indexers: true };
    expect(isCarModuleAvailable()).toBe(false);
    for (const p of ['/car', '/car/', '/car/lab', '/car/probe']) expect(missingCapabilityForRoute(p)).toBe('car_lab');
    expect(missingCapabilityForRoute('/cards')).toBeNull();
    features = { ...CORE, torrent: true, indexers: true };
    expect(isCarModuleAvailable()).toBe(true);
  });

  it('pages de réglages de module : retour vers Paramètres > Modules', () => {
    expect(isModuleSettingsRoute('/settings/blacklist')).toBe(true);
    expect(isModuleSettingsRoute('/settings/discover-sliders')).toBe(true);
    expect(isModuleSettingsRoute('/settings/tmdb')).toBe(false);
  });
});
