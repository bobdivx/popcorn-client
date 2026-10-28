import { describe, expect, it } from 'vitest';
import {
  catalogEntryState,
  checkAccessToken,
  checkModuleUrl,
  checkTrustKey,
  filterCatalog,
  filterCounts,
  installErrorText,
  installProgress,
  matchesSearch,
} from './moduleCatalogModel';

const base = { id: 'app.popcornn.x', name: 'X', description: '', category: null, installed: false, status: 'not_installed', compatible: true, update_available: false } as const;
const mods = [
  { ...base, id: 'a', name: 'Torrent', installed: true, status: 'active', update_available: true },
  { ...base, id: 'b', name: 'Indexers', description: 'Recherche Torznab' },
  { ...base, id: 'c', name: 'Définitions d’indexers', category: 'indexers' },
  { ...base, id: 'd', name: 'Partage', installed: true, status: 'active' },
  { ...base, id: 'e', name: 'Mode voiture', compatible: false },
];

describe('catalogue : état et filtres', () => {
  it('état Installé / Disponible / À mettre à jour / Incompatible', () => {
    expect(mods.map((m) => catalogEntryState(m))).toEqual(['update', 'available', 'available', 'installed', 'incompatible']);
    // Mise à jour incompatible : reste « Installé ».
    expect(catalogEntryState({ ...mods[0], compatible: false })).toBe('installed');
  });

  it('compte les filtres', () => {
    expect(filterCounts(mods)).toEqual({ all: 5, available: 3, installed: 2, updates: 1 });
  });

  it('trie (mises à jour d’abord) et filtre', () => {
    expect(filterCatalog(mods, 'all', '').map((m) => m.id)).toEqual(['a', 'c', 'b', 'd', 'e']);
    expect(filterCatalog(mods, 'installed', '').map((m) => m.id)).toEqual(['a', 'd']);
    expect(filterCatalog(mods, 'updates', '').map((m) => m.id)).toEqual(['a']);
  });

  it('recherche sans accents sur nom, description et catégorie', () => {
    expect(matchesSearch(mods[2], 'definitions')).toBe(true);
    expect(matchesSearch(mods[1], 'torznab')).toBe(true);
    expect(matchesSearch(mods[1], 'index rech')).toBe(true);
    expect(matchesSearch(mods[3], 'index')).toBe(false);
    expect(filterCatalog(mods, 'all', 'INDEX').map((m) => m.id)).toEqual(['c', 'b']);
  });
});

describe('progression d’installation', () => {
  it('téléchargement en cours avec pourcentage', () => {
    const p = installProgress([{ step: 'downloading', received: 25, total: 100 }], false);
    expect(p.steps).toEqual({ download: 'active', verify: 'pending', activate: 'pending' });
    expect(p.percent).toBe(25);
  });

  it('vérification puis activation', () => {
    const ev = [{ step: 'downloading', received: 100, total: 100 }, { step: 'verifying' }, { step: 'installing' }];
    expect(installProgress(ev, false).steps).toEqual({ download: 'done', verify: 'active', activate: 'pending' });
    const p = installProgress([...ev, { step: 'installed' }, { step: 'starting' }], false);
    expect(p.current).toBe('activate');
  });

  it('terminé', () => {
    const p = installProgress([{ step: 'downloading' }, { step: 'verifying' }, { step: 'running' }, { step: 'done' }], true);
    expect(p.finished).toBe(true);
    expect(p.steps).toEqual({ download: 'done', verify: 'done', activate: 'done' });
  });

  it('échec de signature : étape en erreur et message clair', () => {
    const p = installProgress([{ step: 'downloading' }, { step: 'verifying' }, { step: 'error', code: 'signature', error: 'bad sig' }], true);
    expect(p.failed).toBe(true);
    expect(p.steps.verify).toBe('error');
    expect(installErrorText(p.error, p.current)).toMatch(/signature/i);
  });

  it('opération terminée sans succès = échec', () => {
    expect(installProgress([{ step: 'downloading' }], true).failed).toBe(true);
    expect(installErrorText(null, 'download')).toMatch(/téléchargement/i);
  });
});

describe('validation immédiate de l’ajout par URL', () => {
  it('URL', () => {
    expect(checkModuleUrl('', 'process').level).toBe('empty');
    expect(checkModuleUrl('github.com/a/b', 'process').level).toBe('error');
    expect(checkModuleUrl('http://github.com/a/b', 'process').level).toBe('error');
    expect(checkModuleUrl('https://github.com/bobdivx/popcorn-module-ratio', 'process').level).toBe('ok');
    expect(checkModuleUrl('https://example.com/release.json', 'process').level).toBe('ok');
    expect(checkModuleUrl('https://example.com/mod.zip', 'data').level).toBe('ok');
    expect(checkModuleUrl('https://example.com/page', 'process').level).toBe('warn');
  });

  it('clé minisign', () => {
    const key = 'RW' + 'A'.repeat(54);
    expect(checkTrustKey('').level).toBe('empty');
    expect(checkTrustKey(key).level).toBe('ok');
    expect(checkTrustKey(`untrusted comment: minisign public key ABC\n${key}\n`).level).toBe('ok');
    expect(checkTrustKey('RWabc').level).toBe('error');
    expect(checkTrustKey('AB' + 'A'.repeat(54)).level).toBe('error');
    expect(checkTrustKey('RW€').level).toBe('error');
  });

  it('jeton', () => {
    expect(checkAccessToken('').level).toBe('empty');
    expect(checkAccessToken('ghp_' + 'a'.repeat(36)).level).toBe('ok');
    expect(checkAccessToken('github_pat_' + 'a'.repeat(40)).level).toBe('ok');
    expect(checkAccessToken('abc def').level).toBe('error');
    expect(checkAccessToken('short').level).toBe('warn');
  });
});
