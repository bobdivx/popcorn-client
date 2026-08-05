import { describe, expect, it } from 'vitest';
import { buildMediaDetailUrl, buildStrictTmdbDetailUrl } from './media-detail-url';

describe('buildMediaDetailUrl', () => {
  it('inclut infoHash pour la lecture depuis downloads', () => {
    const url = buildMediaDetailUrl({
      tmdbId: 9053,
      type: 'movie',
      from: 'downloads',
      title: 'DOA Dead Or',
      infoHash: '1b4109ae13202709140c52e127fca1c346d9b38f',
    });
    expect(url).toContain('tmdbId=9053');
    expect(url).toContain('type=movie');
    expect(url).toContain('from=downloads');
    expect(url).toContain('infoHash=1b4109ae13202709140c52e127fca1c346d9b38f');
    expect(url).toContain('title=DOA');
  });

  it('buildStrictTmdbDetailUrl propage infoHash', () => {
    const url = buildStrictTmdbDetailUrl({
      tmdbId: 9053,
      type: 'movie',
      from: 'downloads',
      infoHash: 'abc123',
    });
    expect(url).toContain('infoHash=abc123');
  });
});
