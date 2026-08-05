/** Extensions vidéo courantes pour détecter un fichier (vs dossier). */
const VIDEO_EXT_RE = /\.(mkv|mp4|avi|webm|mov|m4v|wmv|ts|m2ts)$/i;

/**
 * Normalise un chemin Windows/Unix et remonte au dossier série
 * (retire le fichier épisode et éventuellement le dossier saison Sxx).
 */
export function resolveSeriesFolderPath(raw: string | null | undefined): string | null {
  if (!raw || !String(raw).trim()) return null;

  let p = String(raw).trim().replace(/\\/g, '/');

  // Préfixe Windows extended-length : //?/C:/...
  if (p.startsWith('//?/')) {
    p = p.slice(4);
  } else if (p.startsWith('\\\\?\\')) {
    p = p.slice(4).replace(/\\/g, '/');
  }

  // Fichier → dossier parent
  if (VIDEO_EXT_RE.test(p) || /\/[^/]+\.[a-z0-9]{2,5}$/i.test(p)) {
    const slash = p.lastIndexOf('/');
    if (slash <= 0) return null;
    p = p.slice(0, slash);
  }

  // Dossier saison (S01, Season 1, …) → dossier série
  p = p.replace(/\/(S\d{1,2}|Season[.\s_-]*\d{1,2})$/i, '');

  p = p.replace(/\/+$/, '');
  return p.length > 0 ? p : null;
}
