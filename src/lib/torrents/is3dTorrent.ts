/**
 * Détection des releases 3D (SBS / HOU / MVC…) pour filtrer découverte & téléchargements.
 */

/** Tokens typiques dans les noms de release (FSBS = Full Side-By-Side, etc.). */
const THREE_D_PATTERN =
  /(?:^|[.\s_\-\[(])(?:3D|FSBS|HSBS|Half[\s.\-_]?SBS|Full[\s.\-_]?SBS|Half[\s.\-_]?OU|Full[\s.\-_]?OU|HOU|MVC|Stereoscopic|3D[\s.\-_]?SBS|3D[\s.\-_]?HOU|3D[\s.\-_]?TAB)(?:[.\s_\-\])]|$)/i;

export function is3DReleaseName(name: string | null | undefined): boolean {
  if (!name || typeof name !== 'string') return false;
  return THREE_D_PATTERN.test(name);
}

export type Torrent3DLike = {
  name?: string | null;
  cleanTitle?: string | null;
  title?: string | null;
  downloadPath?: string | null;
  filePath?: string | null;
  file_path?: string | null;
  infoHash?: string | null;
  info_hash?: string | null;
  id?: string | null;
  quality?: { full?: string | null; source?: string | null } | null;
};

/** True si le nom / qualité / chemin évoque une release 3D. */
export function torrentLooks3D(torrent: Torrent3DLike | null | undefined): boolean {
  if (!torrent) return false;
  const blob = [
    torrent.name,
    torrent.cleanTitle,
    torrent.title,
    torrent.quality?.full,
    torrent.quality?.source,
    torrent.downloadPath,
    torrent.filePath,
    torrent.file_path,
  ]
    .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    .join(' ');
  return is3DReleaseName(blob);
}

/** Médias déjà en bibliothèque / local_* : on ne les masque pas (déjà téléchargés). */
export function isAlreadyLocalMedia(torrent: Torrent3DLike | null | undefined): boolean {
  if (!torrent) return false;
  const path =
    (typeof torrent.downloadPath === 'string' && torrent.downloadPath.trim()) ||
    (typeof torrent.filePath === 'string' && torrent.filePath.trim()) ||
    (typeof torrent.file_path === 'string' && torrent.file_path.trim()) ||
    '';
  if (path) return true;
  const ih = String(torrent.infoHash || torrent.info_hash || '').toLowerCase();
  const id = String(torrent.id || '').toLowerCase();
  return ih.startsWith('local_') || id.startsWith('local_');
}

/**
 * Retire les torrents 3D si `allow3d` est false.
 * Conserve les médias déjà locaux (fichier bibliothèque).
 */
export function filter3DTorrentsIfDisabled<T extends Torrent3DLike>(
  items: T[],
  allow3d: boolean
): T[] {
  if (allow3d || !Array.isArray(items) || items.length === 0) return items;
  return items.filter((t) => !torrentLooks3D(t) || isAlreadyLocalMedia(t));
}

/** Pool pour choisir un « meilleur » torrent : exclut les 3D si désactivés (même locaux pour la sélection auto). */
export function candidatesExcluding3DUnlessAllowed<T extends Torrent3DLike>(
  items: T[],
  allow3d: boolean
): T[] {
  if (allow3d || !Array.isArray(items) || items.length === 0) return items;
  const non3d = items.filter((t) => !torrentLooks3D(t));
  return non3d.length > 0 ? non3d : [];
}
