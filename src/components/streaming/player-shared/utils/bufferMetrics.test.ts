import { describe, expect, it } from 'vitest';
import {
  getBufferAheadPercent,
  getBufferAheadSeconds,
  getBufferedEndAround,
  getBufferedTimelinePercent,
  isTimeInBuffered,
  type TimeRangesLike,
} from './bufferMetrics';

function ranges(pairs: Array<[number, number]>): TimeRangesLike {
  return {
    length: pairs.length,
    start: (i: number) => pairs[i][0],
    end: (i: number) => pairs[i][1],
  };
}

describe('getBufferAheadSeconds', () => {
  it('retourne 0 si hors buffer', () => {
    expect(getBufferAheadSeconds(ranges([[10, 20]]), 5)).toBe(0);
  });

  it('mesure le ahead dans la range courante', () => {
    expect(getBufferAheadSeconds(ranges([[100, 115]]), 105)).toBe(10);
  });

  it('ne prend pas buffered.end / duration pour faux 100%', () => {
    // Seek à 2700s avec 8s de buffer : ahead=8, pas ~100%
    const ahead = getBufferAheadSeconds(ranges([[2700, 2708]]), 2700);
    expect(ahead).toBe(8);
    expect(getBufferAheadPercent(ahead, 20)).toBe(40);
  });
});

describe('getBufferedTimelinePercent', () => {
  it('utilise la durée réelle comme dénominateur', () => {
    expect(getBufferedTimelinePercent(ranges([[2700, 2710]]), 2700, 3600)).toBeCloseTo(
      (2710 / 3600) * 100,
      5,
    );
  });
});

describe('isTimeInBuffered / getBufferedEndAround', () => {
  it('détecte une position dans le buffer', () => {
    const b = ranges([[50, 80]]);
    expect(isTimeInBuffered(b, 60)).toBe(true);
    expect(isTimeInBuffered(b, 100)).toBe(false);
    expect(getBufferedEndAround(b, 60)).toBe(80);
  });
});
