/**
 * Extrait l'ID TMDB et éventuellement le type (film / série) depuis :
 * - une URL themoviedb.org (toutes langues de chemin : /fr/movie/…)
 * - ou une chaîne numérique uniquement
 */
export type ParseTmdbUserInputResult =
  | { ok: true; id: number; typeHint?: 'movie' | 'tv' }
  | { ok: false; reason: 'empty' | 'invalid' };

export function parseTmdbUserInput(raw: string): ParseTmdbUserInputResult {
  const s = raw.trim();
  if (!s) return { ok: false, reason: 'empty' };

  const lower = s.toLowerCase();

  const movieMatch = lower.match(/\/movie\/(\d+)/);
  if (movieMatch) {
    const id = parseInt(movieMatch[1], 10);
    if (Number.isFinite(id) && id > 0) return { ok: true, id, typeHint: 'movie' };
  }

  const tvMatch = lower.match(/\/tv\/(\d+)/);
  if (tvMatch) {
    const id = parseInt(tvMatch[1], 10);
    if (Number.isFinite(id) && id > 0) return { ok: true, id, typeHint: 'tv' };
  }

  const onlyDigits = /^\d+$/.test(s.replace(/\s+/g, ''));
  if (onlyDigits) {
    const id = parseInt(s.replace(/\s+/g, ''), 10);
    if (Number.isFinite(id) && id > 0) return { ok: true, id };
  }

  return { ok: false, reason: 'invalid' };
}
