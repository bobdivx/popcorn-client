import type { LibraryMediaEntry } from '../../lib/client/server-api/library';

export type DuplicateReason = 'path' | 'info_hash' | 'tmdb_film';

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

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').trim().toLowerCase();
}

function normalizeHash(hash: string | null | undefined): string | null {
  const h = (hash || '').trim().toLowerCase();
  if (!h || h.startsWith('local_')) return null;
  return h;
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
 * Détecte les doublons dans la liste local_media :
 * - même chemin normalisé
 * - même info_hash
 * - même TMDB ID pour les films (copies qualité / dossiers)
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

  const hashGroups = groupByKey(
    list,
    (e) => normalizeHash(e.info_hash),
    'info_hash',
    clientTorrentHashes
  );

  const tmdbGroups = groupByKey(
    list.filter((e) => e.category === 'FILM'),
    (e) => (e.tmdb_id != null ? `film:${e.tmdb_id}` : null),
    'tmdb_film',
    clientTorrentHashes
  );

  // Éviter de re-lister un groupe TMDB déjà entièrement couvert par path/hash
  const coveredByExact = new Set<string>();
  for (const g of [...pathGroups, ...hashGroups]) {
    for (const item of g.items) coveredByExact.add(item.id);
  }

  const filteredTmdb = tmdbGroups.filter((g) => {
    const allExact = g.items.every((i) => coveredByExact.has(i.id));
    return !allExact;
  });

  return [...pathGroups, ...hashGroups, ...filteredTmdb].sort(
    (a, b) => b.items.length - a.items.length
  );
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
