import { describe, expect, it } from 'vitest';
import { shouldForceRegenerateScrub } from './scrubRegenPolicy';

describe('shouldForceRegenerateScrub', () => {
  it('ne force jamais pendant une génération en cours', () => {
    expect(
      shouldForceRegenerateScrub({
        count: 5,
        durationSeconds: 3000,
        intervalSeconds: 600,
        completed: false,
      }),
    ).toBe(false);
  });

  it('force un set legacy trop sparse une fois terminé', () => {
    expect(
      shouldForceRegenerateScrub({
        count: 5,
        durationSeconds: 3000,
        intervalSeconds: 600,
        completed: true,
      }),
    ).toBe(true);
  });

  it('conserve un set dense à intervalle 10s', () => {
    expect(
      shouldForceRegenerateScrub({
        count: 300,
        durationSeconds: 3000,
        intervalSeconds: 10,
        completed: true,
      }),
    ).toBe(false);
  });
});
