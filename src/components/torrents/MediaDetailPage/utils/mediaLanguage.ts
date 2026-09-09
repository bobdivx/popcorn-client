/** Ordre d’affichage des langues média (VF d’abord). */
const LANGUAGE_ORDER: Record<string, number> = {
  FRENCH: 100,
  TRUEFRENCH: 95,
  MULTI: 90,
  VOSTFR: 80,
  SUBFRENCH: 70,
  VOST: 60,
  VO: 50,
  ENGLISH: 40,
};

const LANGUAGE_LABELS: Record<string, string> = {
  FRENCH: 'VF',
  TRUEFRENCH: 'TrueFrench',
  MULTI: 'Multi',
  VOSTFR: 'VOSTFR',
  SUBFRENCH: 'Sous-titré FR',
  VOST: 'VOST',
  VO: 'VO',
  ENGLISH: 'VO EN',
  FRANCAIS: 'VF',
  FR: 'VF',
  ENG: 'VO EN',
  DUBBED: 'Dub',
  DUB: 'Dub',
  SUB: 'SUB',
};

/** Aligné sur le parseur backend (`RE_LANGUAGE`), avec séparateurs `.` / `_` / `-`. */
const NAME_LANGUAGE_RE =
  /(?:^|[^A-Za-z])(VOSTFR|TRUEFRENCH|SUBFRENCH|VOST|MULTI|FRENCH|ENGLISH|FRANCAIS|FRANÇAIS|VO|ENG|FR|VF|VFF|VFQ|SUB|DUBBED|DUB)(?:[^A-Za-z]|$)/i;

/** Normalise une langue parsée (FRENCH, FR, VOSTFR…) vers un id stable. */
export function normalizeMediaLanguage(raw?: string | null): string | null {
  if (!raw) return null;
  const up = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!up) return null;
  if (up === 'FR' || up === 'FRANCAIS' || up === 'FRANÇAIS' || up === 'VF' || up === 'VFF' || up === 'VFQ') {
    return 'FRENCH';
  }
  if (up === 'TRUEFRENCH' || up === 'TRUE-FRENCH') return 'TRUEFRENCH';
  if (up === 'ENG' || up === 'EN') return 'ENGLISH';
  if (up === 'SUB' || up === 'SUBFR') return 'SUBFRENCH';
  if (up === 'DUB' || up === 'DUBBED') return 'DUBBED';
  return up;
}

export function mediaLanguageLabel(raw?: string | null): string {
  const id = normalizeMediaLanguage(raw);
  if (!id) return '';
  return LANGUAGE_LABELS[id] || id;
}

export function mediaLanguageSortKey(raw?: string | null): number {
  const id = normalizeMediaLanguage(raw);
  if (!id) return 0;
  return LANGUAGE_ORDER[id] ?? 10;
}

/** Extrait une langue depuis un nom de release si le champ DB est absent. */
export function extractMediaLanguageFromName(name?: string | null): string | null {
  if (!name) return null;
  const m = name.match(NAME_LANGUAGE_RE);
  return m ? normalizeMediaLanguage(m[1]) : null;
}

/** Langue d’une variante (champ top-level, quality.language, ou nom). */
export function variantMediaLanguage(variant: {
  language?: string | null;
  name?: string | null;
  quality?: { language?: string | null } | null;
}): string | null {
  return (
    normalizeMediaLanguage(variant.language || variant.quality?.language || null) ||
    extractMediaLanguageFromName(variant.name)
  );
}

/** Liste unique des langues dispo, triée. */
export function collectAvailableMediaLanguages(
  variants: Array<{
    language?: string | null;
    name?: string | null;
    quality?: { language?: string | null } | null;
  }>,
): string[] {
  const set = new Set<string>();
  for (const v of variants) {
    const lang = variantMediaLanguage(v);
    if (lang) set.add(lang);
  }
  return [...set].sort((a, b) => mediaLanguageSortKey(b) - mediaLanguageSortKey(a) || a.localeCompare(b));
}
