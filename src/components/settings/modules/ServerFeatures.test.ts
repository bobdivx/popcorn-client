import { describe, expect, it } from 'vitest';
import type { ServerCapabilities } from '../../../lib/capabilities';
import type { ProcessModule } from '../../../lib/client/server-api/modules';
import { buildServerFeatures, featureSource, featureTx, processModuleName } from './ServerFeatures';

const caps = (features: Record<string, boolean>) =>
  ({
    serverVersion: '1.2.95',
    edition: 'core',
    legacy: false,
    features,
    compiledFeatures: [],
    modules: { host: true, processHost: true, installed: [] },
  }) as unknown as ServerCapabilities;

const proc = (id: string, provides: string[], state = 'running') =>
  ({ id, provides, state, version: '0.1.0', enabled: state !== 'stopped' }) as unknown as ProcessModule;

const tx = featureTx('fr');
const byKey = (list: ReturnType<typeof buildServerFeatures>, k: string) => list.find((f) => f.key === k)!;

describe('fonctions du serveur', () => {
  it('fonction apportée par un module : « Module · Torrent », pas « Intégré au serveur »', () => {
    const list = buildServerFeatures(caps({ player: true, torrent: true }), [], [proc('app.popcornn.torrent', ['torrent'])], 'fr');
    const t = byKey(list, 'torrent');
    expect(t.state).toBe('active');
    expect(t.builtin).toBe(false);
    expect(featureSource(t, tx, '1.2.95')).toBe('Module · Torrent · 0.1.0');
    expect(featureSource(byKey(list, 'player'), tx, '1.2.95')).toBe('Intégré au serveur · 1.2.95');
  });
  it('mode cœur : fonctions de module « Non installé » / « Module à installer »', () => {
    const list = buildServerFeatures(caps({ player: true, torrent: false, requests: false, sharing: false }), [], [], 'fr');
    for (const k of ['torrent', 'requests', 'sharing']) {
      expect(byKey(list, k).state).toBe('not_installed');
      expect(featureSource(byKey(list, k), tx, '1.2.95')).toBe('Module à installer');
    }
  });
  it('module désactivé : « Désactivé », fourni par le module', () => {
    const list = buildServerFeatures(caps({ sharing: false }), [], [proc('app.popcornn.sharing', ['sharing'], 'stopped')], 'fr');
    expect(byKey(list, 'sharing').state).toBe('disabled');
    expect(featureSource(byKey(list, 'sharing'), tx, null)).toBe('Module · Partage · 0.1.0');
  });
  it('nom lisible des modules', () => {
    expect(processModuleName({ id: 'app.popcornn.indexers', provides: [] }, 'fr')).toBe('Indexers');
    expect(processModuleName({ id: 'org.example.x', provides: ['sharing'] }, 'en')).toBe('Sharing');
    expect(processModuleName({ id: 'org.example.hello_world', provides: ['inconnu'] }, 'fr')).toBe('Hello world');
  });
});
