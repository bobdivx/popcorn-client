/**
 * Politique de retry pour les erreurs réseau HLS (503, 202, etc.).
 */

export interface RetryPolicy {
  maxRetries?: number;
  /** Délai de base (ms) pour le premier retry. */
  retryDelayBase?: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 10,
  retryDelayBase: 500,
};
