import { describe, expect, it } from 'vitest';
import {
  episodeReleaseMatchesTmdbEpisode,
  episodeReleaseMatchesVariantName,
} from './episodeReleaseMatch';

/** Aligné sur les cas indexeur / page détail série (The Testaments, etc.) */
describe('episodeReleaseMatchesVariantName', () => {
  it('matche une release C411 / FW style S01E01', () => {
    const name = 'The.Testaments.S01E01.MULTi.VFF.1080p.WEB.EAC3.5.1.H264-FW';
    expect(episodeReleaseMatchesVariantName(1, 1, name)).toBe(true);
    expect(episodeReleaseMatchesVariantName(1, 2, name)).toBe(false);
  });

  it('matche 1x05 (FR)', () => {
    expect(episodeReleaseMatchesVariantName(1, 5, 'Show.Name.1x05.MULTi.1080p.x264')).toBe(true);
  });

  it('matche S02E01 sur TMDB S01E25 (saison continue)', () => {
    const name = 'Les.Carnets.De.L.Apothicaire.S02E01.MULTI.1080p';
    expect(
      episodeReleaseMatchesTmdbEpisode(1, 25, name, {
        continuous: true,
        courStarts: [1, 25, 49],
      }),
    ).toBe(true);
  });

  it('matche numérotation absolue anime S01E25 → TMDB S2E01 (multi-saisons)', () => {
    const counts = new Map<number, number>([
      [1, 24],
      [2, 24],
    ]);
    const name = 'The.Apothecary.Diaries.S01E25.MULTi.1080p.BluRay.x265-KAF.mkv';
    expect(episodeReleaseMatchesVariantName(2, 1, name, { seasonEpisodeCounts: counts })).toBe(true);
    expect(episodeReleaseMatchesVariantName(2, 1, name)).toBe(false);
    expect(episodeReleaseMatchesVariantName(1, 25, name)).toBe(true);
  });
});
