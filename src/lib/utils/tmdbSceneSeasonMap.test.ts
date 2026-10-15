import { describe, expect, it } from 'vitest';
import {
  inferCourStartsFromAirDates,
  inferCourStartsFromSceneVariants,
  isContinuousTmdbSeasonLayout,
  isSeasonPackReleaseName,
  scenePackMatchesTmdbEpisode,
  sceneToTmdbAbsolute,
  tmdbAbsoluteToScene,
} from './tmdbSceneSeasonMap';
import { episodeReleaseMatchesTmdbEpisode, torrentReleaseMatchesTmdbEpisode } from './episodeReleaseMatch';

describe('tmdbSceneSeasonMap — Les Carnets de l\'apothicaire', () => {
  const courStarts = [1, 25, 49];

  it('détecte une grille TMDB à une seule saison réelle', () => {
    expect(isContinuousTmdbSeasonLayout([0, 1])).toBe(true);
    expect(isContinuousTmdbSeasonLayout([1])).toBe(true);
    expect(isContinuousTmdbSeasonLayout([0, 1, 2])).toBe(false);
  });

  it('infère les cours via les trous d\'air date (épisodes consécutifs)', () => {
    const starts = inferCourStartsFromAirDates([
      { episode: 1, airDate: '2023-10-22' },
      { episode: 2, airDate: '2023-10-29' },
      { episode: 24, airDate: '2024-03-24' },
      { episode: 25, airDate: '2025-01-10' },
      { episode: 48, airDate: '2025-07-04' },
      { episode: 49, airDate: '2026-10-02' },
      { episode: 50, airDate: '2026-10-09' },
    ]);
    expect(starts).toEqual([1, 25, 49]);
  });

  it('mappe TMDB absolu ↔ scène', () => {
    expect(tmdbAbsoluteToScene(1, courStarts)).toEqual({ season: 1, episode: 1 });
    expect(tmdbAbsoluteToScene(24, courStarts)).toEqual({ season: 1, episode: 24 });
    expect(tmdbAbsoluteToScene(25, courStarts)).toEqual({ season: 2, episode: 1 });
    expect(tmdbAbsoluteToScene(48, courStarts)).toEqual({ season: 2, episode: 24 });
    expect(tmdbAbsoluteToScene(49, courStarts)).toEqual({ season: 3, episode: 1 });
    expect(sceneToTmdbAbsolute(2, 1, courStarts)).toBe(25);
    expect(sceneToTmdbAbsolute(2, 24, courStarts)).toBe(48);
  });

  it('rattache le pack S02 AV1-NOTAG aux épisodes du 2ᵉ cour seulement', () => {
    const name =
      'Les.Carnets.De.L.Apothicaire.S02.MULTI.VFF.1080p.WEBRip.AAC.2.0.AV1-NOTAG';
    expect(isSeasonPackReleaseName(name)).toBe(true);
    expect(
      scenePackMatchesTmdbEpisode(1, 25, name, { continuous: true, courStarts }),
    ).toBe(true);
    expect(
      scenePackMatchesTmdbEpisode(1, 1, name, { continuous: true, courStarts }),
    ).toBe(false);
    expect(
      torrentReleaseMatchesTmdbEpisode(1, 30, name, { continuous: true, courStarts }),
    ).toBe(true);
  });

  it('ne rattache pas un pack S01 aux épisodes du 2ᵉ cour (sinon lecture cassée)', () => {
    const s01 = 'Les.Carnets.De.L.Apothicaire.S01.MULTI.VFF.1080p.WEBRip';
    expect(
      scenePackMatchesTmdbEpisode(1, 1, s01, { continuous: true, courStarts }),
    ).toBe(true);
    expect(
      scenePackMatchesTmdbEpisode(1, 25, s01, { continuous: true, courStarts }),
    ).toBe(false);
    expect(
      scenePackMatchesTmdbEpisode(1, 48, s01, { continuous: true, courStarts }),
    ).toBe(false);
  });

  it('matche S02E01 sur TMDB S01E25', () => {
    const name = 'Les.Carnets.De.L.Apothicaire.S02E01.MULTI.1080p';
    expect(
      episodeReleaseMatchesTmdbEpisode(1, 25, name, { continuous: true, courStarts }),
    ).toBe(true);
    expect(
      episodeReleaseMatchesTmdbEpisode(1, 1, name, { continuous: true, courStarts }),
    ).toBe(false);
  });

  it('infère les cours depuis max S01Exx des variants', () => {
    const starts = inferCourStartsFromSceneVariants(60, [
      'Show.S01E24.1080p',
      'Show.S02.MULTI.1080p',
      'Show.S03E01.1080p',
    ]);
    expect(starts).toEqual([1, 25, 49]);
  });

  it('sans S01Exx (pack S01 + S03E02) préfère cours de 24, pas découpage égal', () => {
    const starts = inferCourStartsFromSceneVariants(60, [
      'Les.Carnets.de.l.apothicaire.S01.MULTI.VFF.1080p.BluRay',
      'Les.Carnets.de.l.apothicaire.S03E02.VOSTFR.1080p',
    ]);
    expect(starts).toEqual([1, 25, 49]);
    expect(tmdbAbsoluteToScene(25, starts!)).toEqual({ season: 2, episode: 1 });
  });
});
