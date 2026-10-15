import { describe, expect, it } from 'vitest';
import { shouldReloadSeekForTarget } from './SeekPolicy';

function ranges(pairs: Array<[number, number]>) {
  return {
    length: pairs.length,
    start: (i: number) => pairs[i]![0],
    end: (i: number) => pairs[i]![1],
  };
}

describe('shouldReloadSeekForTarget', () => {
  it('seek dans le buffer → pas de reload', () => {
    expect(
      shouldReloadSeekForTarget({
        targetSec: 60,
        buffered: ranges([[0, 90]]),
        mediaDuration: 1440,
      }),
    ).toBe(false);
  });

  it('seek hors buffer → reload pour déplacer le buffer', () => {
    expect(
      shouldReloadSeekForTarget({
        targetSec: 180,
        buffered: ranges([[0, 90]]),
        mediaDuration: 1440,
      }),
    ).toBe(true);
  });

  it('petit saut juste après la fin du buffer → reload (plus de seuil 60s)', () => {
    expect(
      shouldReloadSeekForTarget({
        targetSec: 100,
        buffered: ranges([[0, 90]]),
        mediaDuration: 1440,
      }),
    ).toBe(true);
  });

  it('buffer court (<20s) + seek lointain → reload', () => {
    expect(
      shouldReloadSeekForTarget({
        targetSec: 200,
        buffered: ranges([[0, 12]]),
        mediaDuration: 1440,
      }),
    ).toBe(true);
  });

  it('au-delà de la durée média générée → reload', () => {
    expect(
      shouldReloadSeekForTarget({
        targetSec: 100,
        buffered: ranges([[0, 90]]),
        mediaDuration: 48,
      }),
    ).toBe(true);
  });
});
