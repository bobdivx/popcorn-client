/**
 * True si le nom de release contient le couple saison / épisode attendu.
 * Couvre S01E05, S1E5, S01.E05 et le style très courant sur les indexeurs **1x05** (saison 1, ép. 5).
 */
export function episodeReleaseMatchesVariantName(
  seasonNum: number,
  epNum: number,
  rawName: string,
): boolean {
  const upper = (rawName || '').trim().toUpperCase();
  if (!upper) return false;

  const sPad = seasonNum.toString().padStart(2, '0');
  const ePad = epNum.toString().padStart(2, '0');
  if (new RegExp(`S\\.?${sPad}[\\s._-]?E\\.?${ePad}\\b`).test(upper)) return true;

  for (const m of upper.matchAll(/\bS\.?(\d{1,2})\s*[\s._-]?\s*E\.?(\d{1,3})\b/gi)) {
    if (parseInt(m[1], 10) === seasonNum && parseInt(m[2], 10) === epNum) return true;
  }

  for (const m of upper.matchAll(/\b(\d{1,2})X(\d{1,3})\b/gi)) {
    if (parseInt(m[1], 10) === seasonNum && parseInt(m[2], 10) === epNum) return true;
  }

  return false;
}
