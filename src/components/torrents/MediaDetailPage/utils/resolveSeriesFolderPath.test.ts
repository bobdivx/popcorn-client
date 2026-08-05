import { describe, expect, it } from 'vitest';
import { resolveSeriesFolderPath } from './resolveSeriesFolderPath';

describe('resolveSeriesFolderPath', () => {
  it('retire le fichier épisode et le dossier saison', () => {
    expect(
      resolveSeriesFolderPath(
        'C:/Users/auber/Documents/GitHub/popcorn-server/downloads/media/series/Sterling/S01/Sterling.Point.S01E01.mkv',
      ),
    ).toBe(
      'C:/Users/auber/Documents/GitHub/popcorn-server/downloads/media/series/Sterling',
    );
  });

  it('normalise le préfixe //?/', () => {
    expect(
      resolveSeriesFolderPath(
        '//?/C:/Users/auber/Documents/GitHub/popcorn-server/downloads/media/series/Sterling/S01/ep.mkv',
      ),
    ).toBe('C:/Users/auber/Documents/GitHub/popcorn-server/downloads/media/series/Sterling');
  });

  it('accepte un streamPath saison déjà dossier', () => {
    expect(
      resolveSeriesFolderPath(
        'C:\\Users\\auber\\Documents\\GitHub\\popcorn-server\\downloads\\media/series\\Sterling\\S01',
      ),
    ).toBe(
      'C:/Users/auber/Documents/GitHub/popcorn-server/downloads/media/series/Sterling',
    );
  });

  it('retourne null pour une entrée vide', () => {
    expect(resolveSeriesFolderPath(null)).toBeNull();
    expect(resolveSeriesFolderPath('')).toBeNull();
  });
});
