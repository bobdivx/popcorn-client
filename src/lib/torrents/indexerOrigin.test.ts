import { describe, expect, it } from 'vitest';
import {
  buildIndexerOrigin,
  indexerOriginHeaders,
  MAX_ORIGIN_HEADER_LEN,
  serverAcceptsIndexerOrigin,
} from './indexerOrigin';

describe('serverAcceptsIndexerOrigin', () => {
  it('seulement avec features.ratio === true', () => {
    expect(serverAcceptsIndexerOrigin(null)).toBe(false);
    expect(serverAcceptsIndexerOrigin(undefined)).toBe(false);
    expect(serverAcceptsIndexerOrigin({ features: {} })).toBe(false);
    expect(serverAcceptsIndexerOrigin({ features: { ratio: false } })).toBe(false);
    expect(serverAcceptsIndexerOrigin({ legacy: true, features: { ratio: true } })).toBe(false);
    expect(serverAcceptsIndexerOrigin({ features: { ratio: true } })).toBe(true);
  });
});

describe('buildIndexerOrigin', () => {
  it('sans indexer : null', () => {
    expect(buildIndexerOrigin(null)).toBeNull();
    expect(buildIndexerOrigin({})).toBeNull();
    expect(buildIndexerOrigin({ indexerId: '   ' })).toBeNull();
    expect(buildIndexerOrigin({ indexerName: 'YGG' })).toBeNull();
  });

  it('camelCase et snake_case', () => {
    expect(buildIndexerOrigin({ indexerId: 'abc', indexerName: 'YGG', minimumRatio: 1 })).toEqual({
      indexerId: 'abc',
      indexerName: 'YGG',
      minimumRatio: 1,
      minimumSeedTime: null,
    });
    expect(
      buildIndexerOrigin({ indexer_id: 42, indexer_name: 'C411', minimum_ratio: '0.8', minimum_seed_time: '3600.7' }),
    ).toEqual({ indexerId: '42', indexerName: 'C411', minimumRatio: 0.8, minimumSeedTime: 3600 });
  });

  it('valeurs invalides ignorées', () => {
    const o = buildIndexerOrigin({ indexerId: 'x', minimumRatio: -1, minimumSeedTime: 'abc' });
    expect(o?.minimumRatio).toBeNull();
    expect(o?.minimumSeedTime).toBeNull();
    expect(buildIndexerOrigin({ indexerId: 'x', minimumRatio: Number.NaN })?.minimumRatio).toBeNull();
  });
});

describe('indexerOriginHeaders', () => {
  it('aucun en-tête sans origine', () => {
    expect(indexerOriginHeaders(null)).toEqual({});
    expect(indexerOriginHeaders(undefined)).toEqual({});
    expect(indexerOriginHeaders({ indexerId: '' })).toEqual({});
  });

  it('en-têtes complets', () => {
    expect(
      indexerOriginHeaders({ indexerId: 'ygg', indexerName: 'YggTorrent', minimumRatio: 1, minimumSeedTime: 172800 }),
    ).toEqual({
      'X-Indexer-Id': 'ygg',
      'X-Indexer-Name': 'YggTorrent',
      'X-Indexer-Minimum-Ratio': '1',
      'X-Indexer-Minimum-Seed-Time': '172800',
    });
  });

  it('valeurs sûres pour fetch : ASCII imprimable, longueur bornée', () => {
    const h = indexerOriginHeaders({ indexerId: 'id\r\nX-Evil: 1', indexerName: 'Café “Torrents” 🎬' });
    expect(h['X-Indexer-Id']).toBe('idX-Evil: 1');
    expect(h['X-Indexer-Name']).toBe('Caf Torrents');
    const long = indexerOriginHeaders({ indexerId: 'a'.repeat(500) });
    expect(long['X-Indexer-Id'].length).toBe(MAX_ORIGIN_HEADER_LEN);
    // Les valeurs doivent être acceptées par l'API Headers.
    expect(() => new Headers(h)).not.toThrow();
  });

  it('nom vide après nettoyage : omis', () => {
    expect(indexerOriginHeaders({ indexerId: 'x', indexerName: '🎬' })).toEqual({ 'X-Indexer-Id': 'x' });
  });
});
