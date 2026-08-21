import { describe, expect, it } from 'vitest';
import { scrubEffectiveDuration, scrubTimeForIndex } from './scrubMath';

describe('scrubEffectiveDuration', () => {
  it('prend le max film / meta / couverture des vignettes', () => {
    expect(
      scrubEffectiveDuration(5400, {
        durationSeconds: 520,
        count: 84,
        intervalSeconds: 10,
      }),
    ).toBe(5400);
  });

  it('ne se limite pas à une meta trop courte (8:40) si le film est plus long', () => {
    expect(
      scrubEffectiveDuration(0, {
        durationSeconds: 520,
        count: 84,
        intervalSeconds: 10,
      }),
    ).toBe(840);
  });
});

describe('scrubTimeForIndex', () => {
  it('14 min de vignettes (index 84 × 10 s) ne retombe pas à 8:40', () => {
    const meta = { count: 100, intervalSeconds: 10 };
    const dur = scrubEffectiveDuration(5400, { ...meta, durationSeconds: 520 });
    expect(scrubTimeForIndex(84, meta, dur)).toBe(840);
  });
});
