import { describe, expect, it } from 'vitest';
import { episodeCode, normalizeSearchText, searchLibrary, type LibrarySearchSource } from './library-search';

const lib: LibrarySearchSource[] = [
  { name: 'Interstellar', category: 'FILM', tmdb_id: 157336, release_date: '2014-11-05', poster_url: 'p1' },
  { name: 'Le Fabuleux Destin d’Amélie Poulain', category: 'FILM', tmdb_id: 194 },
  { name: 'Breaking Bad', category: 'SERIES', tmdb_id: 1396, download_path: '/media/series/Breaking.Bad.S01E02.Cats.in.the.Bag.mkv' },
  { name: 'Breaking Bad', category: 'SERIES', tmdb_id: 1396, download_path: '/media/series/Breaking.Bad.S01E01.Pilot.mkv', poster_url: 'bb' },
  { name: 'Absent', category: 'FILM', tmdb_id: 1, exists: false },
];

describe('library-search', () => {
  it('normalise accents et ponctuation', () => {
    expect(normalizeSearchText('Amélie.Poulain_2001')).toBe('amelie poulain 2001');
  });

  it('trouve par préfixe, sans accents et avec une faute de frappe', () => {
    expect(searchLibrary(lib, 'inter')[0]?.title).toBe('Interstellar');
    expect(searchLibrary(lib, 'amelie')[0]?.item.tmdb_id).toBe(194);
    expect(searchLibrary(lib, 'intersteller')[0]?.title).toBe('Interstellar');
    expect(searchLibrary(lib, 'breakng bad')[0]?.title).toBe('Breaking Bad');
  });

  it('regroupe les épisodes sous leur série', () => {
    const hits = searchLibrary(lib, 'breaking');
    expect(hits).toHaveLength(1);
    expect(hits[0].item.poster_url).toBe('bb');
  });

  it('retrouve un épisode par son code ou son titre de fichier', () => {
    const byCode = searchLibrary(lib, 's1e2');
    expect(byCode).toHaveLength(1);
    expect(byCode[0].episodes.map((e) => e.code)).toEqual(['S01E02']);
    const byName = searchLibrary(lib, 'pilot');
    expect(byName[0]?.title).toBe('Breaking Bad');
    expect(byName[0]?.episodes[0]?.code).toBe('S01E01');
  });

  it('filtre par type, ignore les fichiers absents et les requêtes vides', () => {
    expect(searchLibrary(lib, 'breaking', { type: 'movie' })).toHaveLength(0);
    expect(searchLibrary(lib, 'absent')).toHaveLength(0);
    expect(searchLibrary(lib, '  ')).toHaveLength(0);
    expect(searchLibrary(lib, 'zzzz')).toHaveLength(0);
  });

  it('lit les codes d’épisode', () => {
    expect(episodeCode('Show.S02E10.1080p')).toBe('S02E10');
    expect(episodeCode('Show 3x07')).toBe('S03E07');
    expect(episodeCode('Movie 2019 1080p')).toBeNull();
  });
});
