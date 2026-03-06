/**
 * Politique de buffer : arrêt du chargement (ex. à la fermeture du lecteur).
 */

export interface BufferPolicy {
  /** Ref vers la fonction d'arrêt du buffer (stopLoad HLS), appelée à la fermeture. */
  stopBufferRef?: { current: (() => void) | null };
}
