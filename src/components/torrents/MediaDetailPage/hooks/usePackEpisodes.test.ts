import { describe, expect, it } from 'vitest';
import { findPackFileIndexForEpisode, parseSeasonEpisodeFromName } from './usePackEpisodes';

describe('parseSeasonEpisodeFromName', () => {
  it('parse SxxExx', () => {
    expect(parseSeasonEpisodeFromName('Show.S01E05.1080p.mkv')).toEqual({ season: 1, episode: 5 });
  });

  it('parse NxN', () => {
    expect(parseSeasonEpisodeFromName('Show.1x08.mkv')).toEqual({ season: 1, episode: 8 });
  });
});

describe('findPackFileIndexForEpisode', () => {
  const files = [
    { name: 'Show.S01E01.mkv' },
    { name: 'Show.S01E02.mkv' },
    { name: 'Show.S01E05.mkv' },
    { name: 'sample.mkv' },
  ];

  it('trouve l’index du fichier pour l’épisode demandé', () => {
    expect(findPackFileIndexForEpisode(files, 1, 5)).toBe(2);
    expect(findPackFileIndexForEpisode(files, 1, 1)).toBe(0);
  });

  it('retourne null si absent ou épisode invalide', () => {
    expect(findPackFileIndexForEpisode(files, 1, 9)).toBeNull();
    expect(findPackFileIndexForEpisode(files, 1, 0)).toBeNull();
  });
});
