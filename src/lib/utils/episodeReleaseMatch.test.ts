import { describe, expect, it } from 'vitest';
import { episodeReleaseMatchesVariantName } from './episodeReleaseMatch';

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
});
