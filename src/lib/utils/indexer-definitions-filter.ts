/**
 * Filtrage et tri des définitions d'indexeurs pour la sélection (Settings + Setup Wizard).
 * - Recherche par nom / description
 * - Filtres optionnels par langue et pays
 * - Tri prioritaire selon la langue du site : indexeurs dans la langue de l'utilisateur en premier,
 *   puis l'autre langue principale (en/fr), puis les autres.
 */

import type { IndexerDefinition } from '../api/popcorn-web';
import type { SupportedLanguage } from '../i18n/types';

export interface FilterSortOptions {
  /** Requête de recherche (nom, description) */
  searchQuery?: string;
  /** Filtre par langue (ex: "fr", "en-US"). Vide = toutes. */
  filterLanguage?: string;
  /** Filtre par pays (ex: "FR", "US"). Vide = tous. */
  filterCountry?: string;
  /** Langue du site pour prioriser l'ordre : indexeurs dans cette langue en premier */
  userLocale?: SupportedLanguage;
  /** Si false (défaut), exclut les définitions "proxy Jackett" (isJackettProxy). Si true, affiche aussi les indexeurs Jackett. */
  useJackett?: boolean;
}

/**
 * Retourne true si def.language commence par le préfixe (ex: "fr" matche "fr", "fr-FR").
 */
function languageMatches(defLang: string | null | undefined, prefix: string): boolean {
  if (!defLang) return false;
  const lower = String(defLang).toLowerCase().trim();
  const p = String(prefix).toLowerCase();
  return lower === p || lower.startsWith(p + '-') || lower.startsWith(p + '_');
}

/**
 * Ordre de priorité pour le tri selon la locale utilisateur.
 * - userLocale 'fr' : fr d'abord, puis en, puis autres
 * - userLocale 'en' : en d'abord, puis fr, puis autres
 */
function sortPriority(def: IndexerDefinition, userLocale: SupportedLanguage): number {
  const lang = (def.language ?? '').toLowerCase().trim();
  if (!lang) return 2; // pas de langue = après les priorités
  if (userLocale === 'fr') {
    if (languageMatches(def.language, 'fr')) return 0;
    if (languageMatches(def.language, 'en')) return 1;
    return 2;
  }
  // userLocale === 'en'
  if (languageMatches(def.language, 'en')) return 0;
  if (languageMatches(def.language, 'fr')) return 1;
  return 2;
}

/**
 * Filtre et trie les définitions d'indexeurs.
 * - Filtre par searchQuery (nom + description, insensible à la casse)
 * - Filtre par filterLanguage / filterCountry si renseignés
 * - Tri : priorité selon userLocale (langue du site), puis ordre alphabétique par nom
 */
export function filterAndSortIndexerDefinitions(
  definitions: IndexerDefinition[],
  options: FilterSortOptions = {}
): IndexerDefinition[] {
  const {
    searchQuery = '',
    filterLanguage = '',
    filterCountry = '',
    userLocale = 'en',
    useJackett = false,
  } = options;

  const search = searchQuery.trim().toLowerCase();
  const filterLang = filterLanguage.trim().toLowerCase();
  const filterCtry = filterCountry.trim().toUpperCase();

  let result = definitions;

  if (!useJackett) {
    result = result.filter((def) => !def.isJackettProxy);
  }

  if (search) {
    result = result.filter((def) => {
      const name = (def.name ?? '').toLowerCase();
      const desc = (def.description ?? '').toLowerCase();
      return name.includes(search) || desc.includes(search);
    });
  }

  if (filterLang) {
    result = result.filter((def) => languageMatches(def.language, filterLang));
  }

  if (filterCtry) {
    result = result.filter((def) => {
      const c = (def.country ?? '').toUpperCase().trim();
      return c === filterCtry || c.startsWith(filterCtry + '-') || c.startsWith(filterCtry + '_');
    });
  }

  result = [...result].sort((a, b) => {
    const prioA = sortPriority(a, userLocale);
    const prioB = sortPriority(b, userLocale);
    if (prioA !== prioB) return prioA - prioB;
    return (a.name ?? '').localeCompare(b.name ?? '', undefined, { sensitivity: 'base' });
  });

  return result;
}

/**
 * Extrait les valeurs uniques de langue et pays depuis les définitions (pour les listes déroulantes).
 */
export function getUniqueLanguagesAndCountries(definitions: IndexerDefinition[]): {
  languages: string[];
  countries: string[];
} {
  const langSet = new Set<string>();
  const countrySet = new Set<string>();
  for (const def of definitions) {
    if (def.language?.trim()) {
      const normalized = def.language.trim();
      langSet.add(normalized);
    }
    if (def.country?.trim()) {
      const normalized = def.country.trim().toUpperCase();
      countrySet.add(normalized);
    }
  }
  const languages = Array.from(langSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const countries = Array.from(countrySet).sort((a, b) => a.localeCompare(b));
  return { languages, countries };
}
