import { describe, expect, it } from 'vitest';
import type { CatalogModule } from '../../../lib/client/server-api/modules';
import { catalogIconName, catalogTileState, isCatalogInstallable, isCatalogListed, storeTx } from './ModuleStore';

const tx = storeTx('fr');

const mod = (over: Partial<CatalogModule> = {}): CatalogModule => ({
  id: 'app.popcornn.torrent',
  name: 'Torrent',
  description: 'Téléchargements',
  icon: 'download',
  category: 'downloads',
  version: '0.2.0',
  kind: 'process',
  scopes: ['downloads'],
  status: 'not_installed',
  installed: false,
  installed_version: null,
  enabled: false,
  state: null,
  update_available: false,
  compatible: true,
  incompatible_reason: null,
  ...over,
});

describe('catalogue officiel des modules', () => {
  it('non installé : bouton « Installer »', () => {
    expect(catalogTileState(mod(), tx)).toEqual({ status: undefined, label: 'Non installé', action: 'install' });
  });

  it('non installé mais incompatible : aucune action', () => {
    const s = catalogTileState(mod({ compatible: false, incompatible_reason: 'serveur trop ancien' }), tx);
    expect(s.action).toBeNull();
    expect(s.status).toBe('error');
  });

  it('installé et actif : pastille connectée, mise à jour proposée si disponible', () => {
    const base = { installed: true, installed_version: '0.2.0', status: 'active', enabled: true, state: 'running' };
    expect(catalogTileState(mod(base), tx)).toEqual({ status: 'connected', label: 'Actif', action: null });
    expect(catalogTileState(mod({ ...base, installed_version: '0.1.0', update_available: true }), tx).action).toBe('update');
  });

  it('installé mais désactivé : « Activer »', () => {
    const s = catalogTileState(mod({ installed: true, installed_version: '0.2.0', status: 'disabled', state: 'stopped' }), tx);
    expect(s).toEqual({ status: 'disabled', label: 'Désactivé', action: 'start' });
  });

  it('tous les modules officiels sont proposés (indexers et définitions compris)', () => {
    expect(isCatalogInstallable(mod({ id: 'app.popcornn.indexers', scopes: ['indexers'] }))).toBe(true);
    expect(isCatalogInstallable(mod({ id: 'app.popcornn.indexer-definitions', kind: 'data', scopes: [] }))).toBe(true);
    expect(isCatalogInstallable(mod())).toBe(true);
    expect(isCatalogInstallable(mod({ kind: 'http' }))).toBe(false);
    expect(catalogIconName({ icon: 'search', category: 'indexers' })).toBe('search');
  });

  it('visibilité : absent = listé, masqué non installé = non listé, masqué installé = listé', () => {
    expect(isCatalogListed(mod())).toBe(true);
    expect(isCatalogListed(mod({ visible: true }))).toBe(true);
    expect(isCatalogListed(mod({ visible: false }))).toBe(false);
    expect(isCatalogListed(mod({ visible: false, installed: true, installed_version: '0.1.0', status: 'active' }))).toBe(true);
  });

  it('icônes : uniquement des SVG locaux', () => {
    expect(catalogIconName({ icon: 'sharing', category: null })).toBe('users');
    expect(catalogIconName({ icon: 'https://exemple.test/x.png', category: 'car' })).toBe('car');
    expect(catalogIconName({ icon: null, category: null })).toBe('module');
  });
});
