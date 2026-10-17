import { describe, expect, it } from 'vitest';
import { getAdjacentEpisode } from './episodeNavigation';

const series = {
  seasons: [
    { season: 2, episodes: [{ id: 's2e2', episode: 2 }, { id: 's2e1', episode: 1 }] },
    { season: 0, episodes: [{ id: 's0e1', episode: 1 }] },
    {
      season: 1,
      episodes: [
        { id: 's1pack', episode: 0 },
        ...Array.from({ length: 10 }, (_, i) => ({ id: `s1e${i + 1}`, episode: i + 1 })),
        { id: 's1e10b', episode: 10 },
      ],
    },
  ],
} as any;

describe('getAdjacentEpisode', () => {
  it('crosses season boundary forward (S01E10 -> S02E01)', () => {
    expect(getAdjacentEpisode(series, 1, 's1e10', 1)?.episodeVariantId).toBe('s2e1');
    expect(getAdjacentEpisode(series, 1, 's1e10b', 1)?.episodeVariantId).toBe('s2e1');
  });
  it('crosses season boundary backward (S02E01 -> S01E10)', () => {
    expect(getAdjacentEpisode(series, 2, 's2e1', -1)?.episodeVariantId).toBe('s1e10');
  });
  it('moves within a season', () => {
    expect(getAdjacentEpisode(series, 1, 's1e3', 1)?.episodeVariantId).toBe('s1e4');
    expect(getAdjacentEpisode(series, 1, 's1e3', -1)?.episodeVariantId).toBe('s1e2');
  });
  it('returns null at the ends (skips specials and packs)', () => {
    expect(getAdjacentEpisode(series, 1, 's1e1', -1)).toBeNull();
    expect(getAdjacentEpisode(series, 2, 's2e2', 1)).toBeNull();
  });
  it('returns null without context', () => {
    expect(getAdjacentEpisode(null, 1, 's1e1', 1)).toBeNull();
    expect(getAdjacentEpisode(series, 1, 'nope', 1)).toBeNull();
  });
});
