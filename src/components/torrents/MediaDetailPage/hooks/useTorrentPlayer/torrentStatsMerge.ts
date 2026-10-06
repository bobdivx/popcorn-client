/** Stats minimales pour décider si un poll doit remplacer l'affichage en cours. */
export interface TorrentStatsSnapshot {
  state?: string | null;
  progress?: number | null;
}

/**
 * Garde l'affichage précédent seulement si la réponse API est inutilisable,
 * ou si elle remettrait un téléchargement déjà avancé à 0 % (glitch).
 * Un vrai « downloading / queued » à 0 % (recherche de pairs) doit passer,
 * sinon la carte reste bloquée sur les stats optimistes du clic.
 */
export function shouldKeepPreviousTorrentStats(
  incoming: TorrentStatsSnapshot,
  current: TorrentStatsSnapshot | null,
): boolean {
  if (!current) return false;
  const currentState = (current.state || '').toLowerCase();
  if (currentState !== 'queued' && currentState !== 'downloading') return false;

  const apiState = (incoming.state || '').toLowerCase();
  if (!apiState || apiState === 'unknown') return true;

  const apiProgress = Number(incoming.progress ?? 0);
  const currentProgress = Number(current.progress ?? 0);
  const terminalOrVerify =
    apiState === 'completed' ||
    apiState === 'seeding' ||
    apiState === 'checking' ||
    apiState === 'initializing';
  return apiProgress === 0 && currentProgress > 0.001 && !terminalOrVerify;
}
