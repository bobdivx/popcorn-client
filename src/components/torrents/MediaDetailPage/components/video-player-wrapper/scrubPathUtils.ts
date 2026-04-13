/** Chemins fichiers torrent / bibliothèque pour résoudre le média scrub. */
export function normalizeScrubPath(p: string): string {
  return p.replace(/\\\\/g, '/').trim().toLowerCase();
}

export function scrubPathBaseName(p: string): string {
  const n = normalizeScrubPath(p);
  const parts = n.split('/');
  return parts[parts.length - 1] || '';
}
