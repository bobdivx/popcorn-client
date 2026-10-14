import { describe, expect, it } from 'vitest';
import {
  candidatesExcluding3DUnlessAllowed,
  filter3DTorrentsIfDisabled,
  is3DReleaseName,
  torrentLooks3D,
} from './is3dTorrent';

describe('is3DReleaseName', () => {
  it('détecte FSBS / 3D / HSBS / HOU', () => {
    expect(
      is3DReleaseName(
        'Avatar.De.Feu.Et.De.Cendres.2025.VFF.1080p.BluRay.3D.FSBS.AC3.5.1.x265-BKT'
      )
    ).toBe(true);
    expect(is3DReleaseName('Movie.2024.1080p.BluRay.HSBS.x264')).toBe(true);
    expect(is3DReleaseName('Movie.2024.1080p.3D.HOU.x265')).toBe(true);
    expect(is3DReleaseName('Movie.2024.1080p.BluRay.x265')).toBe(false);
  });
});

describe('filter3DTorrentsIfDisabled', () => {
  const items = [
    { name: 'Film.1080p.BluRay.x265', id: 'a' },
    { name: 'Film.1080p.3D.FSBS.x265', id: 'b' },
    {
      name: 'Film.1080p.3D.FSBS.x265',
      id: 'c',
      downloadPath: 'media/films/Film.1080p.3D.FSBS.x265.mkv',
    },
  ];

  it('exclut les 3D non locaux quand désactivé', () => {
    const out = filter3DTorrentsIfDisabled(items, false);
    expect(out.map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('ne filtre pas quand allow3d', () => {
    expect(filter3DTorrentsIfDisabled(items, true)).toHaveLength(3);
  });
});

describe('candidatesExcluding3DUnlessAllowed', () => {
  it('ne garde que le 2D pour la sélection auto', () => {
    const items = [
      { name: 'Film.1080p.3D.FSBS.x265', seedCount: 100 },
      { name: 'Film.1080p.BluRay.x265', seedCount: 10 },
    ];
    const out = candidatesExcluding3DUnlessAllowed(items, false);
    expect(out).toHaveLength(1);
    expect(torrentLooks3D(out[0])).toBe(false);
  });
});
