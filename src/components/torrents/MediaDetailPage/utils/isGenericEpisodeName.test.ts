import { describe, expect, it } from 'vitest';
import { isGenericEpisodeName } from './isGenericEpisodeName';

describe('isGenericEpisodeName', () => {
  it('détecte les placeholders FR/EN', () => {
    expect(isGenericEpisodeName('Épisode 1', 1)).toBe(true);
    expect(isGenericEpisodeName('Episode 2', 2)).toBe(true);
    expect(isGenericEpisodeName('Ep. 3', 3)).toBe(true);
  });

  it('accepte un vrai titre', () => {
    expect(isGenericEpisodeName('But I Just Took an Ambien', 1)).toBe(false);
  });
});
