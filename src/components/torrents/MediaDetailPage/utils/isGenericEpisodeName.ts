/**
 * True si le titre est un placeholder TMDB/API (« Épisode 1 », « Episode 2 », …)
 * plutôt qu’un vrai nom d’épisode.
 */
export function isGenericEpisodeName(name: string | null | undefined, episodeNumber: number): boolean {
  if (!name || !name.trim()) return true;
  if (!Number.isFinite(episodeNumber) || episodeNumber <= 0) return false;
  const n = name.trim();
  const patterns = [
    new RegExp(`^épisode\\s*0*${episodeNumber}$`, 'i'),
    new RegExp(`^episode\\s*0*${episodeNumber}$`, 'i'),
    new RegExp(`^ep\\.?\\s*0*${episodeNumber}$`, 'i'),
    new RegExp(`^e0*${episodeNumber}$`, 'i'),
  ];
  return patterns.some((p) => p.test(n));
}
