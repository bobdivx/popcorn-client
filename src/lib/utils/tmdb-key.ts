/**
 * Vérifie si une clé TMDB est masquée (****, ***, Xxxx...Yyyy) ou invalide.
 * À ne jamais envoyer au backend ni sauvegarder dans le cloud.
 */
export function isTmdbKeyMaskedOrInvalid(
  key: string | null | undefined
): boolean {
  if (key == null || typeof key !== 'string') return true;
  const cleaned = key.trim().replace(/\s+/g, '');
  if (!cleaned) return true;
  if (cleaned.length < 10) return true;
  if (cleaned === '***' || cleaned === '****') return true;
  if (cleaned.includes('*') || cleaned.includes('...')) return true;
  return false;
}
