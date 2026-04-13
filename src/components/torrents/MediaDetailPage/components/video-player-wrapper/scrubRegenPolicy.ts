/**
 * Règles métier : quand forcer une régénération scrub après lecture des métadonnées.
 * Centralisé pour éviter les courses avec le poll (carrousel correct → null → count partiel).
 */
export function shouldForceRegenerateScrub(data: {
  count: number;
  durationSeconds: number;
  intervalSeconds: number;
}): boolean {
  const { count, durationSeconds, intervalSeconds } = data;
  const expected =
    durationSeconds > 0 ? Math.min(2000, Math.ceil(durationSeconds / 10)) : 0;

  const looksLegacy =
    expected > 0 &&
    count > 0 &&
    count < Math.min(expected, 60) &&
    Number.isFinite(intervalSeconds) &&
    intervalSeconds > 30;

  const wayTooFewThumbs =
    expected >= 8 &&
    count > 0 &&
    Number.isFinite(durationSeconds) &&
    durationSeconds >= 45 &&
    count * 4 < expected;

  const sparseVersusMetaDuration =
    count > 0 &&
    count <= 12 &&
    Number.isFinite(intervalSeconds) &&
    intervalSeconds > 0 &&
    intervalSeconds <= 14 &&
    Number.isFinite(durationSeconds) &&
    durationSeconds >= 120 &&
    count * intervalSeconds < durationSeconds * 0.82;

  const belowExpectedCap =
    expected > 200 &&
    count >= 100 &&
    count > 0 &&
    count < expected - 30 &&
    count <= 340;

  const barelyAnyThumbs =
    count >= 1 &&
    count <= 3 &&
    Number.isFinite(durationSeconds) &&
    durationSeconds >= 90;

  return (
    looksLegacy ||
    wayTooFewThumbs ||
    sparseVersusMetaDuration ||
    belowExpectedCap ||
    barelyAnyThumbs
  );
}
