import { describe, expect, it } from 'vitest';
import {
  buildExternalDownloadParams,
  extractIndexerTypeIdFromExternalId,
  extractTorrentIdFromExternalVariant,
  isHtmlInsteadOfTorrent,
  looksLikeBencodedTorrent,
  shouldAvoidBareMagnetFallback,
} from './externalDownloadParams';

describe('extractIndexerTypeIdFromExternalId — C411 vs YGG', () => {
  it('extrait c411 depuis un id UI avec infohash hex', () => {
    expect(
      extractIndexerTypeIdFromExternalId(
        'external_c411_9be2b1209b94641cf8e66ec4e5c5c26e87ae9e39',
      ),
    ).toBe('c411');
  });

  it('extrait ygg-api depuis un id numérique (Jackett/YGG)', () => {
    expect(extractIndexerTypeIdFromExternalId('external_ygg-api_1420257')).toBe('ygg-api');
  });

  it('échoue correctement sur null', () => {
    expect(extractIndexerTypeIdFromExternalId(null)).toBeNull();
  });

  it('documente le bug historique : regex _\\d+$ ne matche pas C411', () => {
    const id = 'external_c411_9be2b1209b94641cf8e66ec4e5c5c26e87ae9e39';
    const legacyBroken = id.match(/^external_(.+?)_\d+$/)?.[1] ?? null;
    expect(legacyBroken).toBeNull();
    expect(extractIndexerTypeIdFromExternalId(id)).toBe('c411');
  });
});

describe('extractTorrentIdFromExternalVariant', () => {
  it('utilise le torrentId dédié s\'il existe', () => {
    expect(
      extractTorrentIdFromExternalVariant({
        id: 'external_c411_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        torrentId: 'dedicated-id',
      }),
    ).toBe('dedicated-id');
  });

  it('extrait l\'infohash C411 depuis l\'id UI', () => {
    const hash = '9be2b1209b94641cf8e66ec4e5c5c26e87ae9e39';
    expect(
      extractTorrentIdFromExternalVariant({ id: `external_c411_${hash}` }),
    ).toBe(hash);
  });

  it('préfère infoHash normalisé', () => {
    expect(
      extractTorrentIdFromExternalVariant({
        id: 'external_c411_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        infoHash: '9BE2B1209B94641CF8E66EC4E5C5C26E87AE9E39',
      }),
    ).toBe('9be2b1209b94641cf8e66ec4e5c5c26e87ae9e39');
  });
});

describe('buildExternalDownloadParams — scénario C411 Play/Download', () => {
  it('construit les params attendus par /api/torrents/external/download', () => {
    const hash = '9be2b1209b94641cf8e66ec4e5c5c26e87ae9e39';
    const params = buildExternalDownloadParams({
      id: `external_c411_${hash}`,
      infoHash: hash,
      _guid: hash,
      _externalLink: `https://c411.org/api?t=get&id=${hash}&apikey=REDACTED`,
      indexerId: 'idx-1',
      indexerName: 'C411',
    });

    expect(params.indexerTypeId).toBe('c411');
    expect(params.torrentId).toBe(hash);
    expect(params.guid).toBe(hash);
    expect(params.infoHash).toBe(hash);
    expect(params.externalLink).toContain('t=get');
    expect(params.indexerId).toBe('idx-1');
  });

  it('si seul le lien page /torrents/ est disponible, guid/infoHash restent exploitables', () => {
    const hash = '9be2b1209b94641cf8e66ec4e5c5c26e87ae9e39';
    const params = buildExternalDownloadParams({
      id: `external_c411_${hash}`,
      infoHash: hash,
      _externalLink: `https://c411.org/torrents/${hash}`,
    });
    expect(params.guid).toBe(hash);
    expect(params.indexerTypeId).toBe('c411');
    // Le backend doit alors reconstruire t=get via Torznab (pas utiliser la page HTML)
    expect(params.externalLink).toContain('/torrents/');
  });
});

describe('C411 private tracker safeguards', () => {
  it('évite le magnet nu sans trackers pour C411', () => {
    expect(shouldAvoidBareMagnetFallback('c411')).toBe(true);
    expect(shouldAvoidBareMagnetFallback('ygg-api')).toBe(false);
  });

  it('détecte HTML login vs bencode torrent', () => {
    const html = new TextEncoder().encode(
      '<!DOCTYPE html><html><head><title>Se connecter</title></head>',
    );
    expect(isHtmlInsteadOfTorrent(html)).toBe(true);
    expect(looksLikeBencodedTorrent(html)).toBe(false);

    const torrent = new TextEncoder().encode('d8:announce26:https://c411.org/announce');
    expect(looksLikeBencodedTorrent(torrent)).toBe(true);
  });
});
