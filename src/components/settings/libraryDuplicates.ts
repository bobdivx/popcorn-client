import type { LibraryMediaEntry } from '../../lib/client/server-api/library';

export type DuplicateReason = 'path' | 'info_hash' | 'tmdb_film' | 'tmdb_episode';

export interface LibraryDuplicateGroup {
  id: string;
  reason: DuplicateReason;
  key: string;
  items: LibraryMediaEntry[];
  /** Entrée suggérée à conserver (client torrent prioritaire, puis métadonnées / taille). */
  keepId: string;
}

export interface FindLibraryDuplicatesOptions {
  /** info_hash présents dans le client torrent (minuscules). */
  clientTorrentHashes?: Set<string> | ReadonlySet<string>;
}

export interface SeasonEpisode {
  season: number;
  episode: number;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').trim().toLowerCase();
}

function normalizeHash(hash: string | null | undefined): string | null {
  const h = (hash || '').trim().toLowerCase();
  if (!h || h.startsWith('local_')) return null;
  return h;
}

/** Extrait SxxExx / 1x05 / Season N Episode M depuis un nom ou chemin de fichier. */
export function parseSeasonEpisode(name: string): SeasonEpisode | null {
  if (!name) return null;
  const base = name.replace(/\\/g, '/').split('/').pop() || name;
  const m =
    base.match(/s([0-9]{1,2})[.\s_-]*e([0-9]{1,3})/i) ||
    base.match(/\b([0-9]{1,2})x([0-9]{1,3})\b/i) ||
    base.match(/season[.\s_-]*([0-9]{1,2})[.\s_-]*episode[.\s_-]*([0-9]{1,3})/i);
  if (!m) return null;
  const season = parseInt(m[1], 10);
  const episode = parseInt(m[2], 10);
  if (!Number.isFinite(season) || !Number.isFinite(episode) || season < 0 || episode <= 0) {
    return null;
  }
  return { season, episode };
}

function episodeFromEntry(entry: LibraryMediaEntry): SeasonEpisode | null {
  return parseSeasonEpisode(entry.file_name) || parseSeasonEpisode(entry.file_path);
}

function isSeriesLike(entry: LibraryMediaEntry): boolean {
  if (entry.category === 'SERIES') return true;
  if (entry.tmdb_type === 'tv') return true;
  return episodeFromEntry(entry) != null;
}

export function isInTorrentClient(
  entry: LibraryMediaEntry,
  clientTorrentHashes?: Set<string> | ReadonlySet<string>
): boolean {
  if (!clientTorrentHashes || clientTorrentHashes.size === 0) return false;
  const hash = normalizeHash(entry.info_hash);
  return hash != null && clientTorrentHashes.has(hash);
}

function scoreKeep(
  entry: LibraryMediaEntry,
  clientTorrentHashes?: Set<string> | ReadonlySet<string>
): number {
  let score = 0;
  // Toujours prioriser le média encore présent dans le client torrent.
  if (isInTorrentClient(entry, clientTorrentHashes)) score += 100_000;
  // À défaut, préférer une entrée liée à un torrent (info_hash réel).
  if (normalizeHash(entry.info_hash)) score += 10_000;
  if (entry.tmdb_id != null) score += 100;
  if (entry.tmdb_title) score += 20;
  if (entry.file_size != null) score += Math.min(entry.file_size / 1_000_000, 50);
  if (!entry.library_source_id) score += 5;
  return score;
}

function pickKeepId(
  items: LibraryMediaEntry[],
  clientTorrentHashes?: Set<string> | ReadonlySet<string>
): string {
  return (
    [...items].sort(
      (a, b) => scoreKeep(b, clientTorrentHashes) - scoreKeep(a, clientTorrentHashes)
    )[0]?.id ?? items[0].id
  );
}

function groupByKey(
  entries: LibraryMediaEntry[],
  getKey: (e: LibraryMediaEntry) => string | null,
  reason: DuplicateReason,
  clientTorrentHashes?: Set<string> | ReadonlySet<string>
): LibraryDuplicateGroup[] {
  const map = new Map<string, LibraryMediaEntry[]>();
  for (const entry of entries) {
    const key = getKey(entry);
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(entry);
    else map.set(key, [entry]);
  }

  const groups: LibraryDuplicateGroup[] = [];
  for (const [key, items] of map) {
    if (items.length < 2) continue;
    groups.push({
      id: `${reason}:${key}`,
      reason,
      key,
      items,
      keepId: pickKeepId(items, clientTorrentHashes),
    });
  }
  return groups;
}

/**
 * Clé info_hash pour doublons :
 * - Film : hash + basename fichier (un mauvais hash parent ne doit pas fusionner 2 films différents)
 * - Série / fichier épisode : hash + SxxExx (un pack saison partage le hash entre épisodes ≠ doublon)
 * - Série sans S/E parsable : pas de regroupement par hash (trop risqué)
 */
function fileBasenameKey(entry: LibraryMediaEntry): string {
  const raw = (entry.file_name || entry.file_path || '').replace(/\\/g, '/');
  const base = (raw.split('/').pop() || raw).trim().toLowerCase();
  return base;
}

function infoHashDuplicateKey(entry: LibraryMediaEntry): string | null {
  const hash = normalizeHash(entry.info_hash);
  if (!hash) return null;

  if (isSeriesLike(entry)) {
    const ep = episodeFromEntry(entry);
    if (!ep) return null;
    return `${hash}:s${ep.season}e${ep.episode}`;
  }

  const base = fileBasenameKey(entry);
  if (!base) return null;
  // Même torrent + même fichier (chemins/encodages de chemin différents), pas deux films distincts.
  return `${hash}:${base}`;
}

/**
 * Détecte les doublons dans la liste local_media :
 * - même chemin normalisé
 * - même info_hash + même fichier (films), ou même info_hash + même épisode (séries)
 * - même TMDB ID pour les films (copies qualité)
 * - même TMDB ID + même SxxExx pour les séries (pas toute la série)
 *
 * Si un média du groupe est dans le client torrent, c'est toujours lui qui est conservé.
 */
export function findLibraryDuplicates(
  list: LibraryMediaEntry[],
  options: FindLibraryDuplicatesOptions = {}
): LibraryDuplicateGroup[] {
  const { clientTorrentHashes } = options;

  const pathGroups = groupByKey(
    list,
    (e) => {
      const key = normalizePath(e.file_path || '');
      return key || null;
    },
    'path',
    clientTorrentHashes
  );

  const hashGroups = groupByKey(list, infoHashDuplicateKey, 'info_hash', clientTorrentHashes);

  const tmdbFilmGroups = groupByKey(
    list.filter((e) => e.category === 'FILM' && !isSeriesLike(e)),
    (e) => (e.tmdb_id != null ? `film:${e.tmdb_id}` : null),
    'tmdb_film',
    clientTorrentHashes
  );

  // Doublons d'épisode (même série TMDB + même SxxExx) — jamais « tous les épisodes de la série ».
  const tmdbEpisodeGroups = groupByKey(
    list.filter((e) => isSeriesLike(e) && e.tmdb_id != null),
    (e) => {
      const ep = episodeFromEntry(e);
      if (!ep || e.tmdb_id == null) return null;
      return `tv:${e.tmdb_id}:s${ep.season}e${ep.episode}`;
    },
    'tmdb_episode',
    clientTorrentHashes
  );

  // Éviter de re-lister un groupe TMDB déjà entièrement couvert par path/hash
  const coveredByExact = new Set<string>();
  for (const g of [...pathGroups, ...hashGroups]) {
    for (const item of g.items) coveredByExact.add(item.id);
  }

  const filterCovered = (groups: LibraryDuplicateGroup[]) =>
    groups.filter((g) => !g.items.every((i) => coveredByExact.has(i.id)));

  return [
    ...pathGroups,
    ...hashGroups,
    ...filterCovered(tmdbFilmGroups),
    ...filterCovered(tmdbEpisodeGroups),
  ].sort((a, b) => b.items.length - a.items.length);
}

/** IDs suggérés à supprimer (tout sauf keepId, jamais un média du client torrent). */
export function suggestedDuplicateIdsToRemove(
  groups: LibraryDuplicateGroup[],
  clientTorrentHashes?: Set<string> | ReadonlySet<string>
): string[] {
  const ids = new Set<string>();
  for (const g of groups) {
    for (const item of g.items) {
      if (item.id === g.keepId) continue;
      if (isInTorrentClient(item, clientTorrentHashes)) continue;
      ids.add(item.id);
    }
  }
  return Array.from(ids);
}
