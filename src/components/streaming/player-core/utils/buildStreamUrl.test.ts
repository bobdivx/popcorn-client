import { describe, expect, it } from 'vitest';
import { normalizeStreamPath } from './buildStreamUrl';

describe('normalizeStreamPath', () => {
  it('conserve media/series sous download_dir', () => {
    expect(
      normalizeStreamPath(
        'media/series/The Testaments/S01/The.Testaments.S01E01.MULTi.VFF.1080p.WEB.EAC3.5.1.H264-TFA.mkv',
      ),
    ).toBe(
      'media/series/The Testaments/S01/The.Testaments.S01E01.MULTi.VFF.1080p.WEB.EAC3.5.1.H264-TFA.mkv',
    );
  });

  it('strip /app/downloads/ Docker sans casser media/', () => {
    expect(
      normalizeStreamPath(
        '/app/downloads/media/series/The Testaments/S01/ep.mkv',
      ),
    ).toBe('media/series/The Testaments/S01/ep.mkv');
  });

  it('strip le résidu app/downloads/ (slash leading déjà retiré)', () => {
    expect(
      normalizeStreamPath('app/downloads/media/series/Foo/S01/ep.mkv'),
    ).toBe('media/series/Foo/S01/ep.mkv');
  });

  it('déduplique media/media/ seulement', () => {
    expect(normalizeStreamPath('media/media/series/Foo/ep.mkv')).toBe(
      'media/series/Foo/ep.mkv',
    );
  });

  it('ne strippe pas un simple nom de fichier', () => {
    expect(normalizeStreamPath('House.of.the.Dragon.S01E01.mkv')).toBe(
      'House.of.the.Dragon.S01E01.mkv',
    );
  });
});
